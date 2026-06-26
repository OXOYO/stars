<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildDustBuffers, buildGalaxyBuffers, ownerSelfRepoId, repoLegendLanguageKey, repoStarTierKey } from '../galaxy/positions.js';
import { repoLangRgb, nebulaLangTint } from '../galaxy/colors.js';
import { createNebulaVolumeMesh, disposeNebulaSharedGeometry } from '../galaxy/nebula-volume.js';
import { createCosmicSkyMesh, sceneBackgroundColor, sceneFogColor } from '../galaxy/cosmic-background.js';
import { hashStr } from '../galaxy/hash.js';
import { hasValidGalaxyLayout, GALAXY_RUNTIME_LAYOUT_TAG } from '../galaxy/layout-payload.js';
import { LEGEND_LANG_TOP, GALAXY_ZOOM, GALAXY_MOTION, COSMIC_UNIVERSE, SCENE_FOG } from '../galaxy/constants.js';
import { GALAXY_MOTION_GLSL, applyGalaxyHubMotionJs, motionWorldPosition } from '../galaxy/motion.js';
import { createCameraTransition } from '../galaxy/camera-transition.js';
import {
  fitCameraInsideObserver,
  nudgeOrbitCamera,
  resolveDollyCameraView,
  resolveFocusCameraView,
} from '../galaxy/zoom-controls.js';
import { pickStarIndexScreen } from '../galaxy/pick.js';
import { useStarsI18n } from '../composables/useStarsI18n';
import { useStarsStore } from '../composables/useStarsStore';
import StarsGalaxyLegend from './StarsGalaxyLegend.vue';
import StarsGalaxyControls from './StarsGalaxyControls.vue';
import StarsGalaxyDetail from './StarsGalaxyDetail.vue';

const props = defineProps({
  items: { type: Array, required: true },
  focusId: { type: String, default: '' },
  isMobile: { type: Boolean, default: false },
});

const emit = defineEmits(['select']);

const { t } = useStarsI18n();
const store = useStarsStore();
const containerRef = ref(null);
const galaxyRootRef = ref(null);
const loadingScene = ref(true);
const layoutComputing = ref(false);
const legendItems = ref([]);
const starTierItems = ref([]);
const autoRotate = ref(true);
const showLegend = ref(false);
const showFocusOwnerRepo = ref(false);
/** @typedef {{ langs: string[], tiers: string[] }} GalaxyLegendFilter */

/** @returns {GalaxyLegendFilter} */
function emptyLegendFilter() {
  return { langs: [], tiers: [] };
}

function isLegendFilterActive(filter) {
  return filter.langs.length > 0 || filter.tiers.length > 0;
}
/** @type {import('vue').Ref<GalaxyLegendFilter>} */
const legendFilter = ref(emptyLegendFilter());

/** @type {Set<string>} */
let legendLangSet = new Set();
/** @type {number} */
let anchorStarIndex = -1;
/** @type {number} */
let ownerStarIndex = -1;
/** @type {THREE.Vector3 | null} */
let starFocusScratch = null;

const sceneRef = shallowRef(null);
/** @type {import('vue').ShallowRef<THREE.WebGLRenderer | null>} */
const rendererRef = shallowRef(null);

/** @type {THREE.PerspectiveCamera | null} */
let camera = null;
/** @type {OrbitControls | null} */
let controls = null;
/** @type {THREE.Group | null} */
let viewPivot = null;
/** @type {THREE.Group | null} */
let galaxyGroup = null;
/** @type {THREE.Points | null} */
let points = null;
/** @type {THREE.Points | null} */
let dust = null;
/** @type {THREE.ShaderMaterial | null} */
let pointMaterial = null;
/** @type {THREE.ShaderMaterial | null} */
let gasMaterial = null;
/** @type {THREE.ShaderMaterial | null} */
let gasDustMaterial = null;
/** @type {number | null} */
let animationId = null;
/** @type {ResizeObserver | null} */
let resizeObserver = null;
/** @type {Map<string, number>} */
let idToIndex = new Map();
/** @type {Map<string, number[]>} */
let repoIdToIndices = new Map();
/** @type {import('../galaxy/virtual-stars.js').VirtualStar[]} */
let currentVirtualStars = [];
/** @type {Float32Array | null} */
let interactionData = null;
/** @type {Array<object>} */
let currentItems = [];
/** @type {number | null} */
let hoveredIndex = null;
/** @type {number | null} */
let selectedIndex = null;
/** @type {{ position: THREE.Vector3, target: THREE.Vector3, pivotQuaternion: THREE.Quaternion } | null} */
let defaultView = null;
/** @type {boolean} */
let needsRender = true;
/** @type {number} */
let hoverRaf = 0;
/** @type {{ x: number, y: number } | null} */
let pendingHover = null;
/** @type {{ x: number, y: number, pointerId: number, button: number } | null} */
let pointerDown = null;
/** @type {boolean} */
let orbitGestureActive = false;
/** 主键按下后是否超过拖拽阈值（区分点击选星与 orbit） */
let pointerDragMoved = false;
/** @type {Map<number, { x: number, y: number }>} */
let activePointers = new Map();
/** @type {number | null} */
let lastPinchDistance = null;
/** @type {number | null} */
let middleDragLastY = null;
/** @type {number | null} */
let pointerPickIdx = null;
/** @type {{ motionSec: number, camPos: THREE.Vector3, target: THREE.Vector3 } | null} */
let pointerPickView = null;
/** 按下期间冻结星系运动，避免自转时星点漂移导致点不中 */
let galaxyMotionFrozen = false;
/** @type {ReturnType<typeof createCameraTransition> | null} */
let cameraTransition = null;
/** @type {number} */
let lastRenderMs = 0;

const DRAG_THRESHOLD_SQ = 100;
const TWINKLE_FRAME_MS = 33;

const hoverTip = ref({ x: 0, y: 0 });

const hoverLabel = computed(() => {
  const idx = hoveredIndex ?? selectedIndex;
  if (idx == null || !currentItems[idx]) return '';
  const item = currentItems[idx];
  const stars = Number(item.stars) || 0;
  const v = currentVirtualStars[idx];
  const topic = v?.topic ? ` · #${v.topic}` : '';
  return `${item.fullName} · ★ ${stars.toLocaleString()}${topic}`;
});

/** @type {number} */
let starCount = 0;
/** @type {Float32Array | null} */
let restPositions = null;
/** @type {Float32Array | null} */
let starSizes = null;
/** @type {Float32Array | null} */
let starBrights = null;
/** @type {import('../galaxy/motion.js').ReturnType<typeof import('../galaxy/motion.js').buildMotionFields> | null} */
let motionFields = null;
/** @type {number} */
let motionTimeSec = 0;
/** @type {number} */
let lastFrameMs = 0;
/** @type {Array<{ pivot: THREE.Group, geometry: THREE.BufferGeometry, hub: number[], omega: number[], omega2: number[] }>} */
let gasLangLayers = [];
/** @type {Array<{ pivot: THREE.Group, geometry: THREE.BufferGeometry, hub: number[], omega: number[], omega2: number[] }>} */
let gasDustLangLayers = [];
/** @type {THREE.Points | null} */
let fieldGasMesh = null;
/** @type {THREE.Mesh | null} */
let cosmicSky = null;
/** @type {THREE.Points | null} */
let fieldGasDustMesh = null;
/** @type {THREE.Mesh | null} */
let fieldVolumeMesh = null;
/** @type {{ value: number }} */
const nebulaVolumeTimeUniform = { value: 0 };
/** 交互中暂停自转，避免点击时星点漂移 */
let autoRotateSuspended = false;
/** 页面隐藏时暂停渲染循环；恢复后仅当 autoRotate 仍为 true 时才继续自转 */
let animationPausedByVisibility = false;

const vertexShader = `
attribute float aSize;
attribute float aBright;
attribute float aActivity;
attribute float aIndex;
attribute float aRingStar;
attribute vec3 aInteraction;
attribute vec3 color;
uniform float uTime;
uniform float uMotionTime;
uniform float uPixelRatio;
${GALAXY_MOTION_GLSL}
varying vec3 vColor;
varying float vTwinkle;
varying float vBright;
varying float vActivity;
varying float vHighlight;
varying float vIsHovered;
varying float vIsSelected;
varying float vRingStar;
varying float vFogDepth;
varying float vSpikeSeed;

void main() {
  vColor = color;
  vBright = aBright;
  vActivity = aActivity;
  vHighlight = aInteraction.x;
  vIsSelected = aInteraction.y;
  vIsHovered = aInteraction.z;
  vRingStar = aRingStar;
  vSpikeSeed = fract(aIndex * 0.618033 + aBright * 0.371);
  float act = pow(aActivity, 1.4);
  float twGate = smoothstep(0.26, 0.6, act);
  float twAmp = mix(0.0, 0.62, smoothstep(0.34, 0.9, act));
  float twSpd = mix(0.32, 2.9, smoothstep(0.38, 0.94, act));
  float phase = uTime * twSpd * 0.62 + aIndex * 1.73;
  vTwinkle = 1.0;
  if (twGate > 0.001) {
    vTwinkle = 1.0 - twAmp * twGate + twAmp * twGate * (0.5 + 0.5 * sin(phase));
    vTwinkle += act * 0.16 * twGate * sin(phase * 2.15 + aIndex * 0.41);
    float breathGate = smoothstep(0.42, 0.72, act);
    vTwinkle += breathGate * 0.07 * sin(uTime * 0.78 + aIndex * 2.1);
    float flashGate = smoothstep(0.76, 0.93, act);
    float flickPhase = floor(uTime * (0.95 + act * 2.4) + aIndex * 0.83);
    float flickRand = fract(sin(flickPhase * 127.1 + aIndex * 311.7) * 43758.5453);
    vTwinkle += step(0.87, flickRand) * flashGate * 0.38;
  }
  vec3 worldPos = applyGalaxyMotion(position);
  vec4 mvPosition = modelViewMatrix * vec4(worldPos, 1.0);
  float selectPulse = 0.86 + 0.14 * sin(uTime * 4.6 + aIndex * 0.37);
  float hoverScale = 1.0 + vIsSelected * (0.58 * selectPulse) + vIsHovered * (1.0 - vIsSelected) * 0.3;
  float distScale = clamp(${GALAXY_ZOOM.POINT_DIST_SCALE_DIV.toFixed(1)} / max(-mvPosition.z, ${GALAXY_ZOOM.POINT_VIEW_Z_MIN.toFixed(1)}), ${GALAXY_ZOOM.POINT_DIST_SCALE_MIN.toFixed(1)}, ${GALAXY_ZOOM.POINT_DIST_SCALE_MAX.toFixed(1)});
  float s = aSize * (0.36 + vBright * 0.2) * vTwinkle * hoverScale * uPixelRatio * distScale * (1.0 - aRingStar * 0.1);
  gl_PointSize = clamp(s, 0.55, ${GALAXY_ZOOM.POINT_SIZE_MAX.toFixed(1)});
  vFogDepth = max(-mvPosition.z, 0.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const fragmentShader = `
varying vec3 vColor;
varying float vTwinkle;
varying float vBright;
varying float vActivity;
varying float vHighlight;
varying float vIsHovered;
varying float vIsSelected;
varying float vRingStar;
varying float vFogDepth;
varying float vSpikeSeed;
uniform float uTime;
uniform float uDensityScale;
uniform float uFogDensity;

void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float dist = length(uv);
  float mask = 1.0 - smoothstep(0.42, 0.465, dist);
  if (mask < 0.01) discard;

  float act = pow(vActivity, 1.4);
  float twGate = smoothstep(0.26, 0.6, act);
  float dim = mix(0.28, 1.0, vHighlight);

  float core = exp(-dist * dist * 24.0);
  float halo = exp(-dist * dist * 9.0) * 0.16;
  float lum = clamp(vBright, 0.0, 1.0);
  float spikeGate = smoothstep(0.18, 0.78, lum);
  float spikeAng = vSpikeSeed * 6.28318 + lum * 1.7;
  float ca = cos(spikeAng);
  float sa = sin(spikeAng);
  vec2 ruv = vec2(uv.x * ca - uv.y * sa, uv.x * sa + uv.y * ca);
  float sx = exp(-abs(ruv.x) * 22.0) * exp(-abs(ruv.y) * 5.5);
  float sy = exp(-abs(ruv.y) * 22.0) * exp(-abs(ruv.x) * 5.5);
  float d1 = exp(-abs(ruv.x + ruv.y) * 18.0) * exp(-abs(ruv.x - ruv.y) * 7.0);
  float d2 = exp(-abs(ruv.x - ruv.y) * 18.0) * exp(-abs(ruv.x + ruv.y) * 7.0);
  float crossSpikes = (sx + sy) * spikeGate;
  float diagSpikes = (d1 + d2) * smoothstep(0.48, 0.9, lum) * 0.42;
  float spikes = (crossSpikes * 0.72 + diagSpikes) * (0.32 + lum * 0.55);

  float twinkle = mix(1.0, mix(0.72, 1.18, clamp(vTwinkle, 0.0, 1.4)), twGate);
  float breath = 1.0 + 0.04 * sin(uTime * 1.05 + act * 5.8) * smoothstep(0.38, 0.72, act);
  float pulse = 1.0 + 0.05 * sin(uTime * 1.75 + vActivity * 6.0) * smoothstep(0.5, 0.84, act);
  float flashGate = smoothstep(0.78, 0.94, act);
  float flick = fract(sin(floor(uTime * (0.85 + act * 2.0) + act * 12.0) * 127.1) * 43758.5453);
  float flashBurst = step(0.9, flick) * flashGate * 0.35;
  float actGlow = mix(0.92, 1.08, smoothstep(0.32, 0.88, act));
  float alpha = (core * 0.92 + halo + spikes) * twinkle * actGlow * pulse * breath;
  alpha *= 1.0 + flashBurst * 0.45;
  alpha *= clamp(vBright * 0.55 + 0.18, 0.14, 0.88) * mask * dim;
  alpha += spikes * 0.38 * spikeGate;

  float selectPulse = 0.86 + 0.14 * sin(uTime * 5.2 + dist * 14.0);
  float selectRing = smoothstep(0.44, 0.3, dist) * smoothstep(0.12, 0.22, dist);
  alpha += vIsSelected * (core * 0.65 + selectRing * 0.45) * selectPulse;
  alpha += vIsHovered * (1.0 - vIsSelected) * core * 0.28;
  alpha = clamp(alpha * uDensityScale, 0.0, 0.72);

  vec3 col = vColor * (0.84 + core * 0.38 + lum * 0.2);
  col += vColor * halo * 0.48;
  col += vColor * spikes * 0.62;
  vec3 hotCore = vColor * (1.0 + core * 0.22 + spikes * 0.18);
  col = mix(col, hotCore, core * 0.2 + spikes * 0.14 + vIsSelected * core * 0.32);
  col *= (0.88 + twinkle * 0.16) * pulse * breath * dim;
  col *= 1.0 + flashBurst * 0.28;
  col *= 1.0 + vIsSelected * 0.45 + vIsHovered * (1.0 - vIsSelected) * 0.22;

  float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
  vec3 fogCol = vec3(0.022, 0.034, 0.062);
  col = mix(col, fogCol, fogFactor * 0.48);
  alpha *= 1.0 - fogFactor * 0.35;

  gl_FragColor = vec4(col, alpha);
}
`;

const gasVertexShader = `
attribute float aSize;
attribute float aPhase;
attribute float aSoftness;
attribute float aDensity;
attribute float aStretch;
attribute vec3 color;
uniform float uTime;
uniform float uPixelRatio;
varying vec3 vColor;
varying float vPulse;
varying float vSoftness;
varying float vDensity;
varying float vStretch;
varying float vPhase;

void main() {
  vColor = color;
  vSoftness = aSoftness;
  vDensity = aDensity;
  vStretch = aStretch;
  vPhase = aPhase;
  float pulseRate = 0.05 + aSoftness * 0.06;
  float pulseAmp = mix(0.04, 0.02, aDensity);
  vPulse = 1.0 - pulseAmp + pulseAmp * sin(uTime * pulseRate + aPhase);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float viewZ = max(-mvPosition.z, ${GALAXY_ZOOM.GAS_VIEW_Z_MIN.toFixed(1)});
  float distScale = clamp(${GALAXY_ZOOM.GAS_DIST_SCALE_DIV.toFixed(1)} / viewZ, ${GALAXY_ZOOM.GAS_DIST_SCALE_MIN.toFixed(1)}, ${GALAXY_ZOOM.GAS_DIST_SCALE_MAX.toFixed(1)});
  float sizeMul = mix(1.02 + aSoftness * 0.58, 1.32 + aDensity * 0.26, aDensity);
  float s = aSize * sizeMul * vPulse * uPixelRatio * distScale;
  gl_PointSize = clamp(s, 1.6, ${GALAXY_ZOOM.GAS_POINT_SIZE_MAX.toFixed(1)});
  gl_Position = projectionMatrix * mvPosition;
}
`;

const gasFragmentShader = `
varying vec3 vColor;
varying float vPulse;
varying float vSoftness;
varying float vDensity;
varying float vStretch;
varying float vPhase;

void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float filAngle = vPhase * 0.318309;
  float ca = cos(filAngle);
  float sa = sin(filAngle);
  uv = vec2(uv.x * ca - uv.y * sa, uv.x * sa + uv.y * ca);
  uv.x *= 1.0 + vStretch * 0.85;
  float dist = length(uv);
  if (dist > 0.5) discard;

  float veil = exp(-dist * dist * (0.12 + vSoftness * 0.1));
  float haze = exp(-dist * dist * (0.28 + vSoftness * 0.18));
  float body = exp(-dist * dist * (0.62 + vSoftness * 0.28));
  float sprite = veil * 0.42 + haze * 0.38 + body * 0.28;
  float cloud = sprite * mix(0.34, 0.82, vDensity);
  float ionFront = smoothstep(0.1, 0.38, cloud) * (1.0 - smoothstep(0.48, 0.82, cloud));

  vec3 lang = clamp(vColor, 0.0, 1.0);
  vec3 oiii = vec3(0.08, 0.52, 0.46) + lang * 0.38;
  vec3 halpha = vec3(0.82, 0.22, 0.38) + lang * 0.42;
  vec3 hiiGold = vec3(0.92, 0.72, 0.32) + lang * 0.22;
  vec3 deepTeal = vec3(0.04, 0.16, 0.22) + lang * 0.12;
  vec3 emit = mix(deepTeal, oiii, smoothstep(0.05, 0.4, vDensity));
  emit = mix(emit, halpha, smoothstep(0.26, 0.7, vDensity));
  emit = mix(emit, hiiGold, ionFront * 0.72);

  float alpha = cloud * 0.024 * vPulse;
  alpha += ionFront * 0.03;
  alpha *= smoothstep(0.5, 0.025, dist);
  alpha = clamp(alpha, 0.0, 0.095);

  vec3 col = emit * (0.48 + cloud * 0.62 + ionFront * 0.32);
  col = col / (1.0 + col * 0.48);
  gl_FragColor = vec4(col, alpha);
}
`;

const gasDustVertexShader = `
attribute float aSize;
attribute float aDensity;
attribute vec3 color;
uniform float uPixelRatio;
varying vec3 vColor;
varying vec3 vLocalPos;
varying float vDensity;

void main() {
  vLocalPos = position;
  vColor = color;
  vDensity = aDensity;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float viewZ = max(-mvPosition.z, ${GALAXY_ZOOM.GAS_VIEW_Z_MIN.toFixed(1)});
  float distScale = clamp(${GALAXY_ZOOM.GAS_DIST_SCALE_DIV.toFixed(1)} / viewZ, ${GALAXY_ZOOM.GAS_DIST_SCALE_MIN.toFixed(1)}, ${GALAXY_ZOOM.GAS_DIST_SCALE_MAX.toFixed(1)});
  float s = aSize * uPixelRatio * distScale;
  gl_PointSize = clamp(s, 0.8, ${GALAXY_ZOOM.GAS_DUST_POINT_SIZE_MAX.toFixed(1)});
  gl_Position = projectionMatrix * mvPosition;
}
`;

const gasDustFragmentShader = `
varying vec3 vColor;
varying vec3 vLocalPos;
varying float vDensity;

float dHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float dist = length(uv);
  if (dist > 0.5) discard;
  float n = dHash(vLocalPos * 0.05);
  float body = exp(-dist * dist * 1.1);
  float veil = exp(-dist * dist * 0.38);
  float alpha = (veil * 0.05 + body * 0.04) * (0.08 + vDensity * 0.2);
  alpha *= mix(0.65, 1.0, n);
  alpha *= smoothstep(0.5, 0.08, dist);
  alpha = clamp(alpha, 0.0, 0.14);
  gl_FragColor = vec4(vColor, alpha);
}
`;

function sceneBackground() {
  return sceneBackgroundColor();
}

function markRender() {
  needsRender = true;
}

function itemMatchesLegendFilter(item) {
  const filter = legendFilter.value;
  if (!isLegendFilterActive(filter)) return true;
  if (filter.tiers.length > 0 && !filter.tiers.includes(repoStarTierKey(item.stars))) {
    return false;
  }
  if (filter.langs.length > 0 && !filter.langs.includes(repoLegendLanguageKey(item, legendLangSet))) {
    return false;
  }
  return true;
}

function syncLegendHighlight() {
  if (!points || starCount <= 0) return;
  const attr = points.geometry.getAttribute('aInteraction');
  if (!attr) return;
  const arr = attr.array;
  const active = isLegendFilterActive(legendFilter.value);
  for (let i = 0; i < starCount; i += 1) {
    arr[i * 3] = !active || itemMatchesLegendFilter(currentItems[i]) ? 1 : 0;
  }
  attr.needsUpdate = true;
  markRender();
}

function toggleLegendLang(name) {
  const langs = legendFilter.value.langs.slice();
  const idx = langs.indexOf(name);
  if (idx >= 0) langs.splice(idx, 1);
  else langs.push(name);
  legendFilter.value = { ...legendFilter.value, langs };
  syncLegendHighlight();
}

function toggleLegendTier(key) {
  const tiers = legendFilter.value.tiers.slice();
  const idx = tiers.indexOf(key);
  if (idx >= 0) tiers.splice(idx, 1);
  else tiers.push(key);
  legendFilter.value = { ...legendFilter.value, tiers };
  syncLegendHighlight();
}

function clearLegendFilter() {
  legendFilter.value = emptyLegendFilter();
  syncLegendHighlight();
}

function onLegendSelectLang(name) {
  toggleLegendLang(name);
}

function onLegendSelectTier(key) {
  toggleLegendTier(key);
}

function getMotionTimeSec() {
  return motionTimeSec;
}

function suspendGalaxyMotion() {
  galaxyMotionFrozen = true;
  autoRotateSuspended = true;
  if (controls) controls.autoRotate = false;
}

function syncAutoRotateAfterInteraction() {
  if (pointerDown || orbitGestureActive) return;
  galaxyMotionFrozen = false;
  autoRotateSuspended = false;
  if (controls && autoRotate.value) controls.autoRotate = true;
}

function clearPointerPick() {
  pointerPickIdx = null;
  pointerPickView = null;
}

function snapshotPickView() {
  if (!camera || !controls) return null;
  return {
    motionSec: motionTimeSec,
    camPos: camera.position.clone(),
    target: controls.target.clone(),
  };
}

function pickIndexWithView(clientX, clientY, view) {
  if (!view || !camera || !controls) return pickIndex(clientX, clientY, view?.motionSec);
  const savedPos = camera.position.clone();
  const savedTarget = controls.target.clone();
  camera.position.copy(view.camPos);
  controls.target.copy(view.target);
  camera.lookAt(controls.target);
  camera.updateMatrixWorld(true);
  const idx = pickIndex(clientX, clientY, view.motionSec);
  camera.position.copy(savedPos);
  controls.target.copy(savedTarget);
  camera.lookAt(controls.target);
  camera.updateMatrixWorld(true);
  controls.update();
  return idx;
}

function resolveStarLocalPosition(index) {
  if (!restPositions || index < 0 || index >= starCount) return null;
  const rx = restPositions[index * 3];
  const ry = restPositions[index * 3 + 1];
  const rz = restPositions[index * 3 + 2];
  if (motionFields) {
    return motionWorldPosition(rx, ry, rz, motionFields, index, getMotionTimeSec());
  }
  return [rx, ry, rz];
}

function starWorldPosition(index) {
  const local = resolveStarLocalPosition(index);
  if (!local || !points) return null;
  if (!starFocusScratch) starFocusScratch = new THREE.Vector3();
  starFocusScratch.set(local[0], local[1], local[2]);
  if (viewPivot) viewPivot.updateMatrixWorld(true);
  if (galaxyGroup) galaxyGroup.updateMatrixWorld(true);
  points.updateMatrixWorld(true);
  return points.localToWorld(starFocusScratch.clone());
}

function cancelCameraTransition() {
  if (cameraTransition?.active) {
    cameraTransition.cancel();
    autoRotateSuspended = false;
  }
}

/** @param {{ position: THREE.Vector3, target: THREE.Vector3 }} view */
function animateCameraTo(view, durationMs, onComplete) {
  if (!controls || !camera || !cameraTransition || !view) return;
  autoRotateSuspended = true;
  cameraTransition.start(controls, camera, view, {
    durationMs,
    onComplete: () => {
      autoRotateSuspended = false;
      onComplete?.();
      markRender();
    },
  });
  markRender();
}

function animateDolly(notches, durationMs = GALAXY_ZOOM.CAMERA_DOLLY_MS) {
  if (!controls || !camera) return;
  const view = resolveDollyCameraView(controls, camera, notches);
  if (!view) return;
  animateCameraTo(view, durationMs);
}

function focusStarByIndex(index, opts = {}) {
  const { emitSelect = true } = opts;
  if (!controls || !camera || index < 0 || index >= starCount) return;
  const world = starWorldPosition(index);
  if (!world) return;

  const aSize = starSizes?.[index] ?? points?.geometry?.getAttribute('aSize')?.array?.[index] ?? 1;
  const bright = starBrights?.[index] ?? 0.5;
  const pixelRatio = rendererRef.value?.getPixelRatio() ?? 1;

  const view = resolveFocusCameraView(controls, camera, world, { aSize, bright, pixelRatio });
  animateCameraTo(view, GALAXY_ZOOM.CAMERA_FOCUS_MS);
  const item = currentItems[index];
  if (item) {
    syncSelectedIndex(item.id);
    if (emitSelect) emit('select', item);
  }
}

function focusCenterStar() {
  if (anchorStarIndex >= 0) {
    focusStarByIndex(anchorStarIndex);
    return;
  }
  if (controls && camera) {
    const view = resolveFocusCameraView(controls, camera, new THREE.Vector3(0, 0, 0), { span: 6 });
    animateCameraTo(view, GALAXY_ZOOM.CAMERA_FOCUS_MS);
  }
}

function focusGalaxySelected() {
  const id = store.galaxySelected?.id ?? props.focusId;
  if (!id || !controls || !camera) return;
  const idx = idToIndex.get(id);
  if (idx != null && idx >= 0) {
    focusStarByIndex(idx, { emitSelect: false });
  }
}

function focusOwnerStar() {
  if (ownerStarIndex >= 0) focusStarByIndex(ownerStarIndex);
}

function initScene() {
  const el = containerRef.value;
  if (!el) return;

  const width = el.clientWidth || 640;
  const height = el.clientHeight || 480;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(sceneBackground());
  scene.fog = new THREE.FogExp2(sceneFogColor(), SCENE_FOG.DENSITY);
  sceneRef.value = scene;

  cosmicSky = createCosmicSkyMesh();
  scene.add(cosmicSky);

  viewPivot = new THREE.Group();
  scene.add(viewPivot);

  galaxyGroup = new THREE.Group();
  galaxyGroup.rotation.x = 0;
  viewPivot.add(galaxyGroup);

  camera = new THREE.PerspectiveCamera(48, width / height, 0.05, 8000);
  camera.position.set(0, 0, 1.0);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
  renderer.setSize(width, height);
  el.appendChild(renderer.domElement);
  rendererRef.value = renderer;

  cameraTransition = createCameraTransition();

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enableRotate = true;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.minPolarAngle = 0.12;
  controls.maxPolarAngle = Math.PI * 0.78;
  controls.minDistance = GALAXY_ZOOM.MIN_DISTANCE;
  controls.maxDistance = GALAXY_ZOOM.MAX_DISTANCE;
  controls.target.set(0, 0, 0);
  controls.enableZoom = false;
  controls.autoRotate = autoRotate.value;
  controls.autoRotateSpeed = GALAXY_ZOOM.AUTO_ROTATE_SPEED ?? 0.32;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: null,
    RIGHT: THREE.MOUSE.PAN,
  };
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: null,
  };
  controls.addEventListener('start', () => {
    cancelCameraTransition();
    orbitGestureActive = true;
    suspendGalaxyMotion();
    renderer.domElement.style.cursor = 'grabbing';
    markRender();
  });
  controls.addEventListener('change', () => {
    markRender();
  });
  controls.addEventListener('end', () => {
    orbitGestureActive = false;
    renderer.domElement.style.cursor = 'grab';
    syncAutoRotateAfterInteraction();
    markRender();
  });

  pointMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMotionTime: { value: 0 },
      uPixelRatio: { value: renderer.getPixelRatio() },
      uDensityScale: { value: 1 },
      uFogDensity: { value: SCENE_FOG.DENSITY },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });

  gasMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: renderer.getPixelRatio() },
    },
    vertexShader: gasVertexShader,
    fragmentShader: gasFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  gasDustMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: renderer.getPixelRatio() },
    },
    vertexShader: gasDustVertexShader,
    fragmentShader: gasDustFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });

  const dustMaterial = new THREE.PointsMaterial({
    color: 0x6a7a9a,
    size: 0.12,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.11,
    depthWrite: false,
    fog: false,
  });

  const dustBuffers = buildDustBuffers(720);
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustBuffers.positions, 3));
  dust = new THREE.Points(dustGeometry, dustMaterial);
  dust.name = 'dust';
  galaxyGroup.add(dust);

  renderer.domElement.addEventListener('pointerdown', onPointerDown, { capture: true });
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointercancel', onPointerCancel);
  renderer.domElement.addEventListener('pointerleave', onCanvasLeave);
  renderer.domElement.addEventListener('wheel', onGalaxyWheel, { passive: false });
  renderer.domElement.addEventListener('auxclick', onGalaxyAuxClick);
  renderer.domElement.style.cursor = 'grab';

  resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(el);

  markRender();
}

function resize() {
  const el = containerRef.value;
  const renderer = rendererRef.value;
  if (!el || !renderer || !camera) return;
  const width = el.clientWidth;
  const height = el.clientHeight;
  if (width <= 0 || height <= 0) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  if (pointMaterial) {
    pointMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  }
  if (gasMaterial) {
    gasMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  }
  if (gasDustMaterial) {
    gasDustMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  }
  markRender();
}

function syncRepoHighlightMask(channelOffset, repoId) {
  if (!interactionData) return;
  for (let i = 0; i < starCount; i += 1) {
    interactionData[i * 3 + channelOffset] = 0;
  }
  if (!repoId) return;
  const indices = repoIdToIndices.get(repoId);
  if (!indices) return;
  for (const i of indices) {
    if (i >= 0 && i < starCount) interactionData[i * 3 + channelOffset] = 1;
  }
}

function syncSelectedIndex(id) {
  if (!id) {
    selectedIndex = null;
  } else {
    selectedIndex = idToIndex.get(id) ?? null;
  }
  syncRepoHighlightMask(1, id || '');
  const attr = points?.geometry?.getAttribute('aInteraction');
  if (attr) attr.needsUpdate = true;
  markRender();
}

function setHoverIndex(idx, clientX, clientY) {
  hoveredIndex = idx;
  if (idx != null && currentItems[idx]?.id) {
    syncRepoHighlightMask(2, currentItems[idx].id);
  } else if (interactionData) {
    for (let i = 0; i < starCount; i += 1) interactionData[i * 3 + 2] = 0;
  }
  const hoverAttr = points?.geometry?.getAttribute('aInteraction');
  if (hoverAttr) hoverAttr.needsUpdate = true;
  const el = containerRef.value;
  if (el && clientX != null && clientY != null) {
    const rect = el.getBoundingClientRect();
    hoverTip.value = {
      x: clientX - rect.left + 14,
      y: clientY - rect.top + 14,
    };
  }
  markRender();
}

function saveDefaultView() {
  if (!camera || !controls) return;
  defaultView = {
    position: camera.position.clone(),
    target: controls.target.clone(),
    pivotQuaternion: viewPivot ? viewPivot.quaternion.clone() : new THREE.Quaternion(),
  };
}

function resetViewPivot() {
  if (!viewPivot) return;
  viewPivot.rotation.set(0, 0, 0);
  viewPivot.quaternion.set(0, 0, 0, 1);
}

function syncMotionAttributes(buffers) {
  starCount = buffers.count;
  const densityScale = 1 / Math.sqrt(Math.max(buffers.count, 1) / 4200);
  if (pointMaterial) {
    pointMaterial.uniforms.uDensityScale.value = Math.max(0.2, Math.min(1, densityScale));
  }
  restPositions = buffers.positions;
  starSizes = buffers.sizes;
  starBrights = buffers.brights;
  motionFields = buffers.motion ?? null;
}

function syncPickPositions() {
  if (!points || !restPositions || starCount <= 0) return;
  const posAttr = points.geometry.getAttribute('position');
  if (!posAttr || posAttr.array.length !== restPositions.length) return;
  posAttr.array.set(restPositions);
  posAttr.needsUpdate = true;
}

function canUsePrecomputedLayout() {
  return hasValidGalaxyLayout(store.galaxyLayout) && store.galaxyVirtualIndexMap.size > 0;
}

function buildGalaxyBuffersForItems(items) {
  if (canUsePrecomputedLayout()) {
    return buildGalaxyBuffers(items, {
      layout: store.galaxyLayout,
      virtualIndexMap: store.galaxyVirtualIndexMap,
    });
  }
  return buildGalaxyBuffers(items);
}

function refreshGalaxyShaderSources() {
  if (pointMaterial) {
    pointMaterial.vertexShader = vertexShader;
    pointMaterial.fragmentShader = fragmentShader;
    pointMaterial.needsUpdate = true;
  }
  if (gasMaterial) {
    gasMaterial.vertexShader = gasVertexShader;
    gasMaterial.fragmentShader = gasFragmentShader;
    gasMaterial.needsUpdate = true;
  }
}

function runGalaxyRebuild(items) {
  refreshGalaxyShaderSources();
  const run = () => {
    try {
      const buffers = buildGalaxyBuffersForItems(items);
      store.setGalaxyRenderStats({
        layoutVersion: store.galaxyLayout?.version ?? 0,
        pointCount: buffers.count,
        precomputed: canUsePrecomputedLayout(),
      });
      applyBuffers(buffers);
    } finally {
      layoutComputing.value = false;
      markRender();
    }
  };

  if (canUsePrecomputedLayout()) {
    run();
    return;
  }

  layoutComputing.value = true;
  markRender();
  window.setTimeout(run, 0);
}

function rebuildGalaxy(items) {
  if (!sceneRef.value) return;
  runGalaxyRebuild(items);
}

function disposeGasLangLayers() {
  for (const layer of gasLangLayers) {
    if (galaxyGroup) galaxyGroup.remove(layer.pivot);
    layer.geometry.dispose();
  }
  gasLangLayers = [];
  for (const layer of gasDustLangLayers) {
    if (galaxyGroup) galaxyGroup.remove(layer.pivot);
    layer.geometry.dispose();
  }
  gasDustLangLayers = [];
  if (fieldGasMesh) {
    if (galaxyGroup) galaxyGroup.remove(fieldGasMesh);
    fieldGasMesh.geometry.dispose();
    fieldGasMesh = null;
  }
  if (fieldGasDustMesh) {
    if (galaxyGroup) galaxyGroup.remove(fieldGasDustMesh);
    fieldGasDustMesh.geometry.dispose();
    fieldGasDustMesh = null;
  }
  if (fieldVolumeMesh) {
    if (galaxyGroup) galaxyGroup.remove(fieldVolumeMesh);
    fieldVolumeMesh = null;
  }
}

function updateGasLangLayers() {
  if (!gasLangLayers.length && !gasDustLangLayers.length) return;
  const t = motionTimeSec;
  for (const layer of gasLangLayers) {
    const { pivot, hub, omega, omega2 } = layer;
    const origin = applyGalaxyHubMotionJs(hub[0], hub[1], hub[2], hub, omega, omega2, t);
    pivot.position.set(origin[0], origin[1], origin[2]);
  }
  for (const layer of gasDustLangLayers) {
    const { pivot, hub, omega, omega2 } = layer;
    const origin = applyGalaxyHubMotionJs(hub[0], hub[1], hub[2], hub, omega, omega2, t);
    pivot.position.set(origin[0], origin[1], origin[2]);
  }
}

function syncGasClouds(gasBuffers) {
  if (!galaxyGroup || !gasMaterial) return;

  disposeGasLangLayers();
  if (!gasBuffers?.count) return;

  const langs = gasBuffers.languages || [];
  const langMotions = gasBuffers.langMotions || [];
  const langRadii = gasBuffers.langRadii || [];
  const perGalaxy = gasBuffers.perGalaxy || COSMIC_UNIVERSE.GAS_PARTICLES_PER_GALAXY;
  const corePerGalaxy = gasBuffers.corePerGalaxy ?? COSMIC_UNIVERSE.GAS_CORE_FILL_COUNT ?? 0;
  const particlesPerLayer = perGalaxy + corePerGalaxy;

  let offset = 0;
  if (langs.length && langMotions.length) {
    for (let li = 0; li < langs.length; li += 1) {
      const motion = langMotions[li];
      if (!motion?.hub) continue;
      const hub = motion.hub;
      const localPos = new Float32Array(particlesPerLayer * 3);
      const colors = new Float32Array(particlesPerLayer * 3);
      const sizes = new Float32Array(particlesPerLayer);
      const phases = new Float32Array(particlesPerLayer);
      const softness = new Float32Array(particlesPerLayer);
      const density = new Float32Array(particlesPerLayer);
      const stretch = new Float32Array(particlesPerLayer);

      for (let j = 0; j < particlesPerLayer; j += 1) {
        const i = offset + j;
        localPos[j * 3] = gasBuffers.positions[i * 3] - hub[0];
        localPos[j * 3 + 1] = gasBuffers.positions[i * 3 + 1] - hub[1];
        localPos[j * 3 + 2] = gasBuffers.positions[i * 3 + 2] - hub[2];
        colors[j * 3] = gasBuffers.colors[i * 3];
        colors[j * 3 + 1] = gasBuffers.colors[i * 3 + 1];
        colors[j * 3 + 2] = gasBuffers.colors[i * 3 + 2];
        sizes[j] = gasBuffers.sizes[i];
        phases[j] = gasBuffers.phases[i];
        softness[j] = gasBuffers.softness?.[i] ?? 0.7;
        density[j] = gasBuffers.density?.[i] ?? 0.5;
        stretch[j] = gasBuffers.stretch?.[i] ?? 0.2;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(localPos, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
      geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
      geometry.setAttribute('aSoftness', new THREE.BufferAttribute(softness, 1));
      geometry.setAttribute('aDensity', new THREE.BufferAttribute(density, 1));
      geometry.setAttribute('aStretch', new THREE.BufferAttribute(stretch, 1));

      const pivot = new THREE.Group();
      pivot.name = `gas-${langs[li]}`;

      const gR = langRadii[li] ?? 36;
      const ellipsoid = [gR * 1.52, gR * 1.22, gR * 1.42];
      const langTint = nebulaLangTint(repoLangRgb(langs[li]), 0.58);
      const volSeed = (hashStr(`nebula-vol:${langs[li]}`) % 10000) / 10000;
      const volumeMesh = createNebulaVolumeMesh(langTint, ellipsoid, volSeed, {
        uTime: nebulaVolumeTimeUniform,
      });
      pivot.add(volumeMesh);

      const points = new THREE.Points(geometry, gasMaterial);
      pivot.add(points);
      pivot.renderOrder = -2;
      galaxyGroup.add(pivot);

      gasLangLayers.push({
        pivot,
        geometry,
        hub: hub.slice(),
        omega: motion.omega.slice(),
        omega2: motion.omega2.slice(),
      });
      offset += particlesPerLayer;
    }
  }

  const fieldStart = gasBuffers.fieldGasStart ?? offset;
  const fieldCount = gasBuffers.fieldGasCount ?? Math.max(0, gasBuffers.count - fieldStart);
  if (fieldCount > 0) {
    const localPos = new Float32Array(fieldCount * 3);
    const colors = new Float32Array(fieldCount * 3);
    const sizes = new Float32Array(fieldCount);
    const phases = new Float32Array(fieldCount);
    const softness = new Float32Array(fieldCount);
    const density = new Float32Array(fieldCount);
    const stretch = new Float32Array(fieldCount);

    for (let j = 0; j < fieldCount; j += 1) {
      const i = fieldStart + j;
      localPos[j * 3] = gasBuffers.positions[i * 3];
      localPos[j * 3 + 1] = gasBuffers.positions[i * 3 + 1];
      localPos[j * 3 + 2] = gasBuffers.positions[i * 3 + 2];
      colors[j * 3] = gasBuffers.colors[i * 3];
      colors[j * 3 + 1] = gasBuffers.colors[i * 3 + 1];
      colors[j * 3 + 2] = gasBuffers.colors[i * 3 + 2];
      sizes[j] = gasBuffers.sizes[i];
      phases[j] = gasBuffers.phases[i];
      softness[j] = gasBuffers.softness?.[i] ?? 0.62;
      density[j] = gasBuffers.density?.[i] ?? 0.38;
      stretch[j] = gasBuffers.stretch?.[i] ?? 0.08;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(localPos, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute('aSoftness', new THREE.BufferAttribute(softness, 1));
    geometry.setAttribute('aDensity', new THREE.BufferAttribute(density, 1));
    geometry.setAttribute('aStretch', new THREE.BufferAttribute(stretch, 1));

    fieldGasMesh = new THREE.Points(geometry, gasMaterial);
    fieldGasMesh.name = 'field-gas';
    fieldGasMesh.renderOrder = -3;
    galaxyGroup.add(fieldGasMesh);
  }

  const fieldVolumeRadius = gasBuffers.fieldVolumeRadius ?? 0;
  if (fieldVolumeRadius > 0) {
    const fieldTint = nebulaLangTint([0.42, 0.52, 0.62], 0.42);
    fieldVolumeMesh = createNebulaVolumeMesh(
      fieldTint,
      [fieldVolumeRadius * 1.12, fieldVolumeRadius * 0.92, fieldVolumeRadius * 1.06],
      0.37,
      { uTime: nebulaVolumeTimeUniform },
      { isField: true }
    );
    fieldVolumeMesh.name = 'field-nebula-volume';
    fieldVolumeMesh.renderOrder = -6;
    galaxyGroup.add(fieldVolumeMesh);
  }

  updateGasLangLayers();
}

function syncGasDustClouds(gasDustBuffers) {
  if (!galaxyGroup || !gasDustMaterial || !gasDustBuffers?.count) return;

  const langs = gasDustBuffers.languages || [];
  const langMotions = gasDustBuffers.langMotions || [];
  const perGalaxy = gasDustBuffers.perGalaxy || COSMIC_UNIVERSE.GAS_DUST_PER_GALAXY || 0;

  let offset = 0;
  if (langs.length && langMotions.length) {
    for (let li = 0; li < langs.length; li += 1) {
      const motion = langMotions[li];
      if (!motion?.hub) continue;
      const hub = motion.hub;
      const localPos = new Float32Array(perGalaxy * 3);
      const colors = new Float32Array(perGalaxy * 3);
      const sizes = new Float32Array(perGalaxy);
      const density = new Float32Array(perGalaxy);

      for (let j = 0; j < perGalaxy; j += 1) {
        const i = offset + j;
        localPos[j * 3] = gasDustBuffers.positions[i * 3] - hub[0];
        localPos[j * 3 + 1] = gasDustBuffers.positions[i * 3 + 1] - hub[1];
        localPos[j * 3 + 2] = gasDustBuffers.positions[i * 3 + 2] - hub[2];
        colors[j * 3] = gasDustBuffers.colors[i * 3];
        colors[j * 3 + 1] = gasDustBuffers.colors[i * 3 + 1];
        colors[j * 3 + 2] = gasDustBuffers.colors[i * 3 + 2];
        sizes[j] = gasDustBuffers.sizes[i];
        density[j] = gasDustBuffers.density?.[i] ?? 0.5;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(localPos, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
      geometry.setAttribute('aDensity', new THREE.BufferAttribute(density, 1));

      const pivot = new THREE.Group();
      pivot.name = `gas-dust-${langs[li]}`;
      const points = new THREE.Points(geometry, gasDustMaterial);
      pivot.add(points);
      pivot.renderOrder = -4;
      galaxyGroup.add(pivot);

      gasDustLangLayers.push({
        pivot,
        geometry,
        hub: hub.slice(),
        omega: motion.omega.slice(),
        omega2: motion.omega2.slice(),
      });
      offset += perGalaxy;
    }
  }

  const fieldStart = gasDustBuffers.fieldDustStart ?? offset;
  const fieldCount = gasDustBuffers.fieldDustCount ?? Math.max(0, gasDustBuffers.count - fieldStart);
  if (fieldCount > 0) {
    const localPos = new Float32Array(fieldCount * 3);
    const colors = new Float32Array(fieldCount * 3);
    const sizes = new Float32Array(fieldCount);
    const density = new Float32Array(fieldCount);

    for (let j = 0; j < fieldCount; j += 1) {
      const i = fieldStart + j;
      localPos[j * 3] = gasDustBuffers.positions[i * 3];
      localPos[j * 3 + 1] = gasDustBuffers.positions[i * 3 + 1];
      localPos[j * 3 + 2] = gasDustBuffers.positions[i * 3 + 2];
      colors[j * 3] = gasDustBuffers.colors[i * 3];
      colors[j * 3 + 1] = gasDustBuffers.colors[i * 3 + 1];
      colors[j * 3 + 2] = gasDustBuffers.colors[i * 3 + 2];
      sizes[j] = gasDustBuffers.sizes[i];
      density[j] = gasDustBuffers.density?.[i] ?? 0.4;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(localPos, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aDensity', new THREE.BufferAttribute(density, 1));

    fieldGasDustMesh = new THREE.Points(geometry, gasDustMaterial);
    fieldGasDustMesh.name = 'field-gas-dust';
    fieldGasDustMesh.renderOrder = -5;
    galaxyGroup.add(fieldGasDustMesh);
  }

  updateGasLangLayers();
}

function applyBuffers(buffers) {
  const scene = sceneRef.value;
  if (!scene || !pointMaterial || !galaxyGroup) return;

  idToIndex = buffers.idToIndex;
  repoIdToIndices = buffers.repoIdToIndices ?? new Map();
  currentVirtualStars = buffers.virtualStars ?? [];
  currentItems = buffers.items;
  legendItems.value = buffers.legend.slice(0, LEGEND_LANG_TOP);
  starTierItems.value = buffers.starTiers;
  legendLangSet = new Set(legendItems.value.map((row) => row.name));
  anchorStarIndex = buffers.anchorIndex ?? -1;
  const selfRepoId = ownerSelfRepoId(store.owner);
  const ownerIndices = selfRepoId ? repoIdToIndices.get(selfRepoId) : null;
  ownerStarIndex = ownerIndices?.[0] ?? -1;
  showFocusOwnerRepo.value = ownerStarIndex >= 0;
  legendFilter.value = emptyLegendFilter();
  setHoverIndex(null);
  syncSelectedIndex(props.focusId || '');

  if (points) {
    galaxyGroup.remove(points);
    points.geometry.dispose();
    points = null;
  }

  if (buffers.count === 0) {
    starCount = 0;
    restPositions = null;
    motionFields = null;
    syncGasClouds(buffers.gas);
    syncGasDustClouds(buffers.gasDust);
    return;
  }

  syncGasClouds(buffers.gas);
  syncGasDustClouds(buffers.gasDust);

  syncMotionAttributes(buffers);

  interactionData = new Float32Array(buffers.count * 3);
  for (let i = 0; i < buffers.count; i += 1) {
    interactionData[i * 3] = 1;
    interactionData[i * 3 + 1] = 0;
    interactionData[i * 3 + 2] = 0;
  }

  const indices = new Float32Array(buffers.count);
  for (let i = 0; i < buffers.count; i += 1) {
    indices[i] = i;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(buffers.positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(buffers.colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(buffers.sizes, 1));
  geometry.setAttribute('aBright', new THREE.BufferAttribute(buffers.brights, 1));
  geometry.setAttribute('aActivity', new THREE.BufferAttribute(buffers.activities, 1));
  geometry.setAttribute('aInteraction', new THREE.BufferAttribute(interactionData, 3));
  geometry.setAttribute('aIndex', new THREE.BufferAttribute(indices, 1));
  const ringFlags = buffers.ringStarFlags ?? new Float32Array(buffers.count);
  geometry.setAttribute('aRingStar', new THREE.BufferAttribute(ringFlags, 1));

  const motion = buffers.motion;
  if (motion) {
    geometry.setAttribute('aGalaxyHub', new THREE.BufferAttribute(motion.galaxyHubs, 3));
    geometry.setAttribute('aNebulaCenter', new THREE.BufferAttribute(motion.nebulaCenters, 3));
    geometry.setAttribute('aMotionOmega', new THREE.BufferAttribute(motion.motionOmega, 4));
    geometry.setAttribute('aMotionOmega2', new THREE.BufferAttribute(motion.motionOmega2, 4));
    const bobAttr = new Float32Array(motion.yBobAmp.length * 2);
    for (let i = 0; i < motion.yBobAmp.length; i += 1) {
      bobAttr[i * 2] = motion.yBobAmp[i];
      bobAttr[i * 2 + 1] = motion.yBobPhase[i];
    }
    geometry.setAttribute('aMotionBob', new THREE.BufferAttribute(bobAttr, 2));
  }

  points = new THREE.Points(geometry, pointMaterial);
  points.name = 'repos';
  galaxyGroup.add(points);

  fitCamera(buffers.positions, buffers.count);
  resetViewPivot();
  if (galaxyGroup) galaxyGroup.rotation.y = 0;
  syncPickPositions();
  syncSelectedIndex(props.focusId || '');
  if (props.focusId) {
    const idx = idToIndex.get(props.focusId);
    if (idx != null && idx >= 0) focusStarByIndex(idx, { emitSelect: false });
  }
  markRender();
}

function fitCamera(positions, count) {
  if (!camera || !controls || count === 0) return;
  fitCameraInsideObserver(controls, camera, positions, count, { padding: 0.76 });
  resetViewPivot();
  if (galaxyGroup) galaxyGroup.rotation.y = 0;
  saveDefaultView();
}

/** 同步选中高亮（不移动相机） */
function highlightItem(id) {
  syncSelectedIndex(id);
}

function pickIndex(clientX, clientY, motionSecOverride) {
  const renderer = rendererRef.value;
  if (!renderer || !camera || !points || !restPositions || starCount <= 0) return null;

  const rect = renderer.domElement.getBoundingClientRect();
  if (viewPivot) viewPivot.updateMatrixWorld(true);
  if (galaxyGroup) galaxyGroup.updateMatrixWorld(true);

  const idx = pickStarIndexScreen({
    camera,
    points,
    restPositions,
    starCount,
    clientX,
    clientY,
    canvasRect: rect,
    sizes: starSizes,
    brights: starBrights,
    pixelRatio: renderer.getPixelRatio(),
    motionFields,
    motionTimeSec: motionSecOverride ?? getMotionTimeSec(),
  });
  if (idx == null || idx < 0 || idx >= currentItems.length) return null;
  return idx;
}

function pinchPointerDistance() {
  if (activePointers.size < 2) return null;
  const pts = [...activePointers.values()];
  const dx = pts[0].x - pts[1].x;
  const dy = pts[0].y - pts[1].y;
  return Math.hypot(dx, dy);
}

function syncControlsForPointerCount() {
  if (!controls) return;
  controls.enabled = activePointers.size < 2;
}

function isGalaxyKeyboardContext() {
  if (store.viewMode !== 'galaxy') return false;
  const el = document.activeElement;
  if (!el) return true;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
  if (el.isContentEditable) return false;
  return true;
}

function onGalaxyKeyDown(event) {
  if (!isGalaxyKeyboardContext() || !controls || !camera) return;

  const key = event.key;
  if (key === '+' || key === '=') {
    event.preventDefault();
    zoomIn();
    return;
  }
  if (key === '-' || key === '_') {
    event.preventDefault();
    zoomOut();
    return;
  }
  if (key === 'r' || key === 'R') {
    event.preventDefault();
    resetView();
    return;
  }
  if (key === 'ArrowLeft') {
    event.preventDefault();
    cancelCameraTransition();
    nudgeOrbitCamera(controls, camera, GALAXY_ZOOM.KEYBOARD_ORBIT_AZIMUTH, 0);
    markRender();
    return;
  }
  if (key === 'ArrowRight') {
    event.preventDefault();
    cancelCameraTransition();
    nudgeOrbitCamera(controls, camera, -GALAXY_ZOOM.KEYBOARD_ORBIT_AZIMUTH, 0);
    markRender();
    return;
  }
  if (key === 'ArrowUp') {
    event.preventDefault();
    cancelCameraTransition();
    nudgeOrbitCamera(controls, camera, 0, -GALAXY_ZOOM.KEYBOARD_ORBIT_POLAR);
    markRender();
    return;
  }
  if (key === 'ArrowDown') {
    event.preventDefault();
    cancelCameraTransition();
    nudgeOrbitCamera(controls, camera, 0, GALAXY_ZOOM.KEYBOARD_ORBIT_POLAR);
    markRender();
  }
}

function onGalaxyAuxClick(event) {
  if (event.button === 1) event.preventDefault();
}

function trackPointerDrag(event) {
  if (!pointerDown || event.pointerId !== pointerDown.pointerId) return;
  const dx = event.clientX - pointerDown.x;
  const dy = event.clientY - pointerDown.y;
  if (dx * dx + dy * dy > DRAG_THRESHOLD_SQ) pointerDragMoved = true;
}

function onPointerDown(event) {
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  syncControlsForPointerCount();

  if (event.button === 1) {
    event.preventDefault();
    cancelCameraTransition();
    middleDragLastY = event.clientY;
    return;
  }
  if (event.button !== 0) return;
  cancelCameraTransition();
  suspendGalaxyMotion();
  pointerDragMoved = false;
  pointerPickView = snapshotPickView();
  pointerPickIdx = pickIndexWithView(event.clientX, event.clientY, pointerPickView);
  pointerDown = {
    x: event.clientX,
    y: event.clientY,
    pointerId: event.pointerId,
    button: event.button,
  };
  if (activePointers.size >= 2) {
    lastPinchDistance = pinchPointerDistance();
  }
}

function onPointerMove(event) {
  trackPointerDrag(event);
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (activePointers.size >= 2) {
    const dist = pinchPointerDistance();
    if (dist != null && lastPinchDistance != null) {
      const delta = dist - lastPinchDistance;
      if (Math.abs(delta) > 0.8) {
        animateDolly(-delta * GALAXY_ZOOM.PINCH_NOTCH_PER_PX, GALAXY_ZOOM.CAMERA_DOLLY_MS * 0.85);
        lastPinchDistance = dist;
      }
    } else if (dist != null) {
      lastPinchDistance = dist;
    }
    markRender();
    return;
  }

  if (middleDragLastY != null && (event.buttons & 4)) {
    const dy = event.clientY - middleDragLastY;
    if (Math.abs(dy) > 0.8) {
      animateDolly(-dy * GALAXY_ZOOM.MIDDLE_DRAG_NOTCH_PER_PX, GALAXY_ZOOM.CAMERA_DOLLY_MS * 0.85);
      middleDragLastY = event.clientY;
    }
    markRender();
    return;
  }

  onCanvasHover(event);
}

function onPointerUp(event) {
  activePointers.delete(event.pointerId);
  syncControlsForPointerCount();
  if (activePointers.size < 2) lastPinchDistance = null;
  if (event.button === 1) middleDragLastY = null;

  if (!pointerDown || event.pointerId !== pointerDown.pointerId) return;
  const downX = pointerDown.x;
  const downY = pointerDown.y;
  const dx = event.clientX - downX;
  const dy = event.clientY - downY;
  const isPrimaryTap = pointerDown.button === 0;
  const isTap = dx * dx + dy * dy <= DRAG_THRESHOLD_SQ;
  const wasDrag = pointerDragMoved;
  const frozenView = pointerPickView;
  let idx = pointerPickIdx;
  pointerDown = null;
  pointerDragMoved = false;
  clearPointerPick();

  if (isPrimaryTap && isTap && !wasDrag) {
    if (idx == null && frozenView) idx = pickIndexWithView(downX, downY, frozenView);
    if (idx != null) {
      setHoverIndex(idx, event.clientX, event.clientY);
      focusStarByIndex(idx);
    }
  }

  syncAutoRotateAfterInteraction();
}

function onPointerCancel(event) {
  activePointers.delete(event.pointerId);
  syncControlsForPointerCount();
  if (activePointers.size < 2) lastPinchDistance = null;
  middleDragLastY = null;
  pointerDown = null;
  pointerDragMoved = false;
  clearPointerPick();
  syncAutoRotateAfterInteraction();
  const renderer = rendererRef.value;
  if (renderer) renderer.domElement.style.cursor = 'grab';
}

function onCanvasHover(event) {
  pendingHover = { x: event.clientX, y: event.clientY };
  if (!hoverRaf) {
    hoverRaf = requestAnimationFrame(flushCanvasHover);
  }
}

function flushCanvasHover() {
  hoverRaf = 0;
  const renderer = rendererRef.value;
  if (!renderer || !pendingHover) return;
  const { x, y } = pendingHover;
  pendingHover = null;
  const idx = pickIndex(x, y);
  setHoverIndex(idx, x, y);
  renderer.domElement.style.cursor = idx != null ? 'pointer' : 'grab';
}

function onCanvasLeave() {
  setHoverIndex(null);
  const renderer = rendererRef.value;
  if (renderer) renderer.domElement.style.cursor = 'grab';
}

function onGalaxyWheel(event) {
  if (!controls || !camera || !rendererRef.value) return;
  event.preventDefault();

  let delta = event.deltaY;
  if (event.deltaMode === 1) delta *= 16;
  else if (event.deltaMode === 2) delta *= 100;
  if (event.ctrlKey) delta *= 2.5;

  const notches = (-delta / GALAXY_ZOOM.WHEEL_NOTCH) * GALAXY_ZOOM.ZOOM_SPEED;
  if (Math.abs(notches) < 1e-6) return;

  animateDolly(notches, GALAXY_ZOOM.CAMERA_DOLLY_MS);
}

function zoomIn() {
  if (!controls || !camera) return;
  animateDolly(-GALAXY_ZOOM.ZOOM_SPEED, GALAXY_ZOOM.CAMERA_DOLLY_MS);
}

function zoomOut() {
  if (!controls || !camera) return;
  animateDolly(GALAXY_ZOOM.ZOOM_SPEED, GALAXY_ZOOM.CAMERA_DOLLY_MS);
}

function toggleLegend() {
  showLegend.value = !showLegend.value;
}

function toggleFullscreen() {
  if (props.isMobile) return;
  store.toggleGalaxyAreaExpanded();
  markRender();
  window.requestAnimationFrame(() => resize());
}

function resetView() {
  if (!defaultView || !controls || !camera) return;
  cancelCameraTransition();
  animateCameraTo(defaultView, GALAXY_ZOOM.CAMERA_RESET_MS, () => {
    if (viewPivot) viewPivot.quaternion.copy(defaultView.pivotQuaternion);
    if (galaxyGroup) galaxyGroup.rotation.y = 0;
    motionTimeSec = 0;
    lastFrameMs = 0;
    if (pointMaterial) pointMaterial.uniforms.uMotionTime.value = 0;
    legendFilter.value = emptyLegendFilter();
    syncLegendHighlight();
    setHoverIndex(null);
  });
}

function toggleAutoRotate() {
  autoRotate.value = !autoRotate.value;
  if (controls) controls.autoRotate = autoRotate.value;
  markRender();
}

function pauseGalaxyForDocumentHidden() {
  if (animationPausedByVisibility || animationId == null) return;
  cancelAnimationFrame(animationId);
  animationId = null;
  animationPausedByVisibility = true;
  lastFrameMs = 0;
}

function resumeGalaxyFromDocumentVisible() {
  if (!animationPausedByVisibility) return;
  animationPausedByVisibility = false;
  lastFrameMs = 0;
  if (animationId == null) {
    animationId = requestAnimationFrame(animate);
  }
}

function onDocumentVisibilityChange() {
  if (document.hidden) {
    pauseGalaxyForDocumentHidden();
    return;
  }
  resumeGalaxyFromDocumentVisible();
  markRender();
}

function animate(now) {
  animationId = requestAnimationFrame(animate);

  const cameraAnimating =
    cameraTransition?.active && controls && camera
      ? cameraTransition.tick(now, controls, camera)
      : false;
  if (!cameraAnimating) {
    controls?.update();
  }

  const dtSec = lastFrameMs > 0 ? Math.min((now - lastFrameMs) * 0.001, 0.05) : 0;
  lastFrameMs = now;

  if (autoRotate.value && !autoRotateSuspended && !galaxyMotionFrozen) {
    motionTimeSec += dtSec;
  }

  const timeSec = now * 0.001;
  if (pointMaterial) {
    pointMaterial.uniforms.uTime.value = timeSec;
    pointMaterial.uniforms.uMotionTime.value = motionTimeSec;
  }
  if (gasMaterial) {
    gasMaterial.uniforms.uTime.value = timeSec;
  }
  nebulaVolumeTimeUniform.value = timeSec;
  if (gasLangLayers.length > 0) {
    updateGasLangLayers();
  }

  const scene = sceneRef.value;
  const renderer = rendererRef.value;
  if (!scene || !renderer || !camera) return;

  const shouldRender =
    needsRender ||
    cameraAnimating ||
    (controls?.autoRotate && !autoRotateSuspended) ||
    (autoRotate.value && !autoRotateSuspended) ||
    starCount > 0 ||
    now - lastRenderMs >= TWINKLE_FRAME_MS;
  if (!shouldRender) return;

  renderer.render(scene, camera);
  lastRenderMs = now;
  needsRender = false;
}

function dispose() {
  if (animationId != null) cancelAnimationFrame(animationId);
  if (hoverRaf) cancelAnimationFrame(hoverRaf);
  cancelCameraTransition();
  cameraTransition = null;
  clearPointerPick();
  galaxyMotionFrozen = false;
  activePointers.clear();
  lastPinchDistance = null;
  middleDragLastY = null;
  resizeObserver?.disconnect();
  const renderer = rendererRef.value;
  if (renderer) {
    renderer.domElement.removeEventListener('pointerdown', onPointerDown, { capture: true });
    renderer.domElement.removeEventListener('pointermove', onPointerMove);
    renderer.domElement.removeEventListener('pointerup', onPointerUp);
    renderer.domElement.removeEventListener('pointercancel', onPointerCancel);
    renderer.domElement.removeEventListener('pointerleave', onCanvasLeave);
    renderer.domElement.removeEventListener('wheel', onGalaxyWheel);
    renderer.domElement.removeEventListener('auxclick', onGalaxyAuxClick);
    renderer.dispose();
    renderer.domElement.remove();
  }
  if (points) {
    points.geometry.dispose();
    points = null;
  }
  if (dust) {
    dust.geometry.dispose();
    if (dust.material instanceof THREE.Material) dust.material.dispose();
    dust = null;
  }
  disposeGasLangLayers();
  gasMaterial?.dispose();
  gasMaterial = null;
  gasDustMaterial?.dispose();
  gasDustMaterial = null;
  if (cosmicSky) {
    cosmicSky.geometry.dispose();
    if (cosmicSky.material instanceof THREE.Material) cosmicSky.material.dispose();
    cosmicSky = null;
  }
  disposeNebulaSharedGeometry();
  starCount = 0;
  restPositions = null;
  starSizes = null;
  starBrights = null;
  motionFields = null;
  motionTimeSec = 0;
  lastFrameMs = 0;
  autoRotateSuspended = false;
  animationPausedByVisibility = false;
  pointMaterial?.dispose();
  controls?.dispose();
  sceneRef.value = null;
  rendererRef.value = null;
  galaxyGroup = null;
  viewPivot = null;
}

watch(
  () => props.items,
  (items) => {
    rebuildGalaxy(items);
  },
  { immediate: false }
);

watch(
  () => [store.galaxyLayout?.version, store.galaxyVirtualIndexMap.size, GALAXY_RUNTIME_LAYOUT_TAG],
  () => {
    if (!sceneRef.value || !props.items?.length) return;
    rebuildGalaxy(props.items);
  }
);

watch(
  () => props.focusId,
  (id) => {
    syncSelectedIndex(id || '');
    if (!id || !controls || !camera || starCount <= 0) return;
    const idx = idToIndex.get(id);
    if (idx != null && idx >= 0) {
      focusStarByIndex(idx, { emitSelect: false });
    }
  }
);

watch(
  () => store.galaxyAreaExpanded,
  () => {
    markRender();
    window.requestAnimationFrame(() => resize());
  }
);

watch(
  () => props.isMobile,
  () => {
    window.requestAnimationFrame(() => resize());
  }
);

onMounted(async () => {
  await nextTick();
  try {
    initScene();
    await store.ensureGalaxyLayout();
    runGalaxyRebuild(props.items);
  } catch (err) {
    console.error('[galaxy] init failed', err);
    loadingScene.value = false;
    layoutComputing.value = false;
  } finally {
    loadingScene.value = false;
    markRender();
  }
  animationId = requestAnimationFrame(animate);
  document.addEventListener('visibilitychange', onDocumentVisibilityChange);
  window.addEventListener('keydown', onGalaxyKeyDown);
  if (document.hidden) pauseGalaxyForDocumentHidden();
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onDocumentVisibilityChange);
  window.removeEventListener('keydown', onGalaxyKeyDown);
  dispose();
});
</script>

<template>
  <div
    ref="galaxyRootRef"
    class="stars-galaxy"
    :class="{
      'stars-galaxy--area-fullscreen': store.galaxyAreaExpanded && !props.isMobile,
      'stars-galaxy--mobile': props.isMobile,
    }"
  >
    <div ref="containerRef" class="stars-galaxy__canvas" role="img" :aria-label="t('galaxyAria')" />
    <StarsGalaxyLegend
      v-show="showLegend"
      :items="legendItems"
      :star-tiers="starTierItems"
      :active-filter="legendFilter"
      @select-lang="onLegendSelectLang"
      @select-tier="onLegendSelectTier"
      @clear-filter="clearLegendFilter"
    />
    <p
      v-if="hoverLabel"
      class="stars-galaxy__hover"
      :style="{ left: `${hoverTip.x}px`, top: `${hoverTip.y}px` }"
    >
      {{ hoverLabel }}
    </p>
    <div class="stars-galaxy__controls">
      <StarsGalaxyControls
        :auto-rotate="autoRotate"
        :show-legend="showLegend"
        :show-focus-owner="showFocusOwnerRepo"
        :show-fullscreen="!props.isMobile"
        :is-fullscreen="store.galaxyAreaExpanded"
        @zoom-in="zoomIn"
        @zoom-out="zoomOut"
        @reset="resetView"
        @toggle-auto-rotate="toggleAutoRotate"
        @toggle-legend="toggleLegend"
        @focus-center="focusCenterStar"
        @focus-owner="focusOwnerStar"
        @toggle-fullscreen="toggleFullscreen"
      />
    </div>
    <div v-if="!props.isMobile" class="stars-galaxy__footer">
      <p v-if="loadingScene || layoutComputing" class="stars-galaxy__hint">
        {{ layoutComputing ? t('galaxyLayoutComputing') : t('galaxyLoading') }}
      </p>
      <p v-else class="stars-galaxy__hint">
        {{ t('galaxyHint') }}
      </p>
    </div>
    <p
      v-if="props.isMobile && (loadingScene || layoutComputing)"
      class="stars-galaxy__mobile-status"
    >
      {{ layoutComputing ? t('galaxyLayoutComputing') : t('galaxyLoading') }}
    </p>
    <StarsGalaxyDetail
      v-if="store.galaxySelected"
      :item="store.galaxySelected"
      :is-mobile="props.isMobile"
      @close="store.closeGalaxyDetail"
      @locate="focusGalaxySelected"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildDustBuffers, buildGalaxyBuffers, ownerSelfRepoId, repoLegendLanguageKey, repoStarTierKey } from '../galaxy/positions.js';
import { hasValidGalaxyLayout, GALAXY_RUNTIME_LAYOUT_TAG } from '../galaxy/layout-payload.js';
import { LEGEND_LANG_TOP, GALAXY_ZOOM, GALAXY_MOTION, COSMIC_UNIVERSE, SCENE_FOG } from '../galaxy/constants.js';
import { GALAXY_MOTION_GLSL, applyGalaxyHubMotionJs, motionWorldPosition } from '../galaxy/motion.js';
import { applyCameraView, dollyCameraUniformRange, fitCameraInsideObserver, focusCameraOnStarPoint } from '../galaxy/zoom-controls.js';
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
/** @type {{ x: number, y: number } | null} */
let dragLast = null;
/** @type {boolean} */
let dragRotationActive = false;
/** @type {number} */
let lastRenderMs = 0;

const DRAG_THRESHOLD_SQ = 64;
const DRAG_ROTATE_SPEED = 0.0035;
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

void main() {
  vColor = color;
  vBright = aBright;
  vActivity = aActivity;
  vHighlight = aInteraction.x;
  vIsSelected = aInteraction.y;
  vIsHovered = aInteraction.z;
  vRingStar = aRingStar;
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
  float s = aSize * (0.58 + vBright * 0.28) * vTwinkle * hoverScale * uPixelRatio * distScale * (1.0 - aRingStar * 0.1);
  gl_PointSize = clamp(s, 0.9, ${GALAXY_ZOOM.POINT_SIZE_MAX.toFixed(1)});
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
uniform float uTime;
uniform float uDensityScale;
uniform float uFogDensity;

void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float dist = length(uv);
  float mask = 1.0 - smoothstep(0.44, 0.5, dist);
  if (mask < 0.01) discard;

  float act = pow(vActivity, 1.4);
  float twGate = smoothstep(0.26, 0.6, act);
  float dim = mix(0.12, 1.0, vHighlight);

  float core = exp(-dist * dist * (28.0 + vRingStar * 10.0));
  float halo = exp(-dist * dist * 9.0) * 0.36 * (1.0 - vRingStar * 0.32);
  float mist = exp(-dist * dist * 2.6) * 0.14 * (1.0 - vRingStar * 0.28);
  float bright = clamp(vBright - 0.15, 0.0, 1.0);
  float sx = exp(-abs(uv.x) * 36.0) * exp(-abs(uv.y) * 9.0);
  float sy = exp(-abs(uv.y) * 36.0) * exp(-abs(uv.x) * 9.0);
  float spikes = (sx + sy) * bright * 0.22;

  float twinkle = mix(1.0, mix(0.55, 1.24, clamp(vTwinkle, 0.0, 1.4)), twGate);
  float breath = 1.0 + 0.07 * sin(uTime * 1.05 + act * 5.8) * smoothstep(0.38, 0.72, act);
  float pulse = 1.0 + 0.09 * sin(uTime * 1.75 + vActivity * 6.0) * smoothstep(0.5, 0.84, act);
  float flashGate = smoothstep(0.78, 0.94, act);
  float flick = fract(sin(floor(uTime * (0.85 + act * 2.0) + act * 12.0) * 127.1) * 43758.5453);
  float flashBurst = step(0.9, flick) * flashGate * 0.48;
  float actGlow = mix(0.95, 1.14, smoothstep(0.32, 0.88, act));
  float alpha = (core * 0.92 + halo + mist + spikes) * twinkle * actGlow * pulse * breath;
  alpha *= 1.0 + flashBurst;
  alpha *= clamp(vBright, 0.2, 0.95) * mask * mix(0.06, 1.0, vHighlight);

  float selectPulse = 0.82 + 0.18 * sin(uTime * 5.2 + dist * 14.0);
  float selectRing = smoothstep(0.46, 0.28, dist) * smoothstep(0.1, 0.24, dist);
  alpha += vIsSelected * (core * 0.72 + selectRing * 0.55) * selectPulse;
  alpha += vIsHovered * (1.0 - vIsSelected) * core * 0.32;
  alpha = clamp(alpha * uDensityScale, 0.0, 0.58);

  vec3 white = vec3(0.93, 0.96, 1.0);
  vec3 gray = vec3(0.42, 0.45, 0.5);
  vec3 baseCol = mix(gray, vColor, dim);
  vec3 gasTint = vColor * (mist * 1.05 + halo * 0.38);
  vec3 col = mix(baseCol, white, core * 0.28 + spikes * 0.18);
  col = mix(col, gasTint, clamp((mist + halo * 0.28) * dim, 0.0, 0.58));
  col = mix(col, white, vIsSelected * (core * 0.62 + selectRing * 0.48));
  col *= (0.82 + twinkle * 0.28) * pulse * breath * dim;
  col *= 1.0 + flashBurst * 0.35;
  col *= 1.0 + vIsSelected * 0.55 + vIsHovered * (1.0 - vIsSelected) * 0.32;

  float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
  col = mix(col, vec3(0.0), fogFactor * 0.94);
  alpha *= 1.0 - fogFactor * 0.88;

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
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float viewZ = max(-mvPosition.z, ${GALAXY_ZOOM.GAS_VIEW_Z_MIN.toFixed(1)});
  float depthBoost = 0.82 + clamp(viewZ / 95.0, 0.0, 0.38);
  vColor = color * depthBoost;
  vSoftness = aSoftness;
  vDensity = aDensity;
  vStretch = aStretch;
  vPhase = aPhase;
  float pulseRate = 0.08 + aSoftness * 0.12;
  float pulseAmp = mix(0.08, 0.04, aDensity);
  vPulse = 1.0 - pulseAmp + pulseAmp * sin(uTime * pulseRate + aPhase);
  float distScale = clamp(${GALAXY_ZOOM.GAS_DIST_SCALE_DIV.toFixed(1)} / viewZ, ${GALAXY_ZOOM.GAS_DIST_SCALE_MIN.toFixed(1)}, ${GALAXY_ZOOM.GAS_DIST_SCALE_MAX.toFixed(1)});
  float sizeMul = mix(0.52 + aSoftness * 0.18, 1.08 + aDensity * 0.45, aDensity);
  float s = aSize * sizeMul * vPulse * uPixelRatio * distScale;
  gl_PointSize = clamp(s, 2.5, ${GALAXY_ZOOM.GAS_POINT_SIZE_MAX.toFixed(1)});
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
  uv.x *= 1.0 + vStretch * 0.22;
  float dist = length(uv);

  if (dist > 0.5) discard;

  float coreK = 3.8 + vDensity * 3.5;
  float bodyK = 1.4 + vSoftness * 1.1;
  float hazeK = 0.42 + vSoftness * 0.55;

  float core = exp(-dist * dist * coreK);
  float body = exp(-dist * dist * bodyK);
  float haze = exp(-dist * dist * hazeK);

  float lum = mix(haze * 0.52 + body * 0.58, core * 0.75 + body * 0.58, vDensity);
  float alphaLo = haze * 0.078 + body * 0.068;
  float alphaHi = core * 0.12 + body * 0.09;
  float alpha = mix(alphaLo, alphaHi, vDensity) * vPulse;
  alpha *= 0.92 + (1.0 - vDensity) * 0.18;
  alpha *= smoothstep(0.5, 0.24, dist);

  vec3 col = vColor * (0.5 + lum * 0.95);
  gl_FragColor = vec4(col, alpha);
}
`;

function sceneBackground() {
  return 0x000000;
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

function focusStarByIndex(index) {
  if (!controls || !camera || index < 0 || index >= starCount) return;
  const world = starWorldPosition(index);
  if (!world) return;

  let span = GALAXY_ZOOM.FOCUS_STAR_SPAN;
  const sizeAttr = points?.geometry?.getAttribute('aSize');
  if (sizeAttr) {
    const starSize = sizeAttr.array[index] || 1;
    span = 3.2 + starSize * 2.4;
  }
  if (index === anchorStarIndex) span *= 1.15;

  focusCameraOnStarPoint(controls, camera, world, { span });
  const item = currentItems[index];
  if (item) {
    syncSelectedIndex(item.id);
    emit('select', item);
  }
  markRender();
}

function focusCenterStar() {
  if (anchorStarIndex >= 0) {
    focusStarByIndex(anchorStarIndex);
    return;
  }
  if (controls && camera) {
    focusCameraOnStarPoint(controls, camera, new THREE.Vector3(0, 0, 0), { span: 6 });
    markRender();
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
  scene.fog = new THREE.FogExp2(0x000000, SCENE_FOG.DENSITY);
  sceneRef.value = scene;

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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(width, height);
  el.appendChild(renderer.domElement);
  rendererRef.value = renderer;

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enableRotate = false;
  controls.minDistance = GALAXY_ZOOM.MIN_DISTANCE;
  controls.maxDistance = GALAXY_ZOOM.MAX_DISTANCE;
  controls.target.set(0, 0, 0);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.zoomToCursor = true;
  controls.addEventListener('start', () => {
    markRender();
  });
  controls.addEventListener('change', markRender);
  controls.addEventListener('end', markRender);

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
    blending: THREE.AdditiveBlending,
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

  const dustMaterial = new THREE.PointsMaterial({
    color: 0x8a9ab0,
    size: 0.14,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    fog: true,
  });

  const dustBuffers = buildDustBuffers(520);
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustBuffers.positions, 3));
  dust = new THREE.Points(dustGeometry, dustMaterial);
  dust.name = 'dust';
  galaxyGroup.add(dust);

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointercancel', onPointerCancel);
  renderer.domElement.addEventListener('pointerleave', onCanvasLeave);
  renderer.domElement.addEventListener('wheel', onGalaxyWheel, { passive: false });

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

function rotateViewPivot(dx, dy) {
  if (!viewPivot) return;
  viewPivot.rotateY(-dx * DRAG_ROTATE_SPEED);
  viewPivot.rotateX(-dy * DRAG_ROTATE_SPEED);
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
  if (!hasValidGalaxyLayout(store.galaxyLayout)) return false;
  if (store.galaxyUsesVirtualLayout) {
    return store.galaxyVirtualIndexMap.size > 0;
  }
  return store.galaxyIndexMap.size > 0;
}

function buildGalaxyBuffersForItems(items) {
  if (canUsePrecomputedLayout()) {
    return buildGalaxyBuffers(items, {
      layout: store.galaxyLayout,
      indexMap: store.galaxyIndexMap,
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
}

function updateGasLangLayers() {
  if (!gasLangLayers.length) return;
  const t = motionTimeSec;
  for (const layer of gasLangLayers) {
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
  const perGalaxy = gasBuffers.perGalaxy || COSMIC_UNIVERSE.GAS_PARTICLES_PER_GALAXY;
  const corePerGalaxy = gasBuffers.corePerGalaxy ?? COSMIC_UNIVERSE.GAS_CORE_FILL_COUNT ?? 0;
  const particlesPerLayer = perGalaxy + corePerGalaxy;
  if (!langs.length || !langMotions.length) return;

  let offset = 0;
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
    return;
  }

  syncGasClouds(buffers.gas);

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
  markRender();
}

function fitCamera(positions, count) {
  if (!camera || !controls || count === 0) return;
  fitCameraInsideObserver(controls, camera, positions, count, { padding: 1.1 });
  resetViewPivot();
  if (galaxyGroup) galaxyGroup.rotation.y = 0;
  saveDefaultView();
}

/** 同步选中高亮（不移动相机） */
function highlightItem(id) {
  syncSelectedIndex(id);
}

function pickIndex(clientX, clientY) {
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
    motionTimeSec: getMotionTimeSec(),
  });
  if (idx == null || idx < 0 || idx >= currentItems.length) return null;
  return idx;
}

function selectStarAt(clientX, clientY) {
  const idx = pickIndex(clientX, clientY);
  if (idx == null) return;
  setHoverIndex(idx, clientX, clientY);
  const item = currentItems[idx];
  if (item) emit('select', item);
}

function onPointerDown(event) {
  autoRotateSuspended = autoRotate.value;
  pointerDown = {
    x: event.clientX,
    y: event.clientY,
    pointerId: event.pointerId,
    button: event.button,
  };
  dragLast = { x: event.clientX, y: event.clientY };
  dragRotationActive = false;
  const renderer = rendererRef.value;
  if (renderer && event.button === 0) {
    try {
      renderer.domElement.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  }
}

function onPointerMove(event) {
  if (
    pointerDown &&
    event.pointerId === pointerDown.pointerId &&
    pointerDown.button === 0 &&
    dragLast
  ) {
    const totalDx = event.clientX - pointerDown.x;
    const totalDy = event.clientY - pointerDown.y;
    if (!dragRotationActive && totalDx * totalDx + totalDy * totalDy > DRAG_THRESHOLD_SQ) {
      dragRotationActive = true;
      const renderer = rendererRef.value;
      if (renderer) renderer.domElement.style.cursor = 'grabbing';
    }
    if (dragRotationActive) {
      rotateViewPivot(event.clientX - dragLast.x, event.clientY - dragLast.y);
      dragLast = { x: event.clientX, y: event.clientY };
      markRender();
      return;
    }
  }
  onCanvasHover(event);
}

function onPointerUp(event) {
  if (!pointerDown || event.pointerId !== pointerDown.pointerId) return;
  const dx = event.clientX - pointerDown.x;
  const dy = event.clientY - pointerDown.y;
  const isPrimaryTap = pointerDown.button === 0;
  const wasDrag = dragRotationActive;
  pointerDown = null;
  dragLast = null;
  dragRotationActive = false;
  autoRotateSuspended = false;
  const renderer = rendererRef.value;
  if (renderer) {
    try {
      renderer.domElement.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    renderer.domElement.style.cursor = 'grab';
  }
  if (!isPrimaryTap || wasDrag || dx * dx + dy * dy > DRAG_THRESHOLD_SQ) return;
  selectStarAt(event.clientX, event.clientY);
}

function onPointerCancel(event) {
  autoRotateSuspended = false;
  pointerDown = null;
  dragLast = null;
  dragRotationActive = false;
  const renderer = rendererRef.value;
  if (renderer) {
    try {
      if (event?.pointerId != null) {
        renderer.domElement.releasePointerCapture(event.pointerId);
      }
    } catch {
      /* ignore */
    }
    renderer.domElement.style.cursor = 'grab';
  }
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

  const el = rendererRef.value.domElement;
  const rect = el.getBoundingClientRect();
  const ndc = {
    x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
    y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
  };

  dollyCameraUniformRange(controls, camera, notches, { zoomToCursor: true, ndc });
  markRender();
}

function zoomIn() {
  if (!controls || !camera) return;
  dollyCameraUniformRange(controls, camera, -GALAXY_ZOOM.ZOOM_SPEED);
  markRender();
}

function zoomOut() {
  if (!controls || !camera) return;
  dollyCameraUniformRange(controls, camera, GALAXY_ZOOM.ZOOM_SPEED);
  markRender();
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
  applyCameraView(controls, camera, defaultView);
  if (viewPivot) viewPivot.quaternion.copy(defaultView.pivotQuaternion);
  if (galaxyGroup) galaxyGroup.rotation.y = 0;
  motionTimeSec = 0;
  lastFrameMs = 0;
  if (pointMaterial) pointMaterial.uniforms.uMotionTime.value = 0;
  legendFilter.value = emptyLegendFilter();
  syncLegendHighlight();
  setHoverIndex(null);
  markRender();
}

function toggleAutoRotate() {
  autoRotate.value = !autoRotate.value;
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

  controls?.update();
  const dtSec = lastFrameMs > 0 ? Math.min((now - lastFrameMs) * 0.001, 0.05) : 0;
  lastFrameMs = now;

  if (autoRotate.value && !autoRotateSuspended && galaxyGroup) {
    galaxyGroup.rotation.y += GALAXY_MOTION.UNIVERSE_SPIN;
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
  if (gasLangLayers.length > 0) {
    updateGasLangLayers();
  }

  const scene = sceneRef.value;
  const renderer = rendererRef.value;
  if (!scene || !renderer || !camera) return;

  const shouldRender =
    needsRender ||
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
  resizeObserver?.disconnect();
  const renderer = rendererRef.value;
  if (renderer) {
    renderer.domElement.removeEventListener('pointerdown', onPointerDown);
    renderer.domElement.removeEventListener('pointermove', onPointerMove);
    renderer.domElement.removeEventListener('pointerup', onPointerUp);
    renderer.domElement.removeEventListener('pointercancel', onPointerCancel);
    renderer.domElement.removeEventListener('pointerleave', onCanvasLeave);
    renderer.domElement.removeEventListener('wheel', onGalaxyWheel);
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
  if (document.hidden) pauseGalaxyForDocumentHidden();
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onDocumentVisibilityChange);
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
    />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildDustBuffers, buildGalaxyBuffers, ownerSelfRepoId, repoLegendLanguageKey, repoStarTierKey } from '../galaxy/positions.js';
import { hasValidGalaxyLayout } from '../galaxy/layout-payload.js';
import { LEGEND_LANG_TOP, GALAXY_TILT_X, GALAXY_ZOOM, GALAXY_MOTION } from '../galaxy/constants.js';
import { GALAXY_MOTION_GLSL, motionWorldPosition } from '../galaxy/motion.js';
import { applyCameraView, dollyCamera, fitCameraToGalaxyPoints, focusCameraOnStarPoint } from '../galaxy/zoom-controls.js';
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
/** @type {number | null} */
let animationId = null;
/** @type {ResizeObserver | null} */
let resizeObserver = null;
/** @type {Map<string, number>} */
let idToIndex = new Map();
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
const DRAG_ROTATE_SPEED = 0.0045;
const TWINKLE_FRAME_MS = 33;

const hoverTip = ref({ x: 0, y: 0 });

const hoverLabel = computed(() => {
  const idx = hoveredIndex ?? selectedIndex;
  if (idx == null || !currentItems[idx]) return '';
  const item = currentItems[idx];
  const stars = Number(item.stars) || 0;
  const topic = Array.isArray(item.topics) && item.topics[0] ? ` · #${item.topics[0]}` : '';
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
/** 交互中暂停自转，避免点击时星点漂移 */
let autoRotateSuspended = false;

const vertexShader = `
attribute vec3 aRestPos;
attribute float aSize;
attribute float aBright;
attribute float aActivity;
attribute float aIndex;
attribute float aHighlight;
attribute vec3 color;
uniform float uTime;
uniform float uMotionTime;
uniform float uPixelRatio;
uniform float uHoveredIndex;
uniform float uSelectedIndex;
${GALAXY_MOTION_GLSL}
varying vec3 vColor;
varying float vTwinkle;
varying float vBright;
varying float vActivity;
varying float vHighlight;
varying float vIsHovered;
varying float vIsSelected;

void main() {
  vColor = color;
  vBright = aBright;
  vActivity = aActivity;
  vHighlight = aHighlight;
  vIsSelected = (uSelectedIndex >= 0.0 && abs(aIndex - uSelectedIndex) < 0.5) ? 1.0 : 0.0;
  vIsHovered = (uHoveredIndex >= 0.0 && abs(aIndex - uHoveredIndex) < 0.5) ? 1.0 : 0.0;
  float act = pow(aActivity, 1.4);
  float twGate = smoothstep(0.32, 0.68, act);
  float twAmp = mix(0.0, 0.68, smoothstep(0.38, 0.92, act));
  float twSpd = mix(0.0, 3.6, smoothstep(0.42, 0.94, act));
  float phase = uTime * twSpd * 0.72 + aIndex * 1.73;
  vTwinkle = 1.0;
  if (twGate > 0.001) {
    vTwinkle = 1.0 - twAmp * twGate + twAmp * twGate * (0.5 + 0.5 * sin(phase));
    vTwinkle += act * 0.22 * twGate * sin(phase * 2.2 + aIndex * 0.41);
  }
  vec3 worldPos = applyGalaxyMotion(aRestPos);
  vec4 mvPosition = modelViewMatrix * vec4(worldPos, 1.0);
  float selectPulse = 0.86 + 0.14 * sin(uTime * 4.6 + aIndex * 0.37);
  float hoverScale = 1.0 + vIsSelected * (0.58 * selectPulse) + vIsHovered * (1.0 - vIsSelected) * 0.3;
  float distScale = clamp(300.0 / max(-mvPosition.z, 3.2), 4.5, 72.0);
  float s = aSize * (0.58 + vBright * 0.28) * vTwinkle * hoverScale * uPixelRatio * distScale;
  gl_PointSize = clamp(s, 0.9, ${GALAXY_ZOOM.POINT_SIZE_MAX.toFixed(1)});
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
uniform float uTime;

void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float dist = length(uv);
  float mask = 1.0 - smoothstep(0.44, 0.5, dist);
  if (mask < 0.01) discard;

  float act = pow(vActivity, 1.4);
  float twGate = smoothstep(0.32, 0.68, act);
  float dim = mix(0.12, 1.0, vHighlight);

  float core = exp(-dist * dist * 38.0);
  float halo = exp(-dist * dist * 14.0) * 0.16;
  float bright = clamp(vBright - 0.15, 0.0, 1.0);
  float sx = exp(-abs(uv.x) * 36.0) * exp(-abs(uv.y) * 9.0);
  float sy = exp(-abs(uv.y) * 36.0) * exp(-abs(uv.x) * 9.0);
  float spikes = (sx + sy) * bright * 0.22;

  float twinkle = mix(1.0, mix(0.55, 1.24, clamp(vTwinkle, 0.0, 1.4)), twGate);
  float pulse = 1.0 + 0.12 * sin(uTime * 2.1 + vActivity * 7.5) * smoothstep(0.42, 0.85, act);
  float actGlow = mix(0.95, 1.14, smoothstep(0.32, 0.88, act));
  float alpha = (core * 0.95 + halo + spikes) * twinkle * actGlow * pulse;
  alpha *= clamp(vBright, 0.2, 0.95) * mask * mix(0.06, 1.0, vHighlight);

  float selectPulse = 0.82 + 0.18 * sin(uTime * 5.2 + dist * 14.0);
  float selectRing = smoothstep(0.46, 0.28, dist) * smoothstep(0.1, 0.24, dist);
  alpha += vIsSelected * (core * 0.72 + selectRing * 0.55) * selectPulse;
  alpha += vIsHovered * (1.0 - vIsSelected) * core * 0.32;
  alpha = clamp(alpha, 0.0, 0.68);

  vec3 white = vec3(0.93, 0.96, 1.0);
  vec3 gray = vec3(0.42, 0.45, 0.5);
  vec3 baseCol = mix(gray, vColor, dim);
  vec3 col = mix(baseCol, white, core * 0.32 + spikes * 0.18);
  col = mix(col, white, vIsSelected * (core * 0.62 + selectRing * 0.48));
  col *= (0.82 + twinkle * 0.28) * pulse * dim;
  col *= 1.0 + vIsSelected * 0.55 + vIsHovered * (1.0 - vIsSelected) * 0.32;

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
  const attr = points.geometry.getAttribute('aHighlight');
  if (!attr) return;
  const arr = attr.array;
  const active = isLegendFilterActive(legendFilter.value);
  for (let i = 0; i < starCount; i += 1) {
    arr[i] = !active || itemMatchesLegendFilter(currentItems[i]) ? 1 : 0;
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
  scene.fog = new THREE.FogExp2(0x000000, 0.0019);
  sceneRef.value = scene;

  viewPivot = new THREE.Group();
  scene.add(viewPivot);

  galaxyGroup = new THREE.Group();
  galaxyGroup.rotation.x = GALAXY_TILT_X;
  viewPivot.add(galaxyGroup);

  camera = new THREE.PerspectiveCamera(48, width / height, 0.05, 500);
  camera.position.set(4, 78, 118);

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
  controls.enableZoom = true;
  controls.zoomToCursor = true;
  controls.zoomSpeed = GALAXY_ZOOM.ZOOM_SPEED;
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
      uHoveredIndex: { value: -1 },
      uSelectedIndex: { value: -1 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const dustMaterial = new THREE.PointsMaterial({
    color: 0xb8c8d8,
    size: 0.18,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const dustBuffers = buildDustBuffers(1400);
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
  markRender();
}

function syncSelectedIndex(id) {
  if (!id) {
    selectedIndex = null;
  } else {
    const idx = idToIndex.get(id);
    selectedIndex = idx ?? null;
  }
  if (pointMaterial) {
    pointMaterial.uniforms.uSelectedIndex.value = selectedIndex ?? -1;
  }
  markRender();
}

function setHoverIndex(idx, clientX, clientY) {
  hoveredIndex = idx;
  if (pointMaterial) {
    pointMaterial.uniforms.uHoveredIndex.value = idx == null ? -1 : idx;
  }
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
  return hasValidGalaxyLayout(store.galaxyLayout) && store.galaxyIndexMap.size > 0;
}

function buildGalaxyBuffersForItems(items) {
  if (canUsePrecomputedLayout()) {
    return buildGalaxyBuffers(items, {
      layout: store.galaxyLayout,
      indexMap: store.galaxyIndexMap,
    });
  }
  return buildGalaxyBuffers(items);
}

function runGalaxyRebuild(items) {
  const run = () => {
    try {
      applyBuffers(buildGalaxyBuffersForItems(items));
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

function applyBuffers(buffers) {
  const scene = sceneRef.value;
  if (!scene || !pointMaterial || !galaxyGroup) return;

  idToIndex = buffers.idToIndex;
  currentItems = buffers.items;
  legendItems.value = buffers.legend.slice(0, LEGEND_LANG_TOP);
  starTierItems.value = buffers.starTiers;
  legendLangSet = new Set(legendItems.value.map((row) => row.name));
  anchorStarIndex = buffers.anchorIndex ?? -1;
  const selfRepoId = ownerSelfRepoId(store.owner);
  ownerStarIndex = selfRepoId ? idToIndex.get(selfRepoId) ?? -1 : -1;
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
    return;
  }

  syncMotionAttributes(buffers);

  const indices = new Float32Array(buffers.count);
  const highlights = new Float32Array(buffers.count);
  for (let i = 0; i < buffers.count; i += 1) {
    indices[i] = i;
    highlights[i] = 1;
  }

  const pickPositions = new Float32Array(buffers.positions);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('aRestPos', new THREE.BufferAttribute(buffers.positions, 3));
  geometry.setAttribute('position', new THREE.BufferAttribute(pickPositions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(buffers.colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(buffers.sizes, 1));
  geometry.setAttribute('aBright', new THREE.BufferAttribute(buffers.brights, 1));
  geometry.setAttribute('aActivity', new THREE.BufferAttribute(buffers.activities, 1));
  geometry.setAttribute('aHighlight', new THREE.BufferAttribute(highlights, 1));
  geometry.setAttribute('aIndex', new THREE.BufferAttribute(indices, 1));

  const motion = buffers.motion;
  if (motion) {
    geometry.setAttribute('aLangCenter', new THREE.BufferAttribute(motion.langCenters, 3));
    geometry.setAttribute('aTopicCenter', new THREE.BufferAttribute(motion.topicCenters, 3));
    geometry.setAttribute('aLangOrbitOmega', new THREE.BufferAttribute(motion.langOrbitOmega, 1));
    geometry.setAttribute('aLangSpinOmega', new THREE.BufferAttribute(motion.langSpinOmega, 1));
    geometry.setAttribute('aTopicActive', new THREE.BufferAttribute(motion.topicActive, 1));
    geometry.setAttribute('aTopicSpinOmega', new THREE.BufferAttribute(motion.topicSpinOmega, 1));
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
  fitCameraToGalaxyPoints(controls, camera, positions, count, {
    padding: 1.08,
    tiltX: GALAXY_TILT_X,
  });
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

function zoomIn() {
  if (!controls || !camera) return;
  dollyCamera(controls, camera, GALAXY_ZOOM.DOLLY_IN);
  markRender();
}

function zoomOut() {
  if (!controls || !camera) return;
  dollyCamera(controls, camera, GALAXY_ZOOM.DOLLY_OUT);
  markRender();
}

function toggleLegend() {
  showLegend.value = !showLegend.value;
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

  const scene = sceneRef.value;
  const renderer = rendererRef.value;
  if (!scene || !renderer || !camera) return;

  const shouldRender =
    needsRender || autoRotate.value || starCount > 0 || now - lastRenderMs >= TWINKLE_FRAME_MS;
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
  starCount = 0;
  restPositions = null;
  starSizes = null;
  starBrights = null;
  motionFields = null;
  motionTimeSec = 0;
  lastFrameMs = 0;
  autoRotateSuspended = false;
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
  () => props.focusId,
  (id) => {
    syncSelectedIndex(id || '');
  }
);

onMounted(() => {
  initScene();
  if (!canUsePrecomputedLayout()) layoutComputing.value = true;
  const finishInitial = () => {
    try {
      applyBuffers(buildGalaxyBuffersForItems(props.items));
    } finally {
      layoutComputing.value = false;
      loadingScene.value = false;
      markRender();
    }
  };
  if (canUsePrecomputedLayout()) finishInitial();
  else window.setTimeout(finishInitial, 0);
  animationId = requestAnimationFrame(animate);
});

onUnmounted(() => {
  dispose();
});
</script>

<template>
  <div class="stars-galaxy">
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
    <div class="stars-galaxy__footer">
      <StarsGalaxyControls
        :auto-rotate="autoRotate"
        :show-legend="showLegend"
        :show-focus-owner="showFocusOwnerRepo"
        @zoom-in="zoomIn"
        @zoom-out="zoomOut"
        @reset="resetView"
        @toggle-auto-rotate="toggleAutoRotate"
        @toggle-legend="toggleLegend"
        @focus-center="focusCenterStar"
        @focus-owner="focusOwnerStar"
      />
      <p v-if="loadingScene || layoutComputing" class="stars-galaxy__hint">
        {{ layoutComputing ? t('galaxyLayoutComputing') : t('galaxyLoading') }}
      </p>
      <p v-else class="stars-galaxy__hint">{{ t('galaxyHint') }}</p>
    </div>
    <StarsGalaxyDetail
      v-if="store.galaxySelected"
      :item="store.galaxySelected"
      :is-mobile="props.isMobile"
      @close="store.closeGalaxyDetail"
    />
  </div>
</template>

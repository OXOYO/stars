import * as THREE from 'three';
import { GALAXY_ZOOM } from './constants.js';

const _dollyDir = new THREE.Vector3();

/**
 * 计算 dolly 后的相机位姿（不写入场景）
 * @param {THREE.OrbitControls} controls
 * @param {THREE.PerspectiveCamera} camera
 * @param {number} signedNotches
 * @returns {{ position: THREE.Vector3, target: THREE.Vector3 } | null}
 */
export function resolveDollyCameraView(controls, camera, signedNotches) {
  if (!signedNotches) return null;

  const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
  const distance = Math.max(offset.length(), 1e-8);
  const minD = controls.minDistance;
  const maxD = controls.maxDistance;
  const logMin = Math.log(minD);
  const logMax = Math.log(maxD);
  const logRange = Math.max(logMax - logMin, 1e-8);
  const logDist = Math.log(distance);
  const logDelta = signedNotches * GALAXY_ZOOM.RANGE_FRACTION_PER_NOTCH * logRange;
  const newLogDist = Math.max(logMin, Math.min(logMax, logDist + logDelta));
  const newDistance = Math.exp(newLogDist);

  offset.setLength(newDistance);
  return {
    position: controls.target.clone().add(offset),
    target: controls.target.clone(),
  };
}

/**
 * 在 [minDistance, maxDistance] 的 log 区间内按固定比例步进，避免越放大/越缩小越慢
 * @param {THREE.OrbitControls} controls
 * @param {THREE.PerspectiveCamera} camera
 * @param {number} signedNotches 正数拉远，负数拉近
 * @param {{ zoomToCursor?: boolean, ndc?: { x: number, y: number } }} [opts]
 */
export function dollyCameraUniformRange(controls, camera, signedNotches, opts = {}) {
  if (!signedNotches) return;

  if (opts.zoomToCursor && opts.ndc) {
    const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
    const distance = Math.max(offset.length(), 1e-8);
    const minD = controls.minDistance;
    const maxD = controls.maxDistance;
    const logMin = Math.log(minD);
    const logMax = Math.log(maxD);
    const logRange = Math.max(logMax - logMin, 1e-8);
    const logDist = Math.log(distance);
    const logDelta = signedNotches * GALAXY_ZOOM.RANGE_FRACTION_PER_NOTCH * logRange;
    const newLogDist = Math.max(logMin, Math.min(logMax, logDist + logDelta));
    const newDistance = Math.exp(newLogDist);
    const radiusDelta = distance - newDistance;

    _dollyDir.set(opts.ndc.x, opts.ndc.y, 1).unproject(camera).sub(camera.position).normalize();
    if (_dollyDir.lengthSq() > 1e-10) {
      camera.position.addScaledVector(_dollyDir, radiusDelta);
    } else {
      offset.setLength(newDistance);
      camera.position.copy(controls.target).add(offset);
    }
  } else {
    const view = resolveDollyCameraView(controls, camera, signedNotches);
    if (!view) return;
    camera.position.copy(view.position);
  }
  controls.update();
}

/** @deprecated 使用 dollyCameraUniformRange */
export function dollyCamera(controls, camera, factor) {
  const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
  const distance = offset.length();
  const notches = factor < 1 ? -1 : 1;
  dollyCameraUniformRange(controls, camera, notches);
}

/**
 * 根据包围盒与 FOV 计算合适的相机距离
 * @param {THREE.PerspectiveCamera} camera
 * @param {THREE.Box3} box
 * @param {number} [padding=1.18]
 */
export function cameraDistanceForBox(camera, box, padding = 1.18) {
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1);
  const fovRad = (camera.fov * Math.PI) / 180;
  const fitHeight = maxDim / (2 * Math.tan(fovRad / 2));
  const fitWidth = fitHeight / Math.max(camera.aspect, 0.5);
  return Math.max(fitHeight, fitWidth) * padding;
}

/**
 * 根据星点范围适配相机（考虑盘面倾角，避免侧视成一条线）
 * @param {THREE.OrbitControls} controls
 * @param {THREE.PerspectiveCamera} camera
 * @param {Float32Array} positions
 * @param {number} count
 * @param {{ padding?: number, viewDir?: THREE.Vector3, tiltX?: number }} [opts]
 */
export function fitCameraToGalaxyPoints(controls, camera, positions, count, opts = {}) {
  const padding = opts.padding ?? 1.28;
  const tiltX = opts.tiltX ?? 0;
  const viewDir = opts.viewDir ?? new THREE.Vector3(0.38, 0.52, 0.68).normalize();
  const center = new THREE.Vector3();
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  const tiltMatrix = new THREE.Matrix4().makeRotationX(tiltX);

  if (count > 0) {
    for (let i = 0; i < count; i += 1) {
      point.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      point.applyMatrix4(tiltMatrix);
      box.expandByPoint(point);
    }
    box.getCenter(center);
  } else {
    center.set(0, 0, 0);
    box.setFromCenterAndSize(center, new THREE.Vector3(40, 12, 40));
  }

  const distance = cameraDistanceForBox(camera, box, padding);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1);

  controls.minDistance = Math.max(GALAXY_ZOOM.MIN_DISTANCE, maxDim * 0.005);
  controls.maxDistance = Math.max(
    GALAXY_ZOOM.MAX_DISTANCE,
    distance * 3.4,
    maxDim * 6.5
  );

  controls.target.copy(center);
  camera.position.copy(center).add(viewDir.clone().multiplyScalar(distance));

  const far = Math.max(distance * 3.2, maxDim * 12, 2500);
  const near = Math.min(0.05, maxDim * 0.0004, distance * 0.0008);
  camera.far = Math.max(camera.far, far);
  camera.near = Math.min(camera.near, near);
  camera.updateProjectionMatrix();

  controls.update();
}

/**
 * @param {THREE.OrbitControls} controls
 * @param {THREE.PerspectiveCamera} camera
 * @param {THREE.Box3} box
 * @param {{ padding?: number, viewDir?: THREE.Vector3 }} [opts]
 */
export function fitCameraToBox(controls, camera, box, opts = {}) {
  const padding = opts.padding ?? 1.18;
  const viewDir = opts.viewDir ?? new THREE.Vector3(0.38, 0.52, 0.68).normalize();
  const center = box.getCenter(new THREE.Vector3());
  const distance = cameraDistanceForBox(camera, box, padding);

  controls.target.copy(center);
  camera.position.copy(center).add(viewDir.clone().multiplyScalar(distance));
  controls.update();
}

/**
 * @param {THREE.OrbitControls} controls
 * @param {THREE.PerspectiveCamera} camera
 * @param {{ position: THREE.Vector3, target: THREE.Vector3 }} view
 */
export function applyCameraView(controls, camera, view) {
  controls.target.copy(view.target);
  camera.position.copy(view.position);
  controls.update();
}

/**
 * 按目标屏幕像素反推飞入视距（与 StarsGalaxyView 星点顶点公式一致）
 * @param {number} aSize
 * @param {number} [bright=0.5]
 * @param {number} [pixelRatio=1]
 */
export function focusDistanceForStar(aSize, bright = 0.5, pixelRatio = 1) {
  const targetPx = GALAXY_ZOOM.FOCUS_TARGET_POINT_PX ?? 34;
  const minD = GALAXY_ZOOM.FOCUS_STAR_MIN_DISTANCE ?? 0.09;
  const maxD = GALAXY_ZOOM.FOCUS_STAR_MAX_DISTANCE ?? 3.4;
  const brightMul = 0.36 + Math.max(0, Math.min(1, bright)) * 0.2;
  const denom = Math.max(aSize * brightMul * pixelRatio, 0.028);
  const distScale = targetPx / denom;
  const viewZ =
    GALAXY_ZOOM.POINT_DIST_SCALE_DIV /
    Math.max(distScale, GALAXY_ZOOM.POINT_DIST_SCALE_MIN ?? 1.15);
  return Math.max(minD, Math.min(maxD, viewZ));
}

/**
 * 计算飞入单星后的相机位姿（不写入场景）
 * @param {THREE.OrbitControls} controls
 * @param {THREE.PerspectiveCamera} camera
 * @param {THREE.Vector3} worldPoint
 * @param {{ span?: number, padding?: number, maxDistance?: number, aSize?: number, bright?: number, pixelRatio?: number }} [opts]
 * @returns {{ position: THREE.Vector3, target: THREE.Vector3 }}
 */
export function resolveFocusCameraView(controls, camera, worldPoint, opts = {}) {
  let distance;
  if (opts.aSize != null && Number.isFinite(opts.aSize)) {
    distance = focusDistanceForStar(opts.aSize, opts.bright ?? 0.5, opts.pixelRatio ?? 1);
  } else {
    const span = opts.span ?? GALAXY_ZOOM.FOCUS_STAR_SPAN;
    const padding = opts.padding ?? GALAXY_ZOOM.FOCUS_STAR_PADDING;
    const maxDist = opts.maxDistance ?? GALAXY_ZOOM.FOCUS_STAR_MAX_DISTANCE;
    const box = new THREE.Box3().setFromCenterAndSize(
      worldPoint,
      new THREE.Vector3(span, span, span)
    );
    distance = cameraDistanceForBox(camera, box, padding);
    distance = Math.min(maxDist, distance);
  }

  const minDist = GALAXY_ZOOM.FOCUS_STAR_MIN_DISTANCE ?? 0.09;
  distance = Math.max(minDist, distance);

  const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
  let viewDir = offset.lengthSq() > 1e-10 ? offset.normalize() : new THREE.Vector3();
  if (viewDir.lengthSq() < 1e-10) {
    viewDir.set(0, 0, 1);
  }

  const target = worldPoint.clone();
  const position = worldPoint.clone().add(viewDir.multiplyScalar(distance));
  return { position, target };
}

/**
 * 定位到单颗星：优先按 aSize 反推视距，使星点在屏上足够大
 * @param {THREE.OrbitControls} controls
 * @param {THREE.PerspectiveCamera} camera
 * @param {THREE.Vector3} worldPoint
 * @param {{ span?: number, padding?: number, maxDistance?: number, aSize?: number, bright?: number, pixelRatio?: number }} [opts]
 */
export function focusCameraOnStarPoint(controls, camera, worldPoint, opts = {}) {
  const view = resolveFocusCameraView(controls, camera, worldPoint, opts);
  controls.target.copy(view.target);
  camera.position.copy(view.position);
  controls.update();
}

/**
 * 键盘/按钮微调 orbit（绕 target 旋转）
 * @param {THREE.OrbitControls} controls
 * @param {THREE.PerspectiveCamera} camera
 * @param {number} [dAzimuth=0]
 * @param {number} [dPolar=0]
 */
export function nudgeOrbitCamera(controls, camera, dAzimuth = 0, dPolar = 0) {
  const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
  const spherical = new THREE.Spherical().setFromVector3(offset);
  spherical.theta += dAzimuth;
  const minPhi = controls.minPolarAngle ?? 0.01;
  const maxPhi = controls.maxPolarAngle ?? Math.PI - 0.01;
  spherical.phi = Math.max(minPhi, Math.min(maxPhi, spherical.phi + dPolar));
  offset.setFromSpherical(spherical);
  camera.position.copy(controls.target).add(offset);
  controls.update();
}

/**
 * 宇宙内观测：相机置于球心附近，环顾四周（类似地表仰望星空）
 * @param {THREE.OrbitControls} controls
 * @param {THREE.PerspectiveCamera} camera
 * @param {Float32Array} positions
 * @param {number} count
 * @param {{ padding?: number, defaultDistanceMult?: number }} [opts]
 */
export function fitCameraInsideObserver(controls, camera, positions, count, opts = {}) {
  const padding = opts.padding ?? 1.06;
  let maxR = 1;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < count; i += 1) {
    cx += positions[i * 3];
    cy += positions[i * 3 + 1];
    cz += positions[i * 3 + 2];
  }
  if (count > 0) {
    const inv = 1 / count;
    cx *= inv;
    cy *= inv;
    cz *= inv;
    for (let i = 0; i < count; i += 1) {
      const dx = positions[i * 3] - cx;
      const dy = positions[i * 3 + 1] - cy;
      const dz = positions[i * 3 + 2] - cz;
      maxR = Math.max(maxR, Math.sqrt(dx * dx + dy * dy + dz * dz));
    }
  }
  maxR = Math.max(maxR * padding, 52);

  controls.minDistance = Math.max(
    GALAXY_ZOOM.MIN_DISTANCE,
    maxR * (GALAXY_ZOOM.OBSERVER_MIN_DISTANCE_FRAC ?? 0.0045)
  );
  controls.maxDistance = maxR * GALAXY_ZOOM.OBSERVER_MAX_DISTANCE_MULT;

  const defaultMult =
    opts.defaultDistanceMult ?? GALAXY_ZOOM.OBSERVER_DEFAULT_DISTANCE_MULT ?? 0.28;
  const defaultDist = Math.max(
    controls.minDistance * 2.2,
    Math.min(maxR * defaultMult, controls.maxDistance * 0.82)
  );

  const viewDirRaw = opts.viewDir ?? GALAXY_ZOOM.OBSERVER_VIEW_DIR ?? [0.34, 0.46, 0.82];
  const viewDir = Array.isArray(viewDirRaw)
    ? new THREE.Vector3(viewDirRaw[0], viewDirRaw[1], viewDirRaw[2]).normalize()
    : viewDirRaw.clone().normalize();

  controls.target.set(cx, cy, cz);
  camera.position.copy(controls.target).add(viewDir.multiplyScalar(defaultDist));
  camera.lookAt(controls.target);

  const far = Math.max(maxR * 3.6, 2800);
  const near = Math.min(0.012, maxR * 0.00012, controls.minDistance * 0.08);
  camera.far = Math.max(camera.far, far);
  camera.near = Math.min(camera.near, near);
  camera.updateProjectionMatrix();
  controls.update();
}

import * as THREE from 'three';
import { GALAXY_ZOOM } from './constants.js';

const _dollyDir = new THREE.Vector3();

/**
 * 在 [minDistance, maxDistance] 的 log 区间内按固定比例步进，避免越放大/越缩小越慢
 * @param {THREE.OrbitControls} controls
 * @param {THREE.PerspectiveCamera} camera
 * @param {number} signedNotches 正数拉远，负数拉近
 * @param {{ zoomToCursor?: boolean, ndc?: { x: number, y: number } }} [opts]
 */
export function dollyCameraUniformRange(controls, camera, signedNotches, opts = {}) {
  if (!signedNotches) return;

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

  if (opts.zoomToCursor && opts.ndc) {
    _dollyDir.set(opts.ndc.x, opts.ndc.y, 1).unproject(camera).sub(camera.position).normalize();
    if (_dollyDir.lengthSq() > 1e-10) {
      camera.position.addScaledVector(_dollyDir, radiusDelta);
    } else {
      offset.setLength(newDistance);
      camera.position.copy(controls.target).add(offset);
    }
  } else {
    offset.setLength(newDistance);
    camera.position.copy(controls.target).add(offset);
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
 * 定位到单颗星：按 FOV 计算合适视距，而非沿用全景相机距离
 * @param {THREE.OrbitControls} controls
 * @param {THREE.PerspectiveCamera} camera
 * @param {THREE.Vector3} worldPoint
 * @param {{ span?: number, padding?: number, maxDistance?: number }} [opts]
 */
export function focusCameraOnStarPoint(controls, camera, worldPoint, opts = {}) {
  const span = opts.span ?? GALAXY_ZOOM.FOCUS_STAR_SPAN;
  const padding = opts.padding ?? GALAXY_ZOOM.FOCUS_STAR_PADDING;
  const maxDist = opts.maxDistance ?? GALAXY_ZOOM.FOCUS_STAR_MAX_DISTANCE;
  const minDist = Math.max(controls.minDistance, GALAXY_ZOOM.MIN_DISTANCE);

  const box = new THREE.Box3().setFromCenterAndSize(
    worldPoint,
    new THREE.Vector3(span, span, span)
  );
  let distance = cameraDistanceForBox(camera, box, padding);
  distance = Math.max(minDist, Math.min(maxDist, distance));

  const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
  let viewDir = offset.normalize();
  if (viewDir.lengthSq() < 1e-8) {
    viewDir = new THREE.Vector3(0, 0, -1);
  }

  controls.target.copy(worldPoint);
  camera.position.copy(worldPoint).add(viewDir.multiplyScalar(distance));
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
  const anchorDist = Math.max(maxR * 0.04, 2.5);

  controls.minDistance = Math.max(
    GALAXY_ZOOM.MIN_DISTANCE,
    anchorDist * GALAXY_ZOOM.OBSERVER_MIN_DISTANCE_MULT
  );
  controls.maxDistance = maxR * GALAXY_ZOOM.OBSERVER_MAX_DISTANCE_MULT;

  const defaultMult =
    opts.defaultDistanceMult ?? GALAXY_ZOOM.OBSERVER_DEFAULT_DISTANCE_MULT ?? 0.52;
  const defaultDist = Math.max(
    controls.minDistance * 2.2,
    anchorDist + 2.5,
    Math.min(maxR * defaultMult, controls.maxDistance * 0.82)
  );

  controls.target.set(0, 0, -anchorDist);
  camera.position.set(0, 0, controls.target.z + defaultDist);
  camera.lookAt(controls.target);

  const far = Math.max(maxR * 3.6, 2800);
  const near = Math.min(0.05, maxR * 0.00035);
  camera.far = Math.max(camera.far, far);
  camera.near = Math.min(camera.near, near);
  camera.updateProjectionMatrix();
  controls.update();
}

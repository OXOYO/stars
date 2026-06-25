import * as THREE from 'three';
import { GALAXY_ZOOM } from './constants.js';

/**
 * @param {THREE.OrbitControls} controls
 * @param {THREE.PerspectiveCamera} camera
 * @param {number} factor >1 拉远，<1 拉近
 */
export function dollyCamera(controls, camera, factor) {
  const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
  const distance = offset.length();
  let newDistance = distance * factor;
  newDistance = Math.max(controls.minDistance, Math.min(controls.maxDistance, newDistance));
  offset.setLength(newDistance);
  camera.position.copy(controls.target).add(offset);
  controls.update();
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
    viewDir = new THREE.Vector3(0.38, 0.52, 0.68).normalize();
  }

  controls.target.copy(worldPoint);
  camera.position.copy(worldPoint).add(viewDir.multiplyScalar(distance));
  controls.update();
}

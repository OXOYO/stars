import * as THREE from 'three';
import { motionWorldPosition } from './motion.js';

const _world = new THREE.Vector3();
const _mv = new THREE.Vector3();
const _proj = new THREE.Vector3();

/**
 * 屏幕空间拾取星点：按光标与投影点的像素距离，避免射线阈值误选前后重叠的邻居
 * @param {{
 *   camera: THREE.PerspectiveCamera,
 *   points: THREE.Points,
 *   restPositions: Float32Array,
 *   starCount: number,
 *   clientX: number,
 *   clientY: number,
 *   canvasRect: DOMRect,
 *   sizes?: Float32Array | null,
 *   brights?: Float32Array | null,
 *   pixelRatio?: number,
 *   motionFields?: import('./motion.js').ReturnType<typeof import('./motion.js').buildMotionFields> | null,
 *   motionTimeSec?: number,
 * }} opts
 * @returns {number | null}
 */
export function pickStarIndexScreen(opts) {
  const {
    camera,
    points,
    restPositions,
    starCount,
    clientX,
    clientY,
    canvasRect,
    sizes = null,
    brights = null,
    pixelRatio = 1,
    motionFields = null,
    motionTimeSec = 0,
  } = opts;

  if (!camera || !points || !restPositions || starCount <= 0) return null;

  points.updateMatrixWorld(true);
  const matrix = points.matrixWorld;
  const clickX = clientX - canvasRect.left;
  const clickY = clientY - canvasRect.top;
  const w = canvasRect.width;
  const h = canvasRect.height;
  if (w <= 0 || h <= 0) return null;

  let bestIdx = null;
  let bestDistSq = Infinity;

  for (let i = 0; i < starCount; i += 1) {
    const rx = restPositions[i * 3];
    const ry = restPositions[i * 3 + 1];
    const rz = restPositions[i * 3 + 2];
    if (motionFields) {
      const [mx, my, mz] = motionWorldPosition(rx, ry, rz, motionFields, i, motionTimeSec);
      _world.set(mx, my, mz);
    } else {
      _world.set(rx, ry, rz);
    }
    _world.applyMatrix4(matrix);

    _mv.copy(_world).applyMatrix4(camera.matrixWorldInverse);
    if (-_mv.z < 0.15) continue;

    _proj.copy(_world).project(camera);
    if (_proj.z > 1) continue;

    const sx = (_proj.x * 0.5 + 0.5) * w;
    const sy = (-_proj.y * 0.5 + 0.5) * h;

    const aSize = sizes ? sizes[i] : 1;
    const bright = brights ? brights[i] : 0.5;
    const distScale = Math.max(4.5, Math.min(72, 300 / Math.max(-_mv.z, 3.2)));
    const pixelSize = aSize * (0.58 + bright * 0.28) * pixelRatio * distScale;
    const pickR = Math.max(5, Math.min(22, pixelSize * 0.42));

    const dx = sx - clickX;
    const dy = sy - clickY;
    const distSq = dx * dx + dy * dy;
    if (distSq > pickR * pickR) continue;

    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestIdx = i;
    }
  }

  return bestIdx;
}

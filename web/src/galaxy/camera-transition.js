import * as THREE from 'three';

/** @param {number} t 0~1 */
export function easeInOutCubic(t) {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

/**
 * 可中断、可重定向的相机 position + target 缓动
 * @returns {{
 *   get active(): boolean,
 *   cancel: () => void,
 *   start: (controls: import('three/examples/jsm/controls/OrbitControls.js').OrbitControls, camera: THREE.PerspectiveCamera, view: { position: THREE.Vector3, target: THREE.Vector3 }, opts?: { durationMs?: number, now?: number, onComplete?: () => void }) => void,
 *   tick: (now: number, controls: import('three/examples/jsm/controls/OrbitControls.js').OrbitControls, camera: THREE.PerspectiveCamera) => boolean,
 * }}
 */
export function createCameraTransition() {
  let active = false;
  let startMs = 0;
  let durationMs = 400;
  /** @type {(() => void) | null} */
  let onComplete = null;
  const fromPos = new THREE.Vector3();
  const fromTarget = new THREE.Vector3();
  const toPos = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const scratchPos = new THREE.Vector3();
  const scratchTarget = new THREE.Vector3();

  function sample(t, outPos, outTarget) {
    const e = easeInOutCubic(t);
    outPos.lerpVectors(fromPos, toPos, e);
    outTarget.lerpVectors(fromTarget, toTarget, e);
  }

  function currentSample(now, outPos, outTarget) {
    if (!active) return false;
    const t = Math.min(1, (now - startMs) / durationMs);
    sample(t, outPos, outTarget);
    return true;
  }

  return {
    get active() {
      return active;
    },
    cancel() {
      active = false;
      onComplete = null;
    },
    start(controls, camera, view, opts = {}) {
      const now = opts.now ?? performance.now();
      durationMs = Math.max(80, opts.durationMs ?? 400);
      onComplete = opts.onComplete ?? null;

      if (active) {
        currentSample(now, fromPos, fromTarget);
      } else {
        fromPos.copy(camera.position);
        fromTarget.copy(controls.target);
      }

      toPos.copy(view.position);
      toTarget.copy(view.target);
      startMs = now;
      active = true;
    },
    tick(now, controls, camera) {
      if (!active) return false;
      const t = Math.min(1, (now - startMs) / durationMs);
      sample(t, camera.position, controls.target);
      controls.update();
      if (t >= 1) {
        camera.position.copy(toPos);
        controls.target.copy(toTarget);
        controls.update();
        active = false;
        const cb = onComplete;
        onComplete = null;
        cb?.();
        return false;
      }
      return true;
    },
  };
}

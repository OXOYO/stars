/** 虚拟星预计算布局（含 topic 环 / 云团摆位） */
export const GALAXY_LAYOUT_VERSION = 3;
/** 摆位/着色/runtime 变更时递增，触发前端重新 buildGalaxyBuffers（与 galaxy.json version 无关） */
export const GALAXY_RUNTIME_LAYOUT_TAG = 'runtime-layout-10';
/** 摆位算法变更时递增，用于 galaxy.json 拉取缓存破坏 */
export const GALAXY_LAYOUT_CACHE_TAG = 'cosmic-universe-36';
/** 旧版：仅每仓一个力导向坐标 */
export const GALAXY_LAYOUT_VERSION_REPO = 2;

function roundPos(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function positionsFiniteRatio(flat) {
  if (!flat?.length) return 0;
  let finite = 0;
  for (let i = 0; i < flat.length; i += 1) {
    const v = flat[i];
    if (v != null && Number.isFinite(v)) finite += 1;
  }
  return finite / flat.length;
}

/**
 * @param {object | null | undefined} layout
 */
export function isVirtualGalaxyLayout(layout) {
  return layout?.version === GALAXY_LAYOUT_VERSION;
}

/**
 * @param {object | null | undefined} layout
 */
export function hasValidGalaxyLayout(layout) {
  const v = layout?.version;
  if (v !== GALAXY_LAYOUT_VERSION && v !== GALAXY_LAYOUT_VERSION_REPO) {
    return false;
  }
  if (!Array.isArray(layout.positions) || layout.positions.length < 3) {
    return false;
  }
  if (layout.positions.length % 3 !== 0) return false;
  return positionsFiniteRatio(layout.positions) >= 0.95;
}

/**
 * @param {Array<{ id?: string }>} items
 * @param {(items: object[]) => { positions: Float32Array, anchorIndex: number }} runLayout
 */
export function serializeGalaxyLayout(items, runLayout) {
  const list = items || [];
  if (!list.length) {
    return { version: GALAXY_LAYOUT_VERSION_REPO, anchorId: null, positions: [] };
  }

  const { positions, anchorIndex } = runLayout(list);
  const flat = new Array(list.length * 3);
  for (let i = 0; i < list.length; i += 1) {
    flat[i * 3] = roundPos(positions[i * 3]);
    flat[i * 3 + 1] = roundPos(positions[i * 3 + 1]);
    flat[i * 3 + 2] = roundPos(positions[i * 3 + 2]);
  }

  return {
    version: GALAXY_LAYOUT_VERSION_REPO,
    anchorId: list[anchorIndex]?.id ?? null,
    positions: flat,
  };
}

/**
 * @param {Array<{ id?: string }>} items
 * @param {import('./virtual-stars.js').VirtualStar[]} virtualStars
 * @param {Float32Array} positions
 * @param {number} anchorRepoIndex
 */
export function serializeVirtualGalaxyLayout(items, virtualStars, positions, anchorRepoIndex) {
  const list = items || [];
  const n = virtualStars?.length ?? 0;
  if (!n) {
    return { version: GALAXY_LAYOUT_VERSION, anchorId: null, positions: [] };
  }

  const flat = new Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    flat[i * 3] = roundPos(positions[i * 3]);
    flat[i * 3 + 1] = roundPos(positions[i * 3 + 1]);
    flat[i * 3 + 2] = roundPos(positions[i * 3 + 2]);
  }

  let anchorId = null;
  if (anchorRepoIndex >= 0 && list[anchorRepoIndex]?.id) {
    anchorId = list[anchorRepoIndex].id;
  }

  return {
    version: GALAXY_LAYOUT_VERSION,
    anchorId,
    positions: flat,
  };
}

/**
 * @param {ReturnType<typeof serializeGalaxyLayout> | ReturnType<typeof serializeVirtualGalaxyLayout>} layout
 */
export function isSerializableGalaxyLayout(layout) {
  return hasValidGalaxyLayout(layout);
}

/**
 * @param {Array<{ id?: string }>} items
 */
export function buildGalaxyIndexMap(items) {
  const map = new Map();
  for (let i = 0; i < items.length; i += 1) {
    const id = items[i]?.id;
    if (id) map.set(id, i);
  }
  return map;
}

/**
 * @param {import('./virtual-stars.js').VirtualStar[]} virtualStars
 */
export function buildGalaxyVirtualIndexMap(virtualStars) {
  const map = new Map();
  for (let i = 0; i < virtualStars.length; i += 1) {
    map.set(virtualStars[i].virtualKey, i);
  }
  return map;
}

/**
 * 从全量预计算布局中取出当前可见仓库的坐标（v2 每仓一点）
 * @param {Array<{ id?: string }>} items
 * @param {object} layout
 * @param {Map<string, number>} indexMap
 */
export function extractLayoutPositions(items, layout, indexMap) {
  if (!hasValidGalaxyLayout(layout) || layout.version !== GALAXY_LAYOUT_VERSION_REPO) return null;
  if (!indexMap?.size) return null;

  const list = items || [];
  const n = list.length;
  if (!n) {
    return { positions: new Float32Array(0), anchorIndex: -1 };
  }

  const out = new Float32Array(n * 3);
  let anchorIndex = -1;

  for (let i = 0; i < n; i += 1) {
    const id = list[i]?.id;
    if (!id) return null;
    const globalIdx = indexMap.get(id);
    if (globalIdx == null) return null;

    const g = globalIdx * 3;
    if (g + 2 >= layout.positions.length) return null;

    const x = layout.positions[g];
    const y = layout.positions[g + 1];
    const z = layout.positions[g + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;

    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z;

    if (layout.anchorId && id === layout.anchorId) anchorIndex = i;
  }

  return { positions: out, anchorIndex };
}

/**
 * 从 v3 预计算布局取出当前可见虚拟星坐标
 * @param {import('./virtual-stars.js').VirtualStar[]} virtualStars
 * @param {object} layout
 * @param {Map<string, number>} virtualIndexMap
 */
export function extractVirtualLayoutPositions(virtualStars, layout, virtualIndexMap) {
  if (!isVirtualGalaxyLayout(layout) || !virtualIndexMap?.size) return null;

  const list = virtualStars || [];
  const n = list.length;
  if (!n) {
    return { positions: new Float32Array(0), anchorIndex: -1 };
  }

  const out = new Float32Array(n * 3);
  let anchorIndex = -1;

  for (let i = 0; i < n; i += 1) {
    const key = list[i].virtualKey;
    const globalIdx = virtualIndexMap.get(key);
    if (globalIdx == null) return null;

    const g = globalIdx * 3;
    if (g + 2 >= layout.positions.length) return null;

    const x = layout.positions[g];
    const y = layout.positions[g + 1];
    const z = layout.positions[g + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;

    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z;

    if (layout.anchorId && list[i].repoId === layout.anchorId && anchorIndex < 0) {
      anchorIndex = i;
    }
  }

  return { positions: out, anchorIndex };
}

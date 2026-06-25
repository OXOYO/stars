/** 与 generate 写入 stars.json 的 galaxy 字段版本对齐；算法变更时需递增 */
export const GALAXY_LAYOUT_VERSION = 2;

function roundPos(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

/**
 * @param {object | null | undefined} layout
 */
export function hasValidGalaxyLayout(layout) {
  if (
    layout?.version !== GALAXY_LAYOUT_VERSION ||
    !Array.isArray(layout.positions) ||
    layout.positions.length < 3
  ) {
    return false;
  }
  const flat = layout.positions;
  if (flat.length % 3 !== 0) return false;

  let finite = 0;
  for (let i = 0; i < flat.length; i += 1) {
    const v = flat[i];
    if (v != null && Number.isFinite(v)) finite += 1;
  }
  // 至少 95% 坐标有效，否则视为损坏的预计算数据
  return finite / flat.length >= 0.95;
}

/**
 * @param {Array<{ id?: string }>} items
 * @param {(items: object[]) => { positions: Float32Array, anchorIndex: number }} runLayout
 */
export function serializeGalaxyLayout(items, runLayout) {
  const list = items || [];
  if (!list.length) {
    return { version: GALAXY_LAYOUT_VERSION, anchorId: null, positions: [] };
  }

  const { positions, anchorIndex } = runLayout(list);
  const flat = new Array(list.length * 3);
  for (let i = 0; i < list.length; i += 1) {
    flat[i * 3] = roundPos(positions[i * 3]);
    flat[i * 3 + 1] = roundPos(positions[i * 3 + 1]);
    flat[i * 3 + 2] = roundPos(positions[i * 3 + 2]);
  }

  return {
    version: GALAXY_LAYOUT_VERSION,
    anchorId: list[anchorIndex]?.id ?? null,
    positions: flat,
  };
}

/**
 * 序列化后校验，避免 NaN 被 JSON 写成 null 却当作有效布局
 * @param {ReturnType<typeof serializeGalaxyLayout>} layout
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
 * 从全量预计算布局中取出当前可见仓库的坐标
 * @param {Array<{ id?: string }>} items
 * @param {object} layout
 * @param {Map<string, number>} indexMap
 */
export function extractLayoutPositions(items, layout, indexMap) {
  if (!hasValidGalaxyLayout(layout) || !indexMap?.size) return null;

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

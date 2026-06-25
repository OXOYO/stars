import { FORCE_LAYOUT } from './constants.js';
import { gauss3, hashSeed, hashStr } from './hash.js';
import {
  findAnchorIndex,
  pairSimilarity,
  prepareForceNodes,
} from './force-similarity.js';

/**
 * @typedef {{ i: number, j: number, w: number, sameLang: boolean }} ForceEdge
 */

/** @type {number[][]} */
const cellListPool = [];

function borrowCellList() {
  return cellListPool.length ? cellListPool.pop() : [];
}

function recycleCellList(list) {
  list.length = 0;
  cellListPool.push(list);
}

/**
 * @param {number[]} bucket
 * @param {number} self
 * @param {number} maxSample
 */
function sampleBucketIndices(bucket, self, maxSample) {
  if (bucket.length <= maxSample + 1) {
    /** @type {number[]} */
    const out = [];
    for (const j of bucket) {
      if (j !== self) out.push(j);
    }
    return out;
  }

  /** @type {number[]} */
  const out = [];
  const step = Math.max(1, Math.floor(bucket.length / maxSample));
  for (let k = 0; k < bucket.length && out.length < maxSample; k += step) {
    const j = bucket[k];
    if (j !== self) out.push(j);
  }
  return out;
}

/**
 * @param {ReturnType<typeof prepareForceNodes>} nodes
 * @param {typeof FORCE_LAYOUT} cfg
 */
function buildLangClusterMeta(nodes, cfg) {
  /** @type {Map<string, number>} */
  const langToIdx = new Map();
  /** @type {string[]} */
  const langs = [];
  /** @type {Int16Array} */
  const langIndex = new Int16Array(nodes.length);
  /** @type {number[][]} */
  const langCenters = [];

  for (let i = 0; i < nodes.length; i += 1) {
    const lang = String(nodes[i].language || '其他');
    if (!langToIdx.has(lang)) {
      langToIdx.set(lang, langs.length);
      langs.push(lang);
    }
    langIndex[i] = langToIdx.get(lang);
  }

  const golden = Math.PI * (3 - Math.sqrt(5));
  const R = cfg.INIT_CLUSTER_RADIUS;
  langs.forEach((lang, li) => {
    const phi = Math.acos(1 - 2 * (li + 0.5) / Math.max(langs.length, 1));
    const theta = li * golden * 2.618 - Math.PI / 2;
    langCenters[li] = [
      R * Math.sin(phi) * Math.cos(theta),
      R * Math.cos(phi) * 0.68,
      R * Math.sin(phi) * Math.sin(theta),
    ];
  });

  return { langIndex, langCenters, langs };
}

/**
 * @param {ReturnType<typeof prepareForceNodes>} nodes
 * @param {number} anchorIndex
 * @param {Int16Array} langIndex
 * @param {typeof FORCE_LAYOUT} cfg
 * @returns {ForceEdge[]}
 */
function buildEdges(nodes, anchorIndex, langIndex, cfg) {
  const n = nodes.length;
  if (n <= 1) return [];

  /** @type {Map<string, number[]>} */
  const langBuckets = new Map();
  /** @type {Map<string, number[]>} */
  const topicIndex = new Map();

  for (let i = 0; i < n; i += 1) {
    const lang = String(nodes[i].language || '其他');
    if (!langBuckets.has(lang)) langBuckets.set(lang, []);
    langBuckets.get(lang).push(i);

    for (const topic of nodes[i].topics) {
      if (!topicIndex.has(topic)) topicIndex.set(topic, []);
      topicIndex.get(topic).push(i);
    }
  }

  const simCtx = {
    weights: cfg.WEIGHTS,
    timeTauDays: cfg.TIME_TAU_DAYS,
  };

  /** @type {ForceEdge[]} */
  const edges = [];
  /** @type {Set<string>} */
  const seen = new Set();

  const addEdge = (i, j, w) => {
    if (i === j || w < cfg.SIM_THRESHOLD) return;
    const sameLang = langIndex[i] === langIndex[j];
    if (!sameLang && w < cfg.CROSS_LANG_SIM_MIN) return;
    const a = Math.min(i, j);
    const b = Math.max(i, j);
    const key = `${a}:${b}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ i: a, j: b, w, sameLang });
  };

  for (let i = 0; i < n; i += 1) {
    /** @type {Map<number, number>} */
    const scores = new Map();

    const lang = String(nodes[i].language || '其他');
    const bucket = langBuckets.get(lang) || [];
    for (const j of sampleBucketIndices(bucket, i, cfg.LANG_BUCKET_MAX)) {
      const s = pairSimilarity(nodes[i], nodes[j], simCtx);
      if (s > scores.get(j) || !scores.has(j)) scores.set(j, s);
    }

    /** @type {Set<number>} */
    const topicPeers = new Set();
    for (const topic of nodes[i].topics) {
      const peers = topicIndex.get(topic) || [];
      if (peers.length <= cfg.TOPIC_PEER_MAX) {
        for (const j of peers) {
          if (j !== i) topicPeers.add(j);
        }
      } else {
        const step = Math.max(1, Math.floor(peers.length / cfg.TOPIC_PEER_MAX));
        for (let k = 0; k < peers.length && topicPeers.size < cfg.TOPIC_PEER_MAX; k += step) {
          const j = peers[k];
          if (j !== i) topicPeers.add(j);
        }
      }
    }

    for (const j of topicPeers) {
      const s = pairSimilarity(nodes[i], nodes[j], simCtx);
      const prev = scores.get(j);
      if (prev == null || s > prev) scores.set(j, s);
    }

    if (anchorIndex >= 0 && anchorIndex !== i) {
      const s = pairSimilarity(nodes[i], nodes[anchorIndex], simCtx);
      const prev = scores.get(anchorIndex);
      if (prev == null || s > prev) scores.set(anchorIndex, Math.max(s, 0.2));
    }

    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, cfg.NEIGHBOR_K);
    for (const [j, w] of ranked) {
      addEdge(i, j, w);
    }
  }

  return edges;
}

/**
 * @param {number} i
 * @param {number} j
 * @param {Float32Array} positions
 * @param {number} strength
 * @param {Int16Array} langIndex
 * @param {number} interMul
 * @param {Float32Array} fx
 * @param {Float32Array} fy
 * @param {Float32Array} fz
 * @param {'pair' | 'onI'} mode
 */
function applyRepulsion(i, j, positions, strength, langIndex, interMul, fx, fy, fz, mode) {
  const ix = positions[i * 3];
  const iy = positions[i * 3 + 1];
  const iz = positions[i * 3 + 2];
  let rx = ix - positions[j * 3];
  let ry = iy - positions[j * 3 + 1];
  let rz = iz - positions[j * 3 + 2];
  const d2 = rx * rx + ry * ry + rz * rz + 0.64;
  const mul = langIndex[i] === langIndex[j] ? 1 : interMul;
  const invD = (strength * mul) / d2;
  rx *= invD;
  ry *= invD;
  rz *= invD;
  fx[i] += rx;
  fy[i] += ry;
  fz[i] += rz;
  if (mode === 'pair') {
    fx[j] -= rx;
    fy[j] -= ry;
    fz[j] -= rz;
  }
}

function distSq(positions, i, j) {
  const dx = positions[i * 3] - positions[j * 3];
  const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
  const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
  return dx * dx + dy * dy + dz * dz;
}

/**
 * 从邻近网格收集距 i 最近的 K 个节点（避免密集胞内全量排序）
 * @param {Float32Array} positions
 * @param {number} i
 * @param {Map<string, number[]>} grid
 * @param {number} cx
 * @param {number} cy
 * @param {number} cz
 * @param {number} maxK
 * @returns {number[]}
 */
function nearestGridNeighbors(positions, i, grid, cx, cy, cz, maxK) {
  /** @type {number[]} */
  const best = [];
  /** @type {number[]} */
  const bestD = [];

  const tryAdd = (j) => {
    if (j === i) return;
    const d = distSq(positions, i, j);
    if (best.length < maxK) {
      best.push(j);
      bestD.push(d);
      return;
    }
    let worst = 0;
    for (let k = 1; k < best.length; k += 1) {
      if (bestD[k] > bestD[worst]) worst = k;
    }
    if (d < bestD[worst]) {
      best[worst] = j;
      bestD[worst] = d;
    }
  };

  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        const cell = grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
        if (!cell) continue;
        const sample = cell.length > 20 ? sampleCellIndices(cell, 20) : cell;
        for (const j of sample) tryAdd(j);
      }
    }
  }

  return best;
}

/**
 * @param {number[]} cell
 * @param {number} maxSample
 */
function sampleCellIndices(cell, maxSample) {
  if (cell.length <= maxSample) return cell;
  const out = [];
  const step = Math.max(1, Math.floor(cell.length / maxSample));
  for (let k = 0; k < cell.length && out.length < maxSample; k += step) {
    out.push(cell[k]);
  }
  return out;
}

/**
 * @param {Float32Array} positions
 * @param {number} n
 * @param {number} cellSize
 * @param {number} strength
 * @param {Int16Array} langIndex
 * @param {typeof FORCE_LAYOUT} cfg
 * @param {Float32Array} fx
 * @param {Float32Array} fy
 * @param {Float32Array} fz
 * @param {Map<string, number[]>} grid
 */
function applyGridRepulsion(positions, n, cellSize, strength, langIndex, cfg, fx, fy, fz, grid) {
  for (const list of grid.values()) recycleCellList(list);
  grid.clear();

  const inv = 1 / cellSize;
  const interMul = cfg.INTER_LANG_REPULSE;
  const maxNeighbors = cfg.REPULSION_MAX_NEIGHBORS || 0;

  for (let i = 0; i < n; i += 1) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    const key = `${Math.floor(x * inv)},${Math.floor(y * inv)},${Math.floor(z * inv)}`;
    let cell = grid.get(key);
    if (!cell) {
      cell = borrowCellList();
      grid.set(key, cell);
    }
    cell.push(i);
  }

  /** @type {number[] | null} */
  const scratch = null;

  for (let i = 0; i < n; i += 1) {
    const ix = positions[i * 3];
    const iy = positions[i * 3 + 1];
    const iz = positions[i * 3 + 2];
    const cx = Math.floor(ix * inv);
    const cy = Math.floor(iy * inv);
    const cz = Math.floor(iz * inv);

    if (maxNeighbors > 0) {
      const unique = nearestGridNeighbors(positions, i, grid, cx, cy, cz, maxNeighbors);
      for (const j of unique) {
        applyRepulsion(i, j, positions, strength, langIndex, interMul, fx, fy, fz, 'onI');
      }
      continue;
    }

    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const cell = grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
          if (!cell) continue;
          for (const j of cell) {
            if (j <= i) continue;
            applyRepulsion(i, j, positions, strength, langIndex, interMul, fx, fy, fz, 'pair');
          }
        }
      }
    }
  }
}

/**
 * @param {ForceEdge[]} edges
 * @param {Float32Array} positions
 * @param {typeof FORCE_LAYOUT} cfg
 * @param {Float32Array} fx
 * @param {Float32Array} fy
 * @param {Float32Array} fz
 */
function applySprings(edges, positions, cfg, fx, fy, fz) {
  for (const { i, j, w, sameLang } of edges) {
    let dx = positions[j * 3] - positions[i * 3];
    let dy = positions[j * 3 + 1] - positions[i * 3 + 1];
    let dz = positions[j * 3 + 2] - positions[i * 3 + 2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.02;
    const restBase = sameLang ? cfg.INTRA_REST_LENGTH : cfg.CROSS_REST_LENGTH;
    const rest = restBase * (1.06 - w * 0.68);
    const spring = cfg.SPRING * (sameLang ? cfg.INTRA_LANG_SPRING : cfg.CROSS_LANG_SPRING);
    const f = spring * (dist - rest) / dist;
    dx *= f;
    dy *= f;
    dz *= f;
    fx[i] += dx;
    fy[i] += dy;
    fz[i] += dz;
    fx[j] -= dx;
    fy[j] -= dy;
    fz[j] -= dz;
  }
}

/**
 * @param {Float32Array} positions
 * @param {number} n
 * @param {Int16Array} langIndex
 * @param {number[][]} langCenters
 * @param {number} anchorIndex
 * @param {number} strength
 * @param {Float32Array} fx
 * @param {Float32Array} fy
 * @param {Float32Array} fz
 */
function applyLangClusterPull(
  positions,
  n,
  langIndex,
  langCenters,
  anchorIndex,
  strength,
  fx,
  fy,
  fz
) {
  for (let i = 0; i < n; i += 1) {
    if (i === anchorIndex) continue;
    const li = langIndex[i];
    const center = langCenters[li];
    if (!center) continue;
    fx[i] += (center[0] - positions[i * 3]) * strength;
    fy[i] += (center[1] - positions[i * 3 + 1]) * strength;
    fz[i] += (center[2] - positions[i * 3 + 2]) * strength;
  }
}

/**
 * @param {Float32Array} positions
 * @param {number} n
 * @param {number} targetSpan
 */
function normalizeSpan(positions, n, targetSpan) {
  let maxR = 1;
  for (let i = 0; i < n; i += 1) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    maxR = Math.max(maxR, Math.sqrt(x * x + y * y + z * z));
  }
  const scale = targetSpan / maxR;
  if (Math.abs(scale - 1) < 0.02) return;
  for (let i = 0; i < n; i += 1) {
    positions[i * 3] *= scale;
    positions[i * 3 + 1] *= scale;
    positions[i * 3 + 2] *= scale;
  }
}

/**
 * 按星数自动收紧参数，避免 4000+ 星离线/在线计算过慢
 * @param {number} n
 * @param {Partial<typeof FORCE_LAYOUT>} overrides
 */
function resolveLayoutConfig(n, overrides = {}) {
  const cfg = { ...FORCE_LAYOUT, ...overrides };
  cfg.REPULSION_MAX_NEIGHBORS = 0;

  if (n > 2500) {
    cfg.STEPS = Math.min(cfg.STEPS, 120);
    cfg.CELL_SIZE = 22;
    cfg.LANG_BUCKET_MAX = Math.min(cfg.LANG_BUCKET_MAX, 36);
    cfg.TOPIC_PEER_MAX = Math.min(cfg.TOPIC_PEER_MAX, 28);
  } else if (n > 1200) {
    cfg.STEPS = Math.min(cfg.STEPS, 160);
    cfg.CELL_SIZE = 20;
  }
  return cfg;
}

/**
 * 3D 力导向布局：位置仅由仿真决定
 * @param {Array<object>} items
 * @param {Partial<typeof FORCE_LAYOUT>} [overrides]
 */
export function runForceLayout3D(items, overrides = {}) {
  const list = items || [];
  const n = list.length;
  const cfg = resolveLayoutConfig(n, overrides);
  const positions = new Float32Array(n * 3);

  if (n === 0) {
    return { positions, anchorIndex: -1, edges: [] };
  }

  const nodes = prepareForceNodes(list);
  const anchorIndex = findAnchorIndex(nodes);
  const { langIndex, langCenters } = buildLangClusterMeta(nodes, cfg);
  const edges = buildEdges(nodes, anchorIndex, langIndex, cfg);

  for (let i = 0; i < n; i += 1) {
    if (i === anchorIndex) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
      continue;
    }
    const li = langIndex[i];
    const center = langCenters[li] || [0, 0, 0];
    const h = hashStr(list[i].id || list[i].fullName || String(i));
    const jitter = 7.5 + (hashSeed(h, 'j') % 1000) / 1000 * 5;
    positions[i * 3] = center[0] + gauss3(h, h >>> 3, h >>> 7) * jitter;
    positions[i * 3 + 1] = center[1] + gauss3(h >>> 4, h >>> 8, h >>> 12) * jitter * 0.85;
    positions[i * 3 + 2] = center[2] + gauss3(h >>> 5, h >>> 9, h >>> 13) * jitter;
  }

  const vx = new Float32Array(n);
  const vy = new Float32Array(n);
  const vz = new Float32Array(n);
  const fx = new Float32Array(n);
  const fy = new Float32Array(n);
  const fz = new Float32Array(n);
  /** @type {Map<string, number[]>} */
  const grid = new Map();

  const {
    STEPS,
    DT,
    DAMPING,
    REPULSION,
    CELL_SIZE,
    CENTER_GRAVITY,
    LANG_CLUSTER_PULL,
    EARLY_STOP_MIN,
    EARLY_STOP_V,
  } = cfg;

  for (let step = 0; step < STEPS; step += 1) {
    fx.fill(0);
    fy.fill(0);
    fz.fill(0);

    applyGridRepulsion(positions, n, CELL_SIZE, REPULSION, langIndex, cfg, fx, fy, fz, grid);
    applySprings(edges, positions, cfg, fx, fy, fz);

    if (LANG_CLUSTER_PULL > 0) {
      const pull = LANG_CLUSTER_PULL * (1 - step / STEPS * 0.65);
      applyLangClusterPull(
        positions,
        n,
        langIndex,
        langCenters,
        anchorIndex,
        pull,
        fx,
        fy,
        fz
      );
    }

    if (CENTER_GRAVITY > 0) {
      for (let i = 0; i < n; i += 1) {
        if (i === anchorIndex) continue;
        fx[i] -= positions[i * 3] * CENTER_GRAVITY;
        fy[i] -= positions[i * 3 + 1] * CENTER_GRAVITY;
        fz[i] -= positions[i * 3 + 2] * CENTER_GRAVITY;
      }
    }

    const cool = 1 - step / STEPS;
    const dt = DT * (0.35 + cool * 0.65);
    let maxSpeed = 0;

    for (let i = 0; i < n; i += 1) {
      if (i === anchorIndex) {
        vx[i] = 0;
        vy[i] = 0;
        vz[i] = 0;
        positions[i * 3] = 0;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = 0;
        continue;
      }

      vx[i] = (vx[i] + fx[i] * dt) * DAMPING;
      vy[i] = (vy[i] + fy[i] * dt) * DAMPING;
      vz[i] = (vz[i] + fz[i] * dt) * DAMPING;

      const speedCap = 12;
      vx[i] = Math.max(-speedCap, Math.min(speedCap, vx[i]));
      vy[i] = Math.max(-speedCap, Math.min(speedCap, vy[i]));
      vz[i] = Math.max(-speedCap, Math.min(speedCap, vz[i]));

      positions[i * 3] += vx[i];
      positions[i * 3 + 1] += vy[i];
      positions[i * 3 + 2] += vz[i];

      maxSpeed = Math.max(
        maxSpeed,
        Math.abs(vx[i]) + Math.abs(vy[i]) + Math.abs(vz[i])
      );
    }

    if (step >= EARLY_STOP_MIN && maxSpeed < EARLY_STOP_V) break;
  }

  normalizeSpan(positions, n, cfg.TARGET_SPAN);

  positions[anchorIndex * 3] = 0;
  positions[anchorIndex * 3 + 1] = 0;
  positions[anchorIndex * 3 + 2] = 0;

  return { positions, anchorIndex, edges, anchorItem: list[anchorIndex] };
}

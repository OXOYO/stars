import { FORCE_LAYOUT, HIERARCHY_LAYOUT } from './constants.js';
import { gauss3, hashSeed, hashStr } from './hash.js';
import { runIntraClusterForceSimulation } from './force-layout.js';
import { prepareForceNodesFromVirtualStars } from './force-similarity.js';
import {
  topicRingKey,
  virtualLanguageKey,
  placeRingGroup,
} from './virtual-stars.js';

function hashUnit(h, shift = 0) {
  return ((h >>> shift) & 0xfffffff) / 0xfffffff;
}

/**
 * @typedef {{ lang: string, indices: number[], count: number }} LangGroup
 * @typedef {{ key: string, topic: string | null, indices: number[], count: number, isRing: boolean }} TopicGroup
 */

/**
 * @param {import('./virtual-stars.js').VirtualStar[]} virtualStars
 * @param {ReturnType<typeof import('./positions.js').buildLanguageLayout>} layout
 * @returns {LangGroup[]}
 */
function groupByLanguage(virtualStars, layout) {
  /** @type {Map<string, LangGroup>} */
  const map = new Map();
  for (let i = 0; i < virtualStars.length; i += 1) {
    const lang = virtualLanguageKey(virtualStars[i], layout);
    if (!map.has(lang)) {
      map.set(lang, { lang, indices: [], count: 0 });
    }
    const g = map.get(lang);
    g.indices.push(i);
    g.count += 1;
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.lang.localeCompare(b.lang, 'zh-CN'));
}

/**
 * @param {number} langCount
 * @param {number} [targetSpan]
 */
function languageGalaxyRadius(langCount, targetSpan = FORCE_LAYOUT.TARGET_SPAN) {
  return Math.min(
    targetSpan * HIERARCHY_LAYOUT.GALAXY_VOLUME_RATIO,
    Math.max(
      HIERARCHY_LAYOUT.RING_GROUP_SPREAD_MIN,
      Math.sqrt(langCount) * HIERARCHY_LAYOUT.CLOUD_SPREAD_SCALE * 2.1
    )
  );
}

/**
 * 宇宙层：语言星系不规则散布（螺旋扇区 + 3D 扰动，非均匀球壳）
 * @param {LangGroup[]} langGroups
 * @param {ReturnType<typeof import('./positions.js').buildLanguageLayout>} layout
 * @param {number} targetSpan
 * @returns {Map<string, [number, number, number]>}
 */
function layoutLanguageClusterCenters(langGroups, layout, targetSpan) {
  const n = langGroups.length;
  /** @type {Map<string, [number, number, number]>} */
  const centers = new Map();
  if (!n) return centers;

  const totalStars = langGroups.reduce((s, g) => s + g.count, 0);
  const primaryLang = langGroups[0]?.lang;
  const { UNIVERSE_R_BASE, UNIVERSE_R_SPREAD } = HIERARCHY_LAYOUT;
  const positions = new Float32Array(n * 3);

  for (let i = 0; i < n; i += 1) {
    const lang = langGroups[i].lang;
    const share = langGroups[i].count / Math.max(totalStars, 1);
    const h = hashStr(`lang-universe:${lang}`);

    if (lang === primaryLang) {
      const core = targetSpan * 0.045;
      positions[i * 3] = gauss3(hashSeed(h, 'c1'), hashSeed(h, 'c2'), hashSeed(h, 'c3')) * core;
      positions[i * 3 + 1] =
        gauss3(hashSeed(h, 'c4'), hashSeed(h, 'c5'), hashSeed(h, 'c6')) * core * 0.85;
      positions[i * 3 + 2] =
        gauss3(hashSeed(h, 'c7'), hashSeed(h, 'c8'), hashSeed(h, 'c9')) * core;
    } else {
      const ang = layout.langAngles.get(lang) ?? i * 1.17 - Math.PI / 2;
      const rr =
        targetSpan * (UNIVERSE_R_BASE + UNIVERSE_R_SPREAD * Math.cbrt(share)) *
        (0.92 + hashUnit(h, 6) * 0.1);
      const ySpread =
        targetSpan * (HIERARCHY_LAYOUT.LANG_IRREGULAR_Y + hashUnit(h, 9) * 0.08);
      const jitterXZ =
        gauss3(hashSeed(h, 'j1'), hashSeed(h, 'j2'), hashSeed(h, 'j3')) * targetSpan * 0.04;

      positions[i * 3] = Math.cos(ang) * rr + jitterXZ;
      positions[i * 3 + 1] =
        gauss3(hashSeed(h, 'y1'), hashSeed(h, 'y2'), hashSeed(h, 'y3')) * ySpread;
      positions[i * 3 + 2] = Math.sin(ang) * rr + jitterXZ * 0.85;
    }
  }

  compactLanguageMetaCenters(positions, n, targetSpan);

  for (let i = 0; i < n; i += 1) {
    centers.set(langGroups[i].lang, [
      positions[i * 3],
      positions[i * 3 + 1],
      positions[i * 3 + 2],
    ]);
  }
  return centers;
}

/** 语言 meta 点归拢到原点附近，避免斥力模拟把团心甩飞 */
function compactLanguageMetaCenters(positions, n, targetSpan) {
  if (n <= 0) return;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < n; i += 1) {
    cx += positions[i * 3];
    cy += positions[i * 3 + 1];
    cz += positions[i * 3 + 2];
  }
  const inv = 1 / n;
  cx *= inv;
  cy *= inv;
  cz *= inv;
  for (let i = 0; i < n; i += 1) {
    positions[i * 3] -= cx;
    positions[i * 3 + 1] -= cy;
    positions[i * 3 + 2] -= cz;
  }

  let maxR = 0.01;
  for (let i = 0; i < n; i += 1) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    maxR = Math.max(maxR, Math.sqrt(x * x + y * y + z * z));
  }

  const desired = targetSpan * (HIERARCHY_LAYOUT.UNIVERSE_R_BASE + HIERARCHY_LAYOUT.UNIVERSE_R_SPREAD);
  const scale = desired / maxR;
  for (let i = 0; i < n; i += 1) {
    positions[i * 3] *= scale;
    positions[i * 3 + 1] *= scale;
    positions[i * 3 + 2] *= scale;
  }
}

/**
 * @param {LangGroup} langGroup
 * @param {import('./virtual-stars.js').VirtualStar[]} virtualStars
 * @param {Set<string>} ringKeys
 * @returns {TopicGroup[]}
 */
function groupTopicsInLanguage(langGroup, virtualStars, ringKeys) {
  const lang = langGroup.lang;
  /** @type {Map<string, TopicGroup>} */
  const map = new Map();

  for (const i of langGroup.indices) {
    const v = virtualStars[i];
    const topic = v.topic;
    const key = topic ? topicRingKey(lang, topic) : `${lang}\0__none__`;
    if (!map.has(key)) {
      const isRing = Boolean(topic && ringKeys.has(topicRingKey(lang, topic)));
      map.set(key, { key, topic, indices: [], count: 0, isRing });
    }
    const g = map.get(key);
    g.indices.push(i);
    g.count += 1;
  }

  return [...map.values()].sort(
    (a, b) => b.count - a.count || String(a.topic || '').localeCompare(String(b.topic || ''), 'zh-CN')
  );
}

/**
 * 星系层：语言团内 topic 子团 / 零散星 在 3D 球体内力导
 * @param {TopicGroup[]} topicGroups
 * @param {[number, number, number]} langCenter
 * @param {number} galaxyRadius
 */
function layoutTopicCenters3D(topicGroups, langCenter, galaxyRadius) {
  const n = topicGroups.length;
  /** @type {Map<string, [number, number, number]>} */
  const centers = new Map();
  if (!n) return centers;

  if (n === 1) {
    centers.set(topicGroups[0].key, [...langCenter]);
    return centers;
  }

  const positions = new Float32Array(n * 3);
  const anchor = new Float32Array(n * 3);
  const vx = new Float32Array(n);
  const vy = new Float32Array(n);
  const vz = new Float32Array(n);

  for (let i = 0; i < n; i += 1) {
    const h = hashStr(`topic-3d:${topicGroups[i].key}`);
    const u = hashUnit(h, 1);
    const hv = hashUnit(h, 2);
    const w = hashUnit(h, 3);
    const theta = u * Math.PI * 2;
    const phi = Math.acos(2 * hv - 1);
    const ringBias = topicGroups[i].isRing ? 0.07 + hashUnit(h, 5) * 0.08 : 0;
    const r = galaxyRadius * (0.2 + Math.cbrt(w) * 0.62 + ringBias);
    const ex = 0.68 + hashUnit(h, 6) * 0.52;
    const ey = 0.55 + hashUnit(h, 7) * 0.58;
    const ez = 0.68 + hashUnit(h, 8) * 0.52;
    const jitter = gauss3(hashSeed(h, 'jx'), hashSeed(h, 'jy'), hashSeed(h, 'jz')) * galaxyRadius * 0.07;

    positions[i * 3] =
      langCenter[0] + r * Math.sin(phi) * Math.cos(theta) * ex + jitter;
    positions[i * 3 + 1] =
      langCenter[1] + r * Math.sin(phi) * Math.sin(theta) * ey + jitter * 0.7;
    positions[i * 3 + 2] =
      langCenter[2] + r * Math.cos(phi) * ez + jitter * 0.85;
    anchor[i * 3] = positions[i * 3];
    anchor[i * 3 + 1] = positions[i * 3 + 1];
    anchor[i * 3 + 2] = positions[i * 3 + 2];
  }

  const { TOPIC_FORCE_STEPS, TOPIC_REPULSION, TOPIC_CENTER_PULL } = HIERARCHY_LAYOUT;

  for (let step = 0; step < TOPIC_FORCE_STEPS; step += 1) {
    const fx = new Float32Array(n);
    const fy = new Float32Array(n);
    const fz = new Float32Array(n);
    const cool = 1 - step / TOPIC_FORCE_STEPS;
    const pull = TOPIC_CENTER_PULL * cool;

    for (let i = 0; i < n; i += 1) {
      fx[i] += (langCenter[0] - positions[i * 3]) * pull * 0.55;
      fy[i] += (langCenter[1] - positions[i * 3 + 1]) * pull * 0.55;
      fz[i] += (langCenter[2] - positions[i * 3 + 2]) * pull * 0.55;
      fx[i] += (anchor[i * 3] - positions[i * 3]) * pull * 0.35;
      fy[i] += (anchor[i * 3 + 1] - positions[i * 3 + 1]) * pull * 0.35;
      fz[i] += (anchor[i * 3 + 2] - positions[i * 3 + 2]) * pull * 0.35;
    }

    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        let rx = positions[i * 3] - positions[j * 3];
        let ry = positions[i * 3 + 1] - positions[j * 3 + 1];
        let rz = positions[i * 3 + 2] - positions[j * 3 + 2];
        const d2 = rx * rx + ry * ry + rz * rz + 14;
        const f = (TOPIC_REPULSION * cool * 1.4) / d2;
        rx *= f;
        ry *= f;
        rz *= f;
        fx[i] += rx;
        fy[i] += ry;
        fz[i] += rz;
        fx[j] -= rx;
        fy[j] -= ry;
        fz[j] -= rz;
      }
    }

    const dt = 0.36 * (0.35 + cool * 0.65);
    for (let i = 0; i < n; i += 1) {
      vx[i] = (vx[i] + fx[i] * dt) * 0.83;
      vy[i] = (vy[i] + fy[i] * dt) * 0.83;
      vz[i] = (vz[i] + fz[i] * dt) * 0.83;
      positions[i * 3] += vx[i] * dt;
      positions[i * 3 + 1] += vy[i] * dt;
      positions[i * 3 + 2] += vz[i] * dt;
    }
  }

  for (let i = 0; i < n; i += 1) {
    centers.set(topicGroups[i].key, [
      positions[i * 3],
      positions[i * 3 + 1],
      positions[i * 3 + 2],
    ]);
  }
  return centers;
}

/**
 * 第三层：topic 云团内的单星（同仓多 topic 子弧 + 微散布）
 * @param {number[]} indices
 * @param {import('./virtual-stars.js').VirtualStar[]} virtualStars
 * @param {Float32Array} positions
 * @param {number} cx
 * @param {number} cy
 * @param {number} cz
 * @param {number} spread
 */
function placeTopicCloudStars(indices, virtualStars, positions, cx, cy, cz, spread) {
  const count = indices.length;
  if (!count) return;

  /** @type {Map<string, number>} */
  const repoSlot = new Map();

  for (let j = 0; j < count; j += 1) {
    const i = indices[j];
    const star = virtualStars[i];
    const h = hashStr(star.virtualKey);
    const u = hashUnit(h, 10);
    const hv = hashUnit(h, 11);
    const w = hashUnit(h, 12);
    const theta = u * Math.PI * 2;
    const phi = Math.acos(2 * hv - 1);
    const rr = spread * Math.cbrt(w);
    let px = cx + rr * Math.sin(phi) * Math.cos(theta);
    let py = cy + rr * Math.sin(phi) * Math.sin(theta);
    let pz = cz + rr * Math.cos(phi);

    const slot = repoSlot.get(star.repoId) ?? 0;
    repoSlot.set(star.repoId, slot + 1);
    if (slot > 0) {
      const subAng = slot * 2.1 + hashUnit(h, 4) * 0.4;
      const subR = spread * 0.38;
      px += Math.cos(subAng) * subR;
      pz += Math.sin(subAng) * subR;
    }

    const jitter = spread * 0.22;
    px += gauss3(hashSeed(h, 'jx'), hashSeed(h, 'jy'), hashSeed(h, 'jz')) * jitter;
    py += gauss3(hashSeed(h, 'jy2'), hashSeed(h, 'jy3'), hashSeed(h, 'jy4')) * jitter * 0.65;
    pz += gauss3(hashSeed(h, 'jz2'), hashSeed(h, 'jz3'), hashSeed(h, 'jz4')) * jitter;

    positions[i * 3] = px;
    positions[i * 3 + 1] = py;
    positions[i * 3 + 2] = pz;
  }
}

function initLanguageStarPositions(
  virtualStars,
  positions,
  topicGroups,
  topicCenters,
  langCenter,
  galaxyRadius
) {
  for (const topicGroup of topicGroups) {
    const center = topicCenters.get(topicGroup.key) ?? langCenter;
    const [tcx, tcy, tcz] = center;
    const cloudSpread =
      HIERARCHY_LAYOUT.CLOUD_SPREAD_BASE +
      Math.sqrt(topicGroup.count) * HIERARCHY_LAYOUT.CLOUD_SPREAD_PER_STAR;

    if (topicGroup.isRing && topicGroup.topic) {
      const ringSpread = Math.min(
        Math.max(
          HIERARCHY_LAYOUT.RING_GROUP_SPREAD_MIN,
          cloudSpread * 1.1,
          galaxyRadius * 0.18
        ),
        galaxyRadius * HIERARCHY_LAYOUT.RING_MAX_SPREAD_RATIO
      );
      placeRingGroup(
        virtualStars,
        topicGroup.indices,
        positions,
        tcx,
        tcy,
        tcz,
        ringSpread,
        topicGroup.key
      );
    } else {
      placeTopicCloudStars(
        topicGroup.indices,
        virtualStars,
        positions,
        tcx,
        tcy,
        tcz,
        Math.max(HIERARCHY_LAYOUT.CLOUD_SPREAD_BASE, cloudSpread)
      );
    }
  }
}

/**
 * @param {TopicGroup[]} topicGroups
 * @param {number[]} globalIndices
 * @param {Float32Array} positions
 */
function buildRingChordEdges(topicGroups, globalIndices, positions) {
  /** @type {import('./force-layout.js').ForceEdge[]} */
  const edges = [];
  /** @type {Map<number, number>} */
  const globalToLocal = new Map();
  for (let li = 0; li < globalIndices.length; li += 1) {
    globalToLocal.set(globalIndices[li], li);
  }

  for (const tg of topicGroups) {
    if (!tg.isRing || tg.indices.length < 3) continue;

    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const gi of tg.indices) {
      cx += positions[gi * 3];
      cy += positions[gi * 3 + 1];
      cz += positions[gi * 3 + 2];
    }
    const inv = 1 / tg.indices.length;
    cx *= inv;
    cy *= inv;
    cz *= inv;

    const sorted = sortRingIndices3D(tg.indices, positions, tg.key);

    for (let k = 0; k < sorted.length; k += 1) {
      const la = globalToLocal.get(sorted[k]);
      const lb = globalToLocal.get(sorted[(k + 1) % sorted.length]);
      if (la == null || lb == null) continue;
      const i = Math.min(la, lb);
      const j = Math.max(la, lb);
      edges.push({ i, j, w: 0.94, sameLang: true });
    }
  }
  return edges;
}

/**
 * @param {number[]} indices
 * @param {Float32Array} positions
 * @param {string} ringKey
 */
function sortRingIndices3D(indices, positions, ringKey) {
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const gi of indices) {
    cx += positions[gi * 3];
    cy += positions[gi * 3 + 1];
    cz += positions[gi * 3 + 2];
  }
  const inv = 1 / indices.length;
  cx *= inv;
  cy *= inv;
  cz *= inv;

  const h = hashStr(`ring-normal:${ringKey}`);
  let nx = gauss3(hashSeed(h, 'n1'), hashSeed(h, 'n2'), hashSeed(h, 'n3'));
  let ny = gauss3(hashSeed(h, 'n4'), hashSeed(h, 'n5'), hashSeed(h, 'n6'));
  let nz = gauss3(hashSeed(h, 'n7'), hashSeed(h, 'n8'), hashSeed(h, 'n9'));
  const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz) + 0.01;
  nx /= nLen;
  ny /= nLen;
  nz /= nLen;

  let ux = 0;
  let uy = 1;
  let uz = 0;
  if (Math.abs(ny) > 0.92) {
    ux = 1;
    uy = 0;
    uz = 0;
  }
  let vx = uy * nz - uz * ny;
  let vy = uz * nx - ux * nz;
  let vz = ux * ny - uy * nx;
  const vLen = Math.sqrt(vx * vx + vy * vy + vz * vz) + 0.01;
  vx /= vLen;
  vy /= vLen;
  vz /= vLen;
  ux = vy * nz - vz * ny;
  uy = vz * nx - vx * nz;
  uz = vx * ny - vy * nx;

  return [...indices].sort((a, b) => {
    const ax = positions[a * 3] - cx;
    const ay = positions[a * 3 + 1] - cy;
    const az = positions[a * 3 + 2] - cz;
    const bx = positions[b * 3] - cx;
    const by = positions[b * 3 + 1] - cy;
    const bz = positions[b * 3 + 2] - cz;
    const aAng = Math.atan2(
      ay * vy + az * vz + ax * vx,
      ay * uy + az * uz + ax * ux
    );
    const bAng = Math.atan2(
      by * vy + bz * vz + bx * vx,
      by * uy + bz * uz + bx * ux
    );
    return aAng - bAng;
  });
}

/**
 * 团内力导后按语言锚点收束半径，防止大团斥力炸开
 */
function normalizeClusterAroundCenter(positions, n, center, targetRadius) {
  const [cx, cy, cz] = center;
  let maxR = 0.01;
  for (let i = 0; i < n; i += 1) {
    const dx = positions[i * 3] - cx;
    const dy = positions[i * 3 + 1] - cy;
    const dz = positions[i * 3 + 2] - cz;
    maxR = Math.max(maxR, Math.sqrt(dx * dx + dy * dy + dz * dz));
  }
  const scale = Math.min(1.06, targetRadius / maxR);
  if (Math.abs(scale - 1) < 0.02) return;
  for (let i = 0; i < n; i += 1) {
    positions[i * 3] = cx + (positions[i * 3] - cx) * scale;
    positions[i * 3 + 1] = cy + (positions[i * 3 + 1] - cy) * scale;
    positions[i * 3 + 2] = cz + (positions[i * 3 + 2] - cz) * scale;
  }
}

/**
 * 稀疏语言团（≤2 颗虚拟星）直接摆在语言中心附近
 */
function placeSparseLanguageStars(virtualStars, positions, globalIndices, langCenter, galaxyRadius) {
  const n = globalIndices.length;
  const spread = Math.max(5, galaxyRadius * 0.14);
  for (let li = 0; li < n; li += 1) {
    const gi = globalIndices[li];
    const h = hashStr(virtualStars[gi].virtualKey);
    const ang = hashUnit(h, 1) * Math.PI * 2;
    const rr = spread * (0.35 + hashUnit(h, 2) * 0.65);
    positions[gi * 3] =
      langCenter[0] + Math.cos(ang) * rr + gauss3(hashSeed(h, 'jx'), hashSeed(h, 'jy'), hashSeed(h, 'jz')) * spread * 0.2;
    positions[gi * 3 + 1] =
      langCenter[1] +
      gauss3(hashSeed(h, 'jy2'), hashSeed(h, 'jy3'), hashSeed(h, 'jy4')) * spread * 0.45;
    positions[gi * 3 + 2] =
      langCenter[2] + Math.sin(ang) * rr + gauss3(hashSeed(h, 'jz2'), hashSeed(h, 'jz3'), hashSeed(h, 'jz4')) * spread * 0.2;
  }
}

/**
 * 星系层：topic 星环 + 零散星 联合力导向（仅团内，非全局）
 */
function simulateStarsInLanguage(
  virtualStars,
  positions,
  langGroup,
  layout,
  ringKeys,
  langCenter,
  galaxyRadius
) {
  const globalIndices = langGroup.indices;
  const n = globalIndices.length;
  if (n <= 2) {
    placeSparseLanguageStars(virtualStars, positions, globalIndices, langCenter, galaxyRadius);
    return;
  }

  const topicGroups = groupTopicsInLanguage(langGroup, virtualStars, ringKeys);
  const topicCenters = layoutTopicCenters3D(topicGroups, langCenter, galaxyRadius);

  initLanguageStarPositions(
    virtualStars,
    positions,
    topicGroups,
    topicCenters,
    langCenter,
    galaxyRadius
  );

  const localPos = new Float32Array(n * 3);
  for (let li = 0; li < n; li += 1) {
    const gi = globalIndices[li];
    localPos[li * 3] = positions[gi * 3];
    localPos[li * 3 + 1] = positions[gi * 3 + 1];
    localPos[li * 3 + 2] = positions[gi * 3 + 2];
  }

  const localStars = globalIndices.map((gi) => virtualStars[gi]);
  const nodes = prepareForceNodesFromVirtualStars(localStars);
  const ringEdges = buildRingChordEdges(topicGroups, globalIndices, positions);

  const steps =
    n > 900
      ? HIERARCHY_LAYOUT.STAR_FORCE_STEPS_LARGE
      : HIERARCHY_LAYOUT.STAR_FORCE_STEPS;

  const simOverrides = {
    STEPS: steps,
    REPULSION: HIERARCHY_LAYOUT.STAR_REPULSION,
    CELL_SIZE: Math.max(7, galaxyRadius / 3.5),
    NEIGHBOR_K: n > 600 ? 12 : 16,
    LANG_BUCKET_MAX: Math.min(72, n),
    TOPIC_PEER_MAX: Math.min(56, n),
    INTRA_REST_LENGTH: 11,
    INTRA_LANG_SPRING: 1.55,
    RING_SPRING_MULT: HIERARCHY_LAYOUT.RING_SPRING_MULT,
    RING_REST_LENGTH: HIERARCHY_LAYOUT.RING_REST_LENGTH,
    DISK_FLATTEN: HIERARCHY_LAYOUT.STAR_VOLUME_KEEP,
    STAR_VOLUME_KEEP: HIERARCHY_LAYOUT.STAR_VOLUME_KEEP,
    INTER_TOPIC_REPULSE: HIERARCHY_LAYOUT.INTER_TOPIC_REPULSE,
  };

  const refined = runIntraClusterForceSimulation(nodes, localPos, {
    anchorIndex: -1,
    clusterCenter: langCenter,
    clusterPull: HIERARCHY_LAYOUT.STAR_CLUSTER_PULL,
    ringEdges,
    overrides: simOverrides,
  });

  normalizeClusterAroundCenter(refined, n, langCenter, galaxyRadius * 0.9);

  for (let li = 0; li < n; li += 1) {
    const gi = globalIndices[li];
    positions[gi * 3] = refined[li * 3];
    positions[gi * 3 + 1] = refined[li * 3 + 1];
    positions[gi * 3 + 2] = refined[li * 3 + 2];
  }
}

/**
 * 对齐语言锚点并适度缩放，保持团块聚合又不揉成均匀球
 */
function finalizeLanguageClusters(positions, langGroups, langCenters, targetSpan) {
  for (const langGroup of langGroups) {
    const indices = langGroup.indices;
    const count = indices.length;
    if (!count) continue;

    const langCenter = langCenters.get(langGroup.lang) ?? [0, 0, 0];
    const [lcx, lcy, lcz] = langCenter;

    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const gi of indices) {
      cx += positions[gi * 3];
      cy += positions[gi * 3 + 1];
      cz += positions[gi * 3 + 2];
    }
    const inv = 1 / count;
    cx *= inv;
    cy *= inv;
    cz *= inv;

    const shiftX = lcx - cx;
    const shiftY = lcy - cy;
    const shiftZ = lcz - cz;
    for (const gi of indices) {
      positions[gi * 3] += shiftX;
      positions[gi * 3 + 1] += shiftY;
      positions[gi * 3 + 2] += shiftZ;
    }

    if (count <= 1) continue;

    let maxR = 0.01;
    for (const gi of indices) {
      const dx = positions[gi * 3] - lcx;
      const dy = positions[gi * 3 + 1] - lcy;
      const dz = positions[gi * 3 + 2] - lcz;
      maxR = Math.max(maxR, Math.sqrt(dx * dx + dy * dy + dz * dz));
    }

    const targetR = languageGalaxyRadius(langGroup.count, targetSpan) * 0.82;
    const scale = Math.min(1.08, targetR / maxR);
    const h = hashStr(`lang-shape:${langGroup.lang}`);
    const sx = 0.88 + hashUnit(h, 0) * 0.24;
    const sy = 0.82 + hashUnit(h, 1) * 0.28;
    const sz = 0.88 + hashUnit(h, 2) * 0.24;

    for (const gi of indices) {
      const dx = (positions[gi * 3] - lcx) * scale * sx;
      const dy = (positions[gi * 3 + 1] - lcy) * scale * sy;
      const dz = (positions[gi * 3 + 2] - lcz) * scale * sz;
      positions[gi * 3] = lcx + dx;
      positions[gi * 3 + 1] = lcy + dy;
      positions[gi * 3 + 2] = lcz + dz;
    }
  }
}

/**
 * 分层摆位：语言团 → topic 子团/星环 → 单星
 * @param {import('./virtual-stars.js').VirtualStar[]} virtualStars
 * @param {ReturnType<typeof import('./positions.js').buildLanguageLayout>} layout
 * @param {Set<string>} ringKeys
 * @returns {Float32Array}
 */
export function buildHierarchicalVirtualPositions(virtualStars, layout, ringKeys) {
  const n = virtualStars?.length ?? 0;
  const positions = new Float32Array(n * 3);
  if (!n) return positions;

  const targetSpan = FORCE_LAYOUT.TARGET_SPAN;
  const langGroups = groupByLanguage(virtualStars, layout);
  const langCenters = layoutLanguageClusterCenters(langGroups, layout, targetSpan);

  for (const langGroup of langGroups) {
    const langCenter = langCenters.get(langGroup.lang) ?? [0, 0, 0];
    const galaxyRadius = languageGalaxyRadius(langGroup.count, targetSpan);
    simulateStarsInLanguage(
      virtualStars,
      positions,
      langGroup,
      layout,
      ringKeys,
      langCenter,
      galaxyRadius
    );
  }

  finalizeLanguageClusters(positions, langGroups, langCenters, targetSpan);

  return positions;
}

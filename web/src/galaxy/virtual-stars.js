import { GALAXY, MORPHOLOGY_LAYOUT } from './constants.js';
import { gauss3, hashSeed, hashStr } from './hash.js';
import { galaxyRadiusForLanguage } from './morphological-layout.js';

/** @typedef {{ repoId: string, item: object, language: string, topic: string | null, virtualKey: string }} VirtualStar */

function hashUnit(h, shift = 0) {
  return ((h >>> shift) & 0xfffffff) / 0xfffffff;
}

/** @param {object} repo */
function normalizeRepoTopics(repo) {
  const raw = Array.isArray(repo?.topics) ? repo.topics : [];
  const seen = new Set();
  const out = [];
  for (const t of raw) {
    const name = String(t || '').trim().toLowerCase();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/**
 * 一仓多星：每个 topic 一颗；无 topic 时一颗占位星
 * @param {Array<object>} repos
 * @returns {VirtualStar[]}
 */
export function expandReposToVirtualStars(repos) {
  const list = repos || [];
  const out = [];
  for (const item of list) {
    const repoId = String(item?.id || item?.fullName || '');
    if (!repoId) continue;
    const language = item.language || '其他';
    const topics = normalizeRepoTopics(item);
    if (!topics.length) {
      out.push({
        repoId,
        item,
        language,
        topic: null,
        virtualKey: `${repoId}\0`,
      });
      continue;
    }
    for (const topic of topics) {
      out.push({
        repoId,
        item,
        language,
        topic,
        virtualKey: `${repoId}\0${topic}`,
      });
    }
  }
  return out;
}

/** @param {string} lang @param {string} topic */
export function topicRingKey(lang, topic) {
  return `${lang}\0${topic}`;
}

/**
 * 固定阈值 + 每语言 Top 环（数量上限与 10% 取 min）
 * @param {VirtualStar[]} virtualStars
 * @param {ReturnType<typeof import('./positions.js').buildLanguageLayout>} layout
 * @returns {Set<string>}
 */
export function buildTopicRingKeySet(virtualStars, layout) {
  if (!GALAXY.TOPIC_RINGS_ENABLED) return new Set();

  const ringKeys = new Set();
  const { TOPIC_RING_MIN_COUNT, TOPIC_RING_MAX_COUNT, TOPIC_RING_MAX_PERCENT } = GALAXY;

  /** @type {Map<string, Map<string, number>>} */
  const langTopicCounts = new Map();
  /** @type {Map<string, Set<string>>} */
  const langTopicKinds = new Map();

  for (const v of virtualStars) {
    if (!v.topic) continue;
    const lang = layout?.langKeys?.has(v.language) ? v.language : '其他';
    if (!langTopicCounts.has(lang)) {
      langTopicCounts.set(lang, new Map());
      langTopicKinds.set(lang, new Set());
    }
    const m = langTopicCounts.get(lang);
    m.set(v.topic, (m.get(v.topic) || 0) + 1);
    langTopicKinds.get(lang).add(v.topic);
  }

  for (const [lang, topicMap] of langTopicCounts) {
    const kindCount = langTopicKinds.get(lang)?.size ?? 0;
    const cap = Math.min(
      TOPIC_RING_MAX_COUNT,
      Math.max(1, Math.ceil(kindCount * TOPIC_RING_MAX_PERCENT))
    );
    const candidates = [...topicMap.entries()]
      .filter(([, count]) => count >= TOPIC_RING_MIN_COUNT)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
      .slice(0, cap);

    for (const [topic] of candidates) {
      ringKeys.add(topicRingKey(lang, topic));
    }
  }

  return ringKeys;
}

/**
 * @param {VirtualStar} v
 * @param {ReturnType<typeof import('./positions.js').buildLanguageLayout>} layout
 */
export function virtualLanguageKey(v, layout) {
  const lang = v.language || '其他';
  return layout?.langKeys?.has(lang) ? lang : '其他';
}

/**
 * @param {number[]} indices
 * @param {Float32Array} positions
 */
function measureGroupFromPositions(indices, positions) {
  let cx = 0;
  let cy = 0;
  let cz = 0;
  const count = indices.length;
  if (!count) {
    return { cx: 0, cy: 0, cz: 0, spread: 14, n: 0 };
  }
  for (const i of indices) {
    cx += positions[i * 3];
    cy += positions[i * 3 + 1];
    cz += positions[i * 3 + 2];
  }
  const inv = 1 / count;
  cx *= inv;
  cy *= inv;
  cz *= inv;
  let maxR = 1;
  for (const i of indices) {
    const dx = positions[i * 3] - cx;
    const dy = positions[i * 3 + 1] - cy;
    const dz = positions[i * 3 + 2] - cz;
    maxR = Math.max(maxR, Math.sqrt(dx * dx + dy * dy + dz * dz));
  }
  const spread = Math.max(
    MORPHOLOGY_LAYOUT.GROUP_SPREAD_MIN,
    maxR * 1.15,
    Math.sqrt(count) * MORPHOLOGY_LAYOUT.GROUP_SPREAD_PER_STAR
  );
  return { cx, cy, cz, spread, n: count };
}

/**
 * 力导向后的 topic 环几何微调（仅处理成环组，不改云团）
 * @param {VirtualStar[]} virtualStars
 * @param {Float32Array} positions
 * @param {ReturnType<typeof import('./positions.js').buildLanguageLayout>} layout
 * @param {Set<string>} ringKeys
 */
export function applyTopicRingRefinement(virtualStars, positions, layout, ringKeys, opts = {}) {
  const n = virtualStars?.length ?? 0;
  if (!n || !ringKeys?.size) return;

  const totalRepos = Math.max(opts.totalRepos ?? 1, 1);
  const sf = Math.min(layout?.spreadFactor ?? 1, 1.32);
  const ringFrac = opts.ringRadiusFrac ?? GALAXY.TOPIC_RING_GALAXY_FRAC ?? 0.46;
  const hubs = opts.hubs;
  const ringStarFlags = opts.ringStarFlags;

  /** @type {Map<string, number[]>} */
  const ringGroups = new Map();
  for (let i = 0; i < n; i += 1) {
    const v = virtualStars[i];
    const lang = virtualLanguageKey(v, layout);
    const ringKey = v.topic ? topicRingKey(lang, v.topic) : '';
    if (v.topic && ringKeys.has(ringKey)) {
      if (!ringGroups.has(ringKey)) ringGroups.set(ringKey, []);
      ringGroups.get(ringKey).push(i);
    }
  }

  for (const [ringKey, indices] of ringGroups) {
    const lang = ringKey.split('\0')[0] || '其他';
    const group = measureGroupFromPositions(indices, positions);
    const gR = galaxyRadiusForLanguage(lang, layout, totalRepos) * sf;
    const maxRingR = gR * ringFrac * (0.55 + hashUnit(hashStr(`ring-r:${ringKey}`), 1) * 0.22);
    const h = hashStr(`ring-nudge:${ringKey}`);

    let rcx = group.cx;
    let rcy = group.cy;
    let rcz = group.cz;
    const hub = hubs?.get(lang);
    if (hub) {
      const dx = rcx - hub[0];
      const dz = rcz - hub[2];
      const toHub = Math.hypot(dx, dz);
      const maxOff = gR * 0.38;
      if (toHub > maxOff) {
        const s = maxOff / toHub;
        rcx = hub[0] + dx * s;
        rcz = hub[2] + dz * s;
        rcy = hub[1] + (rcy - hub[1]) * s;
      }
    }

    placeRingGroup(
      virtualStars,
      indices,
      positions,
      rcx,
      rcy,
      rcz,
      Math.max(group.spread, gR * 0.12),
      ringKey,
      0,
      maxRingR,
      ringStarFlags
    );
  }
}

/**
 * @param {VirtualStar[]} virtualStars
 * @param {number[]} indices
 * @param {Float32Array} positions
 * @param {number} cx
 * @param {number} cy
 * @param {number} cz
 * @param {number} groupSpread
 * @param {string} ringKey
 * @param {number} [planeTangAng]
 */
export function placeRingGroup(
  virtualStars,
  indices,
  positions,
  cx,
  cy,
  cz,
  groupSpread,
  ringKey,
  planeTangAng = 0,
  maxRingR = null,
  ringStarFlags = null
) {
  const count = indices.length;
  if (!count) return;

  let ringR =
    (Math.max(GALAXY.TOPIC_RING_RADIUS_BASE, groupSpread * 0.38) +
      Math.log1p(Math.sqrt(Math.min(count, GALAXY.TOPIC_RING_SURFACE_MAX))) *
        Math.max(GALAXY.TOPIC_RING_RADIUS_SCALE, groupSpread * 0.07)) *
    MORPHOLOGY_LAYOUT.RING_RADIUS_SCALE;
  if (maxRingR != null && maxRingR > 0) {
    ringR = Math.min(ringR, maxRingR);
  }
  const surfaceMax = Math.max(4, GALAXY.TOPIC_RING_SURFACE_MAX ?? 36);
  const onRingCount = Math.min(count, surfaceMax);
  const cloudSpread = Math.max(groupSpread * 0.55, ringR * 0.72);
  const phase = hashUnit(hashStr(`ring-phase:${ringKey}`), 0) * Math.PI * 2;
  const h0 = hashStr(ringKey);
  const tiltA = gauss3(hashSeed(h0, 'ta'), hashSeed(h0, 'tb'), hashSeed(h0, 'tc')) * 0.72;
  const tiltB = planeTangAng + gauss3(hashSeed(h0, 'td'), hashSeed(h0, 'te'), hashSeed(h0, 'tf')) * 0.38;
  const ca = Math.cos(tiltA);
  const sa = Math.sin(tiltA);
  const cb = Math.cos(tiltB);
  const sb = Math.sin(tiltB);

  for (let j = 0; j < count; j += 1) {
    const i = indices[j];
    const v = virtualStars[i];
    const h = hashStr(v.virtualKey);

    let lx;
    let ly;
    let lz;

    if (j < onRingCount) {
      const angJitter = (hashUnit(h, 14) - 0.5) * (Math.PI * 2 / Math.max(onRingCount, 1)) * 0.65;
      const ang = phase + (Math.PI * 2 * j) / onRingCount + angJitter;
      const tubeAng = hashUnit(h, 9) * Math.PI * 2;
      const radialJitter = (hashUnit(h, 8) - 0.5) * ringR * 0.14;
      const r = ringR + radialJitter;
      const tube =
        groupSpread *
        (0.05 + hashUnit(h, 13) * 0.08) *
        MORPHOLOGY_LAYOUT.RING_TUBE_SCALE *
        Math.sin(tubeAng);

      lx = Math.cos(ang) * r;
      ly =
        Math.sin(tubeAng) * groupSpread * 0.22 +
        gauss3(hashSeed(h, 'y1'), hashSeed(h, 'y2'), hashSeed(h, 'y3')) * groupSpread * 0.1;
      lz = Math.sin(ang) * r;
      lx += Math.cos(tubeAng) * tube;
      lz += Math.sin(tubeAng) * tube;
      if (ringStarFlags) ringStarFlags[i] = 1;
    } else {
      const rad = nebulaSampleRadius(h, cloudSpread);
      const ang = hashUnit(h, 10) * Math.PI * 2;
      const lift = hashUnit(h, 11);
      lx = Math.cos(ang) * rad;
      ly = (lift - 0.5) * cloudSpread * 0.35;
      lz = Math.sin(ang) * rad;
      if (ringStarFlags) ringStarFlags[i] = 0;
    }

    const ly1 = ly * ca - lz * sa;
    const lz1 = ly * sa + lz * ca;
    const lx2 = lx * cb + lz1 * sb;
    const lz2 = -lx * sb + lz1 * cb;

    positions[i * 3] = cx + lx2;
    positions[i * 3 + 1] = cy + ly1;
    positions[i * 3 + 2] = cz + lz2;
  }
}

/** 星云晕径向：密核 + 幂律弥散外晕 */
function nebulaSampleRadius(h, cloudSpread) {
  const spread = Number.isFinite(cloudSpread) ? cloudSpread : 12;
  const u = hashUnit(h, 10);
  const coreRatio = MORPHOLOGY_LAYOUT.NEBULA_CORE_RATIO ?? 0.22;
  if (u < coreRatio) {
    return spread * 0.14 * Math.cbrt(hashUnit(h, 11));
  }
  const t = hashUnit(h, 12);
  const haloPower = MORPHOLOGY_LAYOUT.NEBULA_HALO_POWER ?? 1.45;
  const haloScale = MORPHOLOGY_LAYOUT.NEBULA_HALO_SCALE ?? 0.76;
  return spread * (0.24 + Math.pow(t, haloPower) * haloScale);
}

/**
 * @param {VirtualStar[]} virtualStars
 * @returns {Map<string, number[]>}
 */
export function buildRepoIdToVirtualIndices(virtualStars) {
  const map = new Map();
  for (let i = 0; i < virtualStars.length; i += 1) {
    const id = virtualStars[i].repoId;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(i);
  }
  return map;
}

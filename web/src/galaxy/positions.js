import {
  GALAXY,
  R_MAX,
  R_MIN,
  STAR_YEAR_MAX,
  STAR_YEAR_MIN,
  PUSH_RECENCY_HALF_LIFE_DAYS,
  TWINKLE_WEIGHTS,
  TWINKLE_RANK_GAMMA,
  PARTICLE_VISUAL_WEIGHTS,
  PARTICLE_SIZE_RANGE,
  PARTICLE_BRIGHT_RANGE,
} from './constants';
import { gauss3, hashSeed, hashStr } from './hash';
import { repoLangRgb } from './colors';
import { buildMotionFields } from './motion.js';
import { runForceLayout3D } from './force-layout.js';
import { extractLayoutPositions } from './layout-payload.js';

/** @type {{ key: number, positions: Float32Array, anchorIndex: number } | null} */
let forceLayoutCache = null;

function forceLayoutCacheKey(list) {
  let h = list.length >>> 0;
  for (let i = 0; i < list.length; i += 1) {
    h = Math.imul(31, h) + hashStr(String(list[i].id || list[i].fullName || i));
    h >>>= 0;
  }
  return h;
}

function getForceLayout(list) {
  const key = forceLayoutCacheKey(list);
  if (forceLayoutCache && forceLayoutCache.key === key) {
    return {
      positions: forceLayoutCache.positions,
      anchorIndex: forceLayoutCache.anchorIndex,
    };
  }
  const { positions, anchorIndex } = runForceLayout3D(list);
  forceLayoutCache = { key, positions, anchorIndex };
  return { positions, anchorIndex };
}

function starredYear(starredAt) {
  const y = parseInt(String(starredAt || '').slice(0, 4), 10);
  if (!Number.isFinite(y)) return STAR_YEAR_MAX;
  return Math.min(STAR_YEAR_MAX, Math.max(STAR_YEAR_MIN, y));
}

function normLogCount(value, max) {
  const v = Math.log1p(Number(value) || 0);
  const m = Math.log1p(Math.max(max, 1));
  return m > 0 ? v / m : 0;
}

/** 最近推送时效分 0~1，越近越大 */
function pushRecencyScore(pushedAt) {
  const ts = Date.parse(pushedAt || '');
  if (!Number.isFinite(ts)) return 0.08;
  const ageDays = (Date.now() - ts) / 86400000;
  return Math.max(0.05, 1 - Math.min(1, ageDays / PUSH_RECENCY_HALF_LIFE_DAYS));
}

/**
 * 综合视觉影响力：推送时效 + star + watch + fork
 * @param {object} item
 * @param {{ maxStars: number, maxForks: number, maxWatchers: number }} ctx
 */
function repoVisualInfluence(item, ctx) {
  const push = pushRecencyScore(item.pushedAt);
  const stars = normLogCount(item.stars, ctx.maxStars);
  const watchers = normLogCount(item.watchersCount, ctx.maxWatchers);
  const forks = normLogCount(item.forksCount, ctx.maxForks);
  const { PUSH, STARS, WATCHERS, FORKS } = PARTICLE_VISUAL_WEIGHTS;
  return push * PUSH + stars * STARS + watchers * WATCHERS + forks * FORKS;
}

function mapInfluenceToRange(influence, range) {
  const t = Math.pow(Math.max(0, Math.min(1, influence)), range.GAMMA);
  return range.MIN + t * (range.MAX - range.MIN);
}

/**
 * 原始闪烁分数（未做分位拉伸）
 * @param {{ pushedAt?: string, stars?: number, forksCount?: number, watchersCount?: number }} item
 * @param {{ maxStars: number, maxForks: number, maxWatchers: number }} ctx
 */
function rawTwinkleScore(item, ctx) {
  const push = pushRecencyScore(item.pushedAt);
  const stars = normLogCount(item.stars, ctx.maxStars);
  const watchers = normLogCount(item.watchersCount, ctx.maxWatchers);
  const forks = normLogCount(item.forksCount, ctx.maxForks);
  const { PUSH, STARS, WATCHERS, FORKS } = TWINKLE_WEIGHTS;
  return push * PUSH + stars * STARS + watchers * WATCHERS + forks * FORKS;
}

/**
 * 按综合分数分位映射闪烁活跃度，拉开「常亮 / 微闪 / 强闪」层次
 * @param {Array<object>} list
 * @param {{ maxStars: number, maxForks: number, maxWatchers: number }} ctx
 */
function buildTwinkleActivities(list, ctx) {
  const n = list.length;
  const activities = new Float32Array(n);
  if (n === 0) return activities;
  if (n === 1) {
    activities[0] = 1;
    return activities;
  }

  const ranked = list.map((item, index) => ({
    index,
    score: rawTwinkleScore(item, ctx),
  }));
  ranked.sort((a, b) => a.score - b.score || a.index - b.index);

  const inv = 1 / (n - 1);
  for (let rank = 0; rank < n; rank += 1) {
    const percentile = rank * inv;
    activities[ranked[rank].index] = Math.pow(percentile, TWINKLE_RANK_GAMMA);
  }
  return activities;
}

/**
 * 综合闪烁强度（单星，保留供测试/图例）
 * @param {{ pushedAt?: string, stars?: number, forksCount?: number, watchersCount?: number }} item
 * @param {{ maxStars: number, maxForks: number, maxWatchers: number }} ctx
 * @returns {number} 0~1
 */
export function repoTwinkle(item, ctx) {
  return Math.max(0, Math.min(1, rawTwinkleScore(item, ctx)));
}

function activityFactor(pushedAt) {
  return pushRecencyScore(pushedAt);
}

function radialFromStarYear(starredAt) {
  const year = starredYear(starredAt);
  const span = STAR_YEAR_MAX - STAR_YEAR_MIN + 1;
  const norm = (year - STAR_YEAR_MIN) / span;
  return R_MIN + (R_MAX - R_MIN) * (0.22 + norm * 0.48);
}

function radialFromRepoStars(stars, maxStars) {
  const norm = Math.log1p(Number(stars) || 0) / Math.log1p(Math.max(maxStars, 1));
  return R_MIN + (R_MAX - R_MIN) * (0.26 + norm * 0.52);
}

/** 0..1 哈希 */
function hashUnit(h, shift = 0) {
  return ((h >>> shift) & 0xfffffff) / 0xfffffff;
}

/** @param {{ topics?: string[] }} item */
export function primaryTopic(item) {
  const topics = Array.isArray(item?.topics) ? item.topics : [];
  if (!topics.length) return '';
  return String(topics[0]).toLowerCase();
}

/**
 * 为当前可见仓库分配语言团中心（黄金角 + 按数量分角宽，避免等分扇区拉成星带）
 * @param {Array<{ language?: string | null }>} items
 */
export function buildLanguageLayout(items) {
  const list = items || [];
  const counts = new Map();
  for (const item of list) {
    const key = item.language || '其他';
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const sorted = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'zh-CN')
  );
  const topN = GALAXY.LAYOUT_LANG_TOP;
  const primaryTop = sorted.slice(0, topN).map(([name]) => name);
  const topSet = new Set(primaryTop);
  const layoutLangs = [...primaryTop];
  if (!topSet.has('其他')) layoutLangs.push('其他');

  const n = Math.max(layoutLangs.length, 1);
  const total = Math.max(list.length, 1);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const langAngles = new Map();
  const langWedge = new Map();
  const langRadial = new Map();
  const langCounts = new Map();
  const langKeys = new Set(layoutLangs);

  layoutLangs.forEach((name, i) => {
    let count = 0;
    if (name === '其他') {
      for (const item of list) {
        const key = item.language || '其他';
        if (!topSet.has(key)) count += 1;
      }
      if (topSet.has('其他')) count += counts.get('其他') || 0;
    } else {
      count = counts.get(name) || 0;
    }
    const share = Math.max(count, 1) / total;
    const ang = i * golden * 2.4 - Math.PI / 2;
    const lh = hashStr(`lang-layout:${name}`);
    const rBase = 0.04 + ((i + 0.5) / n) * 0.78;
    const rJitter = hashUnit(lh, 8) * 0.2;
    const rr = R_MIN * 0.08 + (R_MAX - R_MIN) * Math.min(0.96, rBase + rJitter + Math.sqrt(share) * 0.14);
    langAngles.set(name, ang);
    langRadial.set(name, rr);
    langCounts.set(name, count);
    langWedge.set(name, Math.PI * 2 * Math.sqrt(share) * GALAXY.LANG_WEDGE_FILL);
  });

  const spreadFactor = Math.max(1.25, Math.pow(Math.max(list.length, 1) / 650, 0.4));

  return {
    langAngles,
    langWedge,
    langRadial,
    langCounts,
    langKeys,
    languages: layoutLangs,
    wedge: (Math.PI * 2) / n,
    spreadFactor,
  };
}

function layoutLanguageKey(item, layout) {
  const lang = item.language || '其他';
  return layout.langKeys.has(lang) ? lang : '其他';
}

/** topic 在语言扇区内的角偏移（同 topic 会靠得更近） */
function topicAngleOffset(item, layout) {
  const lang = layoutLanguageKey(item, layout);
  const topic = primaryTopic(item) || '__none__';
  const wedge = layout.langWedge.get(lang) ?? layout.wedge * GALAXY.LANG_WEDGE_FILL;
  const h = hashStr(`${lang}\0${topic}`);
  const u = hashUnit(h, 4);
  return (u - 0.5) * wedge * 0.75;
}

/** topic 在语言团内的径向微偏移 */
function topicRadialOffset(item) {
  const topic = primaryTopic(item) || '__none__';
  const h = hashStr(`r:${item.language}:${topic}:${item.id}`);
  return gauss3(hashSeed(h, 'a'), hashSeed(h, 'b'), hashSeed(h, 'c')) * GALAXY.TOPIC_RADIAL_JITTER;
}

/**
 * 连续对数螺旋角 + 场星
 * @param {number} h
 * @param {number} rr
 * @param {number} a
 * @param {number} b
 * @param {number} c
 */
function spiralAngle(h, rr, a, b, c) {
  const t = (rr - R_MIN) / (R_MAX - R_MIN + 1);
  const logSpiral = Math.log1p(t * 3.5) * GALAXY.TWIST;
  const phase = hashUnit(h, 6) * Math.PI * 2;

  if (hashUnit(h, 18) < GALAXY.FIELD_RATIO) {
    return hashUnit(h, 10) * Math.PI * 2 + gauss3(a, b, c) * 0.18;
  }

  const armWobble = Math.sin(logSpiral * 1.6 + phase * 2.1) * 0.08;
  return logSpiral + phase + armWobble + gauss3(a, b, c) * GALAXY.ARM_SPREAD;
}

/**
 * 盘厚 + 银心隆起 + 轻微盘面翘曲
 */
function diskHeight(h, rr, ang, t, ya, yb, yc, starNorm, act) {
  const bulge = Math.exp(-Math.pow(rr / 20, 2)) * GALAXY.BULGE * (1.15 + (1 - t) * 0.45);
  const diskY = gauss3(ya, yb, yc) * GALAXY.THICKNESS * (0.35 + t * 0.95);
  const warp = Math.sin(ang * 2 + hashUnit(h, 14) * Math.PI) * t * 2.4;
  const lift = starNorm * GALAXY.THICKNESS * 0.28 * (1 - act * 0.35);
  return diskY + bulge * gauss3(ya, yb, yc) * 0.62 + warp + lift;
}

/** 在盘坐标基础上叠加 3D 椭球散布 */
function volumeOffset(h, ya, yb, yc, ra, rb, rc) {
  const vx = gauss3(hashSeed(h, 'vx1'), hashSeed(h, 'vx2'), hashSeed(h, 'vx3'));
  const vy = gauss3(ya, yb, yc);
  const vz = gauss3(ra, rb, rc);
  return [
    vx * GALAXY.VOLUME_SPREAD_XZ,
    vy * GALAXY.VOLUME_SPREAD_Y,
    vz * GALAXY.VOLUME_SPREAD_XZ,
  ];
}

/**
 * @param {object} item
 * @param {number} maxStars
 * @param {ReturnType<typeof buildLanguageLayout> | null} [layout]
 */
export function repoPosition(item, maxStars, layout = null) {
  const h = hashStr(item.id || item.fullName || '');
  const ra = hashSeed(h, 'r1');
  const rb = hashSeed(h, 'r2');
  const rc = hashSeed(h, 'r3');
  const a = hashSeed(h, 'a1');
  const b = hashSeed(h, 'a2');
  const cc = hashSeed(h, 'a3');
  const ya = hashSeed(h, 'y1');
  const yb = hashSeed(h, 'y2');
  const yc = hashSeed(h, 'y3');

  const yearR = radialFromStarYear(item.starredAt);
  const starR = radialFromRepoStars(item.stars, maxStars);
  const repoRr = yearR * 0.3 + starR * 0.7;

  let rr;
  let ang;

  if (layout) {
    const lang = layoutLanguageKey(item, layout);
    const clusterAng = (layout.langAngles.get(lang) ?? 0) + topicAngleOffset(item, layout);
    const clusterRr = layout.langRadial.get(lang) ?? repoRr;
    const wedge = layout.langWedge.get(lang) ?? layout.wedge;
    const langN = layout.langCounts?.get(lang) ?? 1;
    const langSpread = 0.95 + Math.sqrt(langN / 100) * 0.75;

    const spreadAng = gauss3(a, b, cc) * wedge * GALAXY.LANG_CLUSTER_SPREAD_ANG * langSpread;
    const spreadR =
      gauss3(ra, rb, rc) * (GALAXY.LANG_CLUSTER_SPREAD_R + wedge * 6) * langSpread +
      topicRadialOffset(item);

    ang = clusterAng + spreadAng;
    rr = clusterRr + spreadR;

    const spiralAng = spiralAngle(h, rr, a, b, cc);
    ang += spiralAng * 0.1;
    rr = rr * 0.78 + repoRr * 0.22 + gauss3(ra, rb, rc) * 3.2;
  } else {
    rr = repoRr + gauss3(ra, rb, rc) * 3.5;
    ang = spiralAngle(h, rr, a, b, cc);
  }

  rr = Math.max(1.8, Math.min(R_MAX * 0.98, rr));

  const t = (rr - R_MIN) / (R_MAX - R_MIN + 1);
  const act = activityFactor(item.pushedAt);
  const starNorm = Math.log1p(Number(item.stars) || 0) / Math.log1p(Math.max(maxStars, 1));
  const y = diskHeight(h, rr, ang, t, ya, yb, yc, starNorm, act);
  const [ox, oy, oz] = volumeOffset(h, ya, yb, yc, ra, rb, rc);
  const sf = layout?.spreadFactor ?? 1;

  return [
    (Math.cos(ang) * rr + ox) * sf,
    (y + oy) * sf,
    (Math.sin(ang) * rr + oz) * sf,
  ];
}

export function repoParticleSize(item, ctx) {
  return mapInfluenceToRange(repoVisualInfluence(item, ctx), PARTICLE_SIZE_RANGE);
}

export function repoBrightness(item, ctx) {
  return mapInfluenceToRange(repoVisualInfluence(item, ctx), PARTICLE_BRIGHT_RANGE);
}

export function buildLanguageLegend(items, topN = 10) {
  const counts = new Map();
  for (const item of items || []) {
    const key = item.language || '其他';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'zh-CN'))
    .slice(0, topN)
    .map(([name, count]) => ({ name, count }));
}

export function buildStarTierLegend(items) {
  const tiers = [
    { key: '50k+', min: 50000, count: 0 },
    { key: '10k+', min: 10000, count: 0 },
    { key: '1k+', min: 1000, count: 0 },
    { key: '<1k', min: 0, count: 0 },
  ];
  for (const item of items || []) {
    const s = Number(item.stars) || 0;
    if (s >= 50000) tiers[0].count += 1;
    else if (s >= 10000) tiers[1].count += 1;
    else if (s >= 1000) tiers[2].count += 1;
    else tiers[3].count += 1;
  }
  return tiers.filter((tier) => tier.count > 0);
}

/** @param {number | string | null | undefined} stars */
export function repoStarTierKey(stars) {
  const s = Number(stars) || 0;
  if (s >= 50000) return '50k+';
  if (s >= 10000) return '10k+';
  if (s >= 1000) return '1k+';
  return '<1k';
}

/**
 * 与图例语言桶一致的分组 key
 * @param {{ language?: string | null }} item
 * @param {Set<string> | string[]} legendLangs
 */
export function repoLegendLanguageKey(item, legendLangs) {
  const topSet = legendLangs instanceof Set ? legendLangs : new Set(legendLangs);
  const lang = item.language || '其他';
  return topSet.has(lang) ? lang : '其他';
}

/** @param {string} owner @param {string} [repoName] */
export function ownerSelfRepoId(owner, repoName) {
  const name = String(owner || '').trim().toLowerCase();
  if (!name) return '';
  const repo = String(repoName || name).trim().toLowerCase();
  if (repo !== name) return '';
  return `${name}-${name}`;
}
function centerPositions(positions, count) {
  if (count <= 0) return;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < count; i += 1) {
    cx += positions[i * 3];
    cy += positions[i * 3 + 1];
    cz += positions[i * 3 + 2];
  }
  const inv = 1 / count;
  cx *= inv;
  cy *= inv;
  cz *= inv;
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] -= cx;
    positions[i * 3 + 1] -= cy;
    positions[i * 3 + 2] -= cz;
  }
}

export function buildGalaxyBuffers(items, galaxyCtx = null) {
  const list = items || [];
  const count = list.length;
  let maxStars = 1;
  let maxForks = 1;
  let maxWatchers = 1;
  for (const item of list) {
    maxStars = Math.max(maxStars, Number(item.stars) || 0);
    maxForks = Math.max(maxForks, Number(item.forksCount) || 0);
    maxWatchers = Math.max(maxWatchers, Number(item.watchersCount) || 0);
  }

  const twinkleCtx = { maxStars, maxForks, maxWatchers };
  const sizeCtx = { maxStars, maxForks, maxWatchers };
  const twinkleActivities = buildTwinkleActivities(list, twinkleCtx);

  const layout = buildLanguageLayout(list);

  let positions;
  let anchorIndex;
  const precomputed = galaxyCtx?.layout
    ? extractLayoutPositions(list, galaxyCtx.layout, galaxyCtx.indexMap)
    : null;
  if (precomputed) {
    ({ positions, anchorIndex } = precomputed);
  } else {
    ({ positions, anchorIndex } = getForceLayout(list));
  }

  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const brights = new Float32Array(count);
  const activities = new Float32Array(count);
  const seeds = new Float32Array(count);
  const idToIndex = new Map();

  for (let i = 0; i < count; i += 1) {
    const item = list[i];

    const [r, g, b] = repoLangRgb(item.language);
    const bright = repoBrightness(item, sizeCtx);
    colors[i * 3] = r * bright;
    colors[i * 3 + 1] = g * bright;
    colors[i * 3 + 2] = b * bright;

    sizes[i] = repoParticleSize(item, sizeCtx);
    brights[i] = bright;
    if (i === anchorIndex) {
      sizes[i] *= 1.4;
      brights[i] = Math.min(1, brights[i] * 1.12);
      colors[i * 3] *= 1.08;
      colors[i * 3 + 1] *= 1.08;
      colors[i * 3 + 2] *= 1.08;
    }
    activities[i] = twinkleActivities[i];
    seeds[i] = (hashStr(item.id) % 1000) / 1000;
    idToIndex.set(item.id, i);
  }

  const motion = buildMotionFields(list, positions, count, layout);

  return {
    count,
    maxStars,
    positions,
    colors,
    sizes,
    brights,
    activities,
    seeds,
    idToIndex,
    items: list,
    legend: buildLanguageLegend(list),
    starTiers: buildStarTierLegend(list),
    motion,
    anchorIndex,
  };
}

export function buildDustBuffers(count = 1600) {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const h = hashStr(`dust-${i}`);
    const ra = hashSeed(h, 'dr');
    const rb = hashSeed(h, 'ds');
    const rc = hashSeed(h, 'dt');
    const a = hashSeed(h, 'da');
    const b = hashSeed(h, 'db');
    const cc = hashSeed(h, 'dc');
    const ya = hashSeed(h, 'dy');

    let rr = R_MIN * 0.15 + hashUnit(h, 4) * (R_MAX - R_MIN) * 0.92;
    rr += gauss3(ra, rb, rc) * 4;
    const ang = spiralAngle(h, rr, a, b, cc);
    const bulge = Math.exp(-Math.pow(rr / 34, 2)) * GALAXY.BULGE * 0.45;
    const y = gauss3(ya, h >>> 4, h >>> 8) * GALAXY.THICKNESS * 1.4 + bulge * 0.4;

    positions[i * 3] = Math.cos(ang) * rr;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = Math.sin(ang) * rr;
    sizes[i] = 0.18 + hashUnit(h, 12) * 0.22;
  }
  return { positions, sizes };
}

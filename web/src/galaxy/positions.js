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
  FORCE_LAYOUT,
  COSMIC_UNIVERSE,
} from './constants.js';
import { gauss3, hashSeed, hashStr, hashUnit } from './hash.js';
import { repoLangRgb } from './colors.js';
import { buildMotionFields, buildHarmonizedLanguageHubs, buildHarmonizedRawLanguageHubs, fillGasMotionFields } from './motion.js';
import { findAnchorRepoId } from './force-similarity.js';
import {
  extractLayoutPositions,
  extractVirtualLayoutPositions,
  isVirtualGalaxyLayout,
} from './layout-payload.js';
import {
  expandReposToVirtualStars,
  buildTopicRingKeySet,
  layoutVirtualStarPositions,
  applyTopicRingRefinement,
  topicRingKey,
  virtualLanguageKey,
  buildRepoIdToVirtualIndices,
} from './virtual-stars.js';
import { buildMorphologicalVirtualPositions, harmonizeCosmicSpan, buildLanguageGalaxyHubs, galaxyRadiusForLanguage, galaxyFrameAngles, buildGasClumpField, sampleGasCloudParticle, rotateGalaxyLocal, qualifyingGasLanguages } from './morphological-layout.js';

/**
 * 分层摆位：语言星团 → topic 子团/星环 → 单星
 * @param {Array<object>} repos
 * @param {import('./virtual-stars.js').VirtualStar[]} virtualStars
 * @param {ReturnType<typeof buildLanguageLayout>} layout
 * @param {Set<string>} ringKeys
 */
export function buildStructuredVirtualPositions(repos, virtualStars, layout, ringKeys, gasBuffers, ringStarFlags = null) {
  const positions = buildMorphologicalVirtualPositions(repos, virtualStars, layout, ringKeys);
  const aux =
    gasBuffers?.count > 0
      ? [{ buf: gasBuffers.positions, n: gasBuffers.count }]
      : [];
  const harmonizeMeta = harmonizeCosmicSpan(positions, virtualStars.length, aux);
  const hubs =
    buildHarmonizedRawLanguageHubs(layout, harmonizeMeta) ?? buildLanguageGalaxyHubs(layout);
  applyTopicRingRefinement(virtualStars, positions, layout, ringKeys, {
    totalRepos: repos?.length ?? 0,
    hubs,
    ringStarFlags,
  });
  return { positions, harmonizeMeta };
}

/**
 * 质心归零 + 温和缩放：聚拢碎屑，又不用 maxR 强行揉成均匀球壳
 */
function harmonizeUniverseSpan(positions, count, targetSpan) {
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

  const radii = new Float32Array(count);
  let maxR = 1;
  for (let i = 0; i < count; i += 1) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    const r = Math.sqrt(x * x + y * y + z * z);
    radii[i] = r;
    maxR = Math.max(maxR, r);
  }

  const sorted = [...radii].sort((a, b) => a - b);
  const p85 = sorted[Math.min(count - 1, Math.floor(count * 0.85))] || maxR;
  const desired = targetSpan * 0.82;
  const effectiveR = Math.max(p85 * 1.06, maxR * 0.58);
  let scale = desired / effectiveR;
  if (scale > 1.18) scale = 1.18;

  for (let i = 0; i < count; i += 1) {
    positions[i * 3] *= scale;
    positions[i * 3 + 1] *= scale;
    positions[i * 3 + 2] *= scale;
  }
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

function virtualStarRgb(v, langRgb) {
  if (!v.topic) return langRgb;
  const h = hashStr(v.virtualKey);
  const u = ((h >>> 4) & 0xfffffff) / 0xfffffff;
  const [r, g, b] = langRgb;
  return [
    Math.min(1, r * (0.78 + u * 0.42)),
    Math.min(1, g * (0.72 + (1 - u) * 0.38)),
    Math.min(1, b * (0.76 + u * 0.32)),
  ];
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
function computeCentroid(buf, n) {
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < n; i += 1) {
    cx += buf[i * 3];
    cy += buf[i * 3 + 1];
    cz += buf[i * 3 + 2];
  }
  const inv = 1 / Math.max(n, 1);
  return [cx * inv, cy * inv, cz * inv];
}

function subtractCentroid(buf, n, cx, cy, cz) {
  for (let i = 0; i < n; i += 1) {
    buf[i * 3] -= cx;
    buf[i * 3 + 1] -= cy;
    buf[i * 3 + 2] -= cz;
  }
}

function centerPositions(positions, count) {
  if (count <= 0) return [0, 0, 0];
  const [cx, cy, cz] = computeCentroid(positions, count);
  subtractCentroid(positions, count, cx, cy, cz);
  return [cx, cy, cz];
}

function normalizePositionSpan(positions, count, targetSpan) {
  if (count <= 0) return;
  let maxR = 1;
  for (let i = 0; i < count; i += 1) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    maxR = Math.max(maxR, Math.sqrt(x * x + y * y + z * z));
  }
  const scale = targetSpan / maxR;
  if (Math.abs(scale - 1) < 0.02) return;
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] *= scale;
    positions[i * 3 + 1] *= scale;
    positions[i * 3 + 2] *= scale;
  }
}

export function buildGalaxyBuffers(items, galaxyCtx = null) {
  const repos = items || [];
  const virtualStars = expandReposToVirtualStars(repos);
  const count = virtualStars.length;

  let maxStars = 1;
  let maxForks = 1;
  let maxWatchers = 1;
  for (const item of repos) {
    maxStars = Math.max(maxStars, Number(item.stars) || 0);
    maxForks = Math.max(maxForks, Number(item.forksCount) || 0);
    maxWatchers = Math.max(maxWatchers, Number(item.watchersCount) || 0);
  }

  const twinkleCtx = { maxStars, maxForks, maxWatchers };
  const sizeCtx = { maxStars, maxForks, maxWatchers };
  const repoTwinkleActivities = buildTwinkleActivities(repos, twinkleCtx);
  const repoActivityById = new Map();
  for (let i = 0; i < repos.length; i += 1) {
    const id = repos[i]?.id;
    if (id) repoActivityById.set(id, repoTwinkleActivities[i]);
  }

  const layout = buildLanguageLayout(repos);
  const ringKeys = buildTopicRingKeySet(virtualStars, layout);

  let positions;
  let anchorIndex = -1;
  let harmonizeMeta = null;
  const gasBuffers = buildGalaxyGasBuffers(layout, repos);

  const ringStarFlags = new Float32Array(count);

  const hasVirtualLayout =
    galaxyCtx?.layout &&
    isVirtualGalaxyLayout(galaxyCtx.layout) &&
    galaxyCtx.virtualIndexMap?.size;

  if (hasVirtualLayout) {
    const structured = buildStructuredVirtualPositions(
      repos,
      virtualStars,
      layout,
      ringKeys,
      gasBuffers,
      ringStarFlags
    );
    positions = structured.positions;
    harmonizeMeta = structured.harmonizeMeta;
    const anchorId = galaxyCtx.layout?.anchorId;
    if (anchorId) {
      for (let i = 0; i < count; i += 1) {
        if (virtualStars[i].repoId === anchorId) {
          anchorIndex = i;
          break;
        }
      }
    }
  } else {
    const anchorRepoId = galaxyCtx?.layout?.anchorId ?? findAnchorRepoId(repos);
    const legacyRepoLayout =
      galaxyCtx?.layout &&
      !isVirtualGalaxyLayout(galaxyCtx.layout) &&
      galaxyCtx.indexMap?.size
        ? extractLayoutPositions(repos, galaxyCtx.layout, galaxyCtx.indexMap)
        : null;

    if (legacyRepoLayout) {
      let anchorRepoIndex = legacyRepoLayout.anchorIndex;
      const repoPosById = new Map();
      for (let i = 0; i < repos.length; i += 1) {
        const id = repos[i]?.id;
        if (!id) continue;
        repoPosById.set(id, [
          legacyRepoLayout.positions[i * 3],
          legacyRepoLayout.positions[i * 3 + 1],
          legacyRepoLayout.positions[i * 3 + 2],
        ]);
      }
      positions = layoutVirtualStarPositions(virtualStars, layout, ringKeys, repoPosById);
      const [cx, cy, cz] = centerPositions(positions, count);
      subtractCentroid(gasBuffers.positions, gasBuffers.count, cx, cy, cz);
      if (anchorRepoIndex >= 0 && repos[anchorRepoIndex]?.id) {
        const anchorId = repos[anchorRepoIndex].id;
        for (let i = 0; i < count; i += 1) {
          if (virtualStars[i].repoId === anchorId) {
            anchorIndex = i;
            break;
          }
        }
      }
    } else {
      const structured = buildStructuredVirtualPositions(
        repos,
        virtualStars,
        layout,
        ringKeys,
        gasBuffers,
        ringStarFlags
      );
      positions = structured.positions;
      harmonizeMeta = structured.harmonizeMeta;
      const anchorRepoId = findAnchorRepoId(repos);
      if (anchorRepoId) {
        for (let i = 0; i < count; i += 1) {
          if (virtualStars[i].repoId === anchorRepoId) {
            anchorIndex = i;
            break;
          }
        }
      }
    }
  }

  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const brights = new Float32Array(count);
  const activities = new Float32Array(count);
  const seeds = new Float32Array(count);
  const idToIndex = new Map();
  const repoIdToIndices = buildRepoIdToVirtualIndices(virtualStars);

  for (let i = 0; i < count; i += 1) {
    const v = virtualStars[i];
    const item = v.item;

    const [r, g, b] = virtualStarRgb(v, repoLangRgb(item.language));
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
    activities[i] = repoActivityById.get(v.repoId) ?? 0;
    seeds[i] = (hashStr(v.virtualKey) % 1000) / 1000;
    if (!idToIndex.has(v.repoId)) {
      idToIndex.set(v.repoId, i);
    }
  }

  boostTopicRingStars(virtualStars, layout, ringKeys, sizes, brights, count, ringStarFlags);

  const langHubOverrides =
    buildHarmonizedRawLanguageHubs(layout, harmonizeMeta) ??
    buildHarmonizedLanguageHubs(layout, virtualStars, positions, count);

  const motion = buildMotionFields(
    virtualStars,
    positions,
    count,
    layout,
    ringKeys,
    langHubOverrides
  );
  fillGasMotionFields(gasBuffers, layout, langHubOverrides);

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
    repoIdToIndices,
    items: virtualStars.map((v) => v.item),
    virtualStars,
    ringKeys,
    legend: buildLanguageLegend(repos),
    starTiers: buildStarTierLegend(repos),
    motion,
    anchorIndex,
    gas: gasBuffers,
    ringStarFlags,
  };
}

/** 按语言星系 hub 生成着色气体云粒子（仅较大星系，与星点同步 harmonize） */
export function buildGalaxyGasBuffers(layout, repos) {
  const { GAS_PARTICLES_PER_GALAXY, GAS_CORE_FILL_COUNT } = COSMIC_UNIVERSE;
  const hubs = buildLanguageGalaxyHubs(layout);
  const total = Math.max(repos?.length ?? 0, 1);
  const sf = Math.min(layout.spreadFactor ?? 1, 1.32);
  const gasLangs = qualifyingGasLanguages(layout);
  const perGalaxy = GAS_PARTICLES_PER_GALAXY;
  const corePerGalaxy = GAS_CORE_FILL_COUNT;
  const count = gasLangs.length * (perGalaxy + corePerGalaxy);
  if (!count) {
    return {
      positions: new Float32Array(0),
      colors: new Float32Array(0),
      sizes: new Float32Array(0),
      phases: new Float32Array(0),
      softness: new Float32Array(0),
      density: new Float32Array(0),
      stretch: new Float32Array(0),
      languages: [],
      langRadii: [],
      perGalaxy,
      corePerGalaxy,
      count: 0,
    };
  }

  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const softness = new Float32Array(count);
  const density = new Float32Array(count);
  const stretch = new Float32Array(count);
  const langRadii = [];
  let o = 0;

  for (const lang of gasLangs) {
    const hub = hubs.get(lang) ?? [0, 0, 0];
    const gR = galaxyRadiusForLanguage(lang, layout, total) * sf;
    langRadii.push(gR);
    const [br, bg, bb] = repoLangRgb(lang);
    const { tiltX, tiltZ } = galaxyFrameAngles(lang);
    const gasField = buildGasClumpField(lang, gR);
    const morphStretch =
      gasField.morphology === 3 ? 0.22 : gasField.morphology === 4 ? 0.18 : gasField.morphology === 2 ? 0.14 : 0.06;

    for (let j = 0; j < perGalaxy; j += 1) {
      const h = hashStr(`galaxy-gas:${lang}:${j}`);
      const particle = sampleGasCloudParticle(h, gasField);
      const [rx, ry, rz] = rotateGalaxyLocal(particle.lx, particle.ly, particle.lz, tiltX, tiltZ);
      const d = particle.density;

      positions[o * 3] = hub[0] * sf + rx;
      positions[o * 3 + 1] = hub[1] * sf + ry;
      positions[o * 3 + 2] = hub[2] * sf + rz;

      const tint = 0.58 + d * 0.32 + hashUnit(h, 7) * 0.2;
      const hueShift = (hashUnit(h, 12) - 0.5) * 0.08;
      colors[o * 3] = Math.min(1, br * tint + hueShift);
      colors[o * 3 + 1] = Math.min(1, bg * tint);
      colors[o * 3 + 2] = Math.min(1, bb * tint - hueShift * 0.4);

      const coreLift = d * d;
      sizes[o] = 5.5 + coreLift * 11.0 + hashUnit(h, 8) * (3.5 + d * 7.5);

      phases[o] = hashUnit(h, 9) * Math.PI * 2;
      softness[o] = 0.42 + (1 - d) * 0.38;
      density[o] = d;
      stretch[o] = morphStretch + hashUnit(h, 13) * 0.35;
      o += 1;
    }

    for (let j = 0; j < corePerGalaxy; j += 1) {
      const h = hashStr(`galaxy-gas-core:${lang}:${j}`);
      const coreR = gR * (0.06 + hashUnit(h, 1) * 0.22);
      const ang = hashUnit(h, 2) * Math.PI * 2;
      const lift = hashUnit(h, 3);
      const lx = Math.cos(ang) * coreR * (0.35 + hashUnit(h, 4) * 0.65);
      const ly = (lift - 0.5) * gR * 0.14 * (0.4 + hashUnit(h, 5) * 0.6);
      const lz = Math.sin(ang) * coreR * (0.35 + hashUnit(h, 6) * 0.65);
      const [rx, ry, rz] = rotateGalaxyLocal(lx, ly, lz, tiltX, tiltZ);
      const d = 0.72 + hashUnit(h, 7) * 0.22;

      positions[o * 3] = hub[0] * sf + rx;
      positions[o * 3 + 1] = hub[1] * sf + ry;
      positions[o * 3 + 2] = hub[2] * sf + rz;

      const tint = 0.68 + d * 0.28;
      colors[o * 3] = Math.min(1, br * tint);
      colors[o * 3 + 1] = Math.min(1, bg * tint);
      colors[o * 3 + 2] = Math.min(1, bb * tint);

      sizes[o] = 14.0 + hashUnit(h, 8) * 12.0;
      phases[o] = hashUnit(h, 9) * Math.PI * 2;
      softness[o] = 0.38 + hashUnit(h, 10) * 0.12;
      density[o] = d;
      stretch[o] = morphStretch * 0.35;
      o += 1;
    }
  }

  return {
    positions,
    colors,
    sizes,
    phases,
    softness,
    density,
    stretch,
    languages: gasLangs,
    langRadii,
    perGalaxy,
    corePerGalaxy,
    count,
  };
}

function boostTopicRingStars(virtualStars, layout, ringKeys, sizes, brights, count, ringStarFlags = null) {
  if (!ringKeys?.size || !count) return;
  for (let i = 0; i < count; i += 1) {
    const v = virtualStars[i];
    if (!v.topic) continue;
    const lang = virtualLanguageKey(v, layout);
    if (!ringKeys.has(topicRingKey(lang, v.topic))) continue;
    if (ringStarFlags && ringStarFlags[i] < 0.5) continue;
    sizes[i] *= 1.06;
    brights[i] = Math.min(1, brights[i] * 1.1);
  }
}

export function buildDustBuffers(count = 1600) {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const span = R_MAX - R_MIN;
  const { INTERGALACTIC_SPREAD } = COSMIC_UNIVERSE;

  for (let i = 0; i < count; i += 1) {
    const h = hashStr(`dust-${i}`);
    const theta = hashUnit(h, 1) * Math.PI * 2;
    const phi = Math.acos(Math.max(-1, Math.min(1, 2 * hashUnit(h, 2) - 1)));
    const r = span * INTERGALACTIC_SPREAD * Math.cbrt(hashUnit(h, 3)) * (0.65 + hashUnit(h, 4) * 0.55);

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    sizes[i] = 0.16 + hashUnit(h, 6) * 0.24;
  }
  return { positions, sizes };
}

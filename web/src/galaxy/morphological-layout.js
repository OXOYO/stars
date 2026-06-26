import {
  COSMIC_UNIVERSE,
  FORCE_LAYOUT,
  MORPHOLOGY_LAYOUT,
  R_MIN,
  R_MAX,
} from './constants.js';
import { gauss3, hashSeed, hashStr, hashUnit } from './hash.js';

function layoutLanguageKey(item, layout) {
  const lang = item.language || '其他';
  return layout.langKeys.has(lang) ? lang : '其他';
}

/** 语言星系在宇宙中的位置（斐波那契球面 + 深度弥散） */
export function buildLanguageGalaxyHubs(layout) {
  const langs = layout.languages || [];
  const n = langs.length;
  const span = R_MAX - R_MIN;
  const { HUB_RADIUS_FRAC, HUB_Y_FLATTEN } = COSMIC_UNIVERSE;
  const hubR = span * HUB_RADIUS_FRAC;
  const golden = Math.PI * (3 - Math.sqrt(5));
  /** @type {Map<string, [number, number, number]>} */
  const hubs = new Map();

  langs.forEach((lang, i) => {
    const h = hashStr(`galaxy-hub:${lang}`);
    const theta = golden * (i + 1) * 2.15 + hashUnit(h, 1) * Math.PI * 2;
    const z = 1 - (2 * (i + 0.5)) / Math.max(n, 1);
    const rxy = Math.sqrt(Math.max(0, 1 - z * z));
    const radial = hubR * (0.6 + hashUnit(h, 2) * 0.32);
    const cx = radial * rxy * Math.cos(theta);
    const cy = radial * rxy * Math.sin(theta) * HUB_Y_FLATTEN;
    const cz = radial * z;
    hubs.set(lang, [cx, cy, cz]);
  });

  return hubs;
}

/** 单语言星系尺度：大语言团更大，但非线性避免一家独大 */
export function galaxyRadiusForLanguage(lang, layout, totalRepos) {
  const span = R_MAX - R_MIN;
  const count = layout.langCounts?.get(lang) ?? 1;
  const share = count / Math.max(totalRepos, 1);
  const { GALAXY_BASE_FRAC, GALAXY_SIZE_POWER } = COSMIC_UNIVERSE;
  return span * GALAXY_BASE_FRAC * (0.66 + Math.pow(share, GALAXY_SIZE_POWER) * 1.58);
}

/** 具备气体云的语言星系：按仓数排名取前 N%（至少 1 个） */
export function qualifyingGasLanguages(layout) {
  const { GAS_LANG_TOP_PERCENT } = COSMIC_UNIVERSE;
  const langs = layout.languages || [];
  if (!langs.length) return [];

  const ranked = langs
    .map((lang) => ({ lang, count: layout.langCounts?.get(lang) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.lang.localeCompare(b.lang));

  const topN = Math.max(1, Math.ceil(langs.length * GAS_LANG_TOP_PERCENT));
  return ranked.slice(0, topN).map((row) => row.lang);
}

/** 星系局部坐标系倾角（每语言独立 3D 朝向） */
export function galaxyFrameAngles(lang) {
  const h = hashStr(`galaxy-frame:${lang}`);
  const { GALAXY_TILT_SPREAD } = COSMIC_UNIVERSE;
  return {
    tiltX: (hashUnit(h, 1) - 0.5) * GALAXY_TILT_SPREAD,
    tiltZ: hashUnit(h, 2) * Math.PI * 2,
  };
}

export function rotateGalaxyLocal(x, y, z, tiltX, tiltZ) {
  const cx = Math.cos(tiltX);
  const sx = Math.sin(tiltX);
  const y1 = y * cx - z * sx;
  const z1 = y * sx + z * cx;
  const cz = Math.cos(tiltZ);
  const sz = Math.sin(tiltZ);
  const x2 = x * cz - z1 * sz;
  const z2 = x * sz + z1 * cz;
  return [x2, y1, z2];
}

/** 星系内摆位：椭球盘 + 弱臂增密 + 大量场星（避免轨道感） */
function sampleGalaxyLocal(h, lang, galaxyR) {
  const { GALAXY_DISK_Y, GALAXY_FIELD_RATIO, GALAXY_ARM_STRENGTH, GALAXY_ARMS } =
    COSMIC_UNIVERSE;
  const radial = galaxyR * Math.pow(hashUnit(h, 9), 0.55) * 0.9;
  const diskScale = 0.52 + hashUnit(h, 10) * 0.24;
  const sx = radial * diskScale * (0.58 + hashUnit(h, 3) * 0.32);
  const sy = galaxyR * GALAXY_DISK_Y * (0.68 + hashUnit(h, 4) * 0.42);
  const sz = radial * diskScale * (0.58 + hashUnit(h, 5) * 0.32);
  const diskAng = hashUnit(h, 11) * Math.PI * 2;
  const diskR = radial * (0.44 + hashUnit(h, 12) * 0.56);

  let lx =
    gauss3(hashSeed(h, 'lx1'), hashSeed(h, 'lx2'), hashSeed(h, 'lx3')) * sx * 0.42 +
    Math.cos(diskAng) * diskR * 0.88;
  let ly = gauss3(hashSeed(h, 'ly1'), hashSeed(h, 'ly2'), hashSeed(h, 'ly3')) * sy;
  let lz =
    gauss3(hashSeed(h, 'lz1'), hashSeed(h, 'lz2'), hashSeed(h, 'lz3')) * sz * 0.42 +
    Math.sin(diskAng) * diskR * 0.88;

  if (hashUnit(h, 6) > GALAXY_FIELD_RATIO) {
    const lr = Math.hypot(lx, lz);
    const lang0 = Math.atan2(lz, lx);
    const arm = Math.floor(hashUnit(h, 7) * GALAXY_ARMS);
    const armAng =
      lang0 +
      Math.log1p(lr / galaxyR) * 1.35 +
      arm * (Math.PI / GALAXY_ARMS) +
      gauss3(hashSeed(h, 'ar1'), hashSeed(h, 'ar2'), hashSeed(h, 'ar3')) * 0.22;
    const pull = galaxyR * GALAXY_ARM_STRENGTH * (0.35 + hashUnit(h, 8) * 0.65);
    lx += Math.cos(armAng) * pull;
    lz += Math.sin(armAng) * pull;
    ly += gauss3(hashSeed(h, 'ar4'), hashSeed(h, 'ar5'), hashSeed(h, 'ar6')) * pull * 0.35;
  }

  const bulge = Math.exp(-((lx * lx + lz * lz) / (galaxyR * galaxyR * 0.28)));
  lx *= 0.68 + bulge * 0.38;
  lz *= 0.68 + bulge * 0.38;
  ly *= 0.82 + bulge * 0.42;

  return [lx, ly, lz];
}

/** 与星系盘面共面，使气体云覆盖星点分布范围 */
export function gasCloudFrameAngles(lang) {
  return galaxyFrameAngles(lang);
}

/** 气体云形态：0 不规则团块 / 1 丝状枢纽 / 2 双极 / 3 彗尾 / 4 分子片 */
function gasCloudMorphology(lang) {
  const h = hashStr(`gas-morph:${lang}`);
  return Math.floor(hashUnit(h, 0) * 5);
}

/**
 * 单团气体云：每语言星系一团，形态仅影响椭球比例与倾角（不再多 knot 碎斑）
 */
export function buildGasClumpField(lang, galaxyR) {
  const morph = gasCloudMorphology(lang);
  const h = hashStr(`gas-mono:${lang}`);
  const gR = galaxyR;
  const { GALAXY_DISK_Y, GAS_DISK_RADIUS_MULT, GAS_DISK_RADIUS_JITTER, GAS_Y_DISK_MULT } =
    COSMIC_UNIVERSE;
  const diskR = GAS_DISK_RADIUS_MULT + hashUnit(h, 1) * GAS_DISK_RADIUS_JITTER;
  const diskY = GALAXY_DISK_Y * (GAS_Y_DISK_MULT + hashUnit(h, 2) * 0.12);
  let rxMul;
  let ryMul;
  let rzMul;

  if (morph === 2) {
    rxMul = diskR * (1.04 + hashUnit(h, 3) * 0.08);
    ryMul = diskY * (0.82 + hashUnit(h, 4) * 0.12);
    rzMul = diskR * (0.88 + hashUnit(h, 5) * 0.08);
  } else if (morph === 1) {
    rxMul = diskR * (0.98 + hashUnit(h, 3) * 0.04);
    ryMul = diskY * (0.86 + hashUnit(h, 4) * 0.1);
    rzMul = diskR * (0.98 + hashUnit(h, 5) * 0.04);
  } else if (morph === 3) {
    rxMul = diskR * (0.96 + hashUnit(h, 3) * 0.06);
    ryMul = diskY * (0.9 + hashUnit(h, 4) * 0.14);
    rzMul = diskR * (1.02 + hashUnit(h, 5) * 0.06);
  } else if (morph === 4) {
    rxMul = diskR * (1.02 + hashUnit(h, 3) * 0.05);
    ryMul = diskY * (0.62 + hashUnit(h, 4) * 0.1);
    rzMul = diskR * (1.02 + hashUnit(h, 5) * 0.05);
  } else {
    rxMul = diskR * (0.94 + hashUnit(h, 3) * 0.06);
    ryMul = diskY * (0.88 + hashUnit(h, 4) * 0.12);
    rzMul = diskR * (0.94 + hashUnit(h, 5) * 0.06);
  }

  const clumps = [
    {
      cx: 0,
      cy: 0,
      cz: 0,
      rx: gR * rxMul,
      ry: gR * ryMul,
      rz: gR * rzMul,
      tiltX: (hashUnit(h, 4) - 0.5) * 0.72,
      tiltZ: hashUnit(h, 5) * Math.PI * 2,
      weight: 1,
    },
  ];

  return { clumps, weightSum: 1, morphology: morph };
}

function pickGasClump(h, field) {
  const clumps = field.clumps;
  let target = hashUnit(h, 0) * field.weightSum;
  for (let i = 0; i < clumps.length; i += 1) {
    target -= clumps[i].weight;
    if (target <= 0) return clumps[i];
  }
  return clumps[clumps.length - 1];
}

/** 在椭球体内采样：体积均匀填充 + 中心略亮，禁止外缘增密（避免空心环） */
function sampleEllipsoidVolume(h, rx, ry, rz, tier) {
  const u = hashUnit(h, 6);
  const v = hashUnit(h, 7);
  const w = hashUnit(h, 8);
  const theta = Math.PI * 2 * u;
  const phi = Math.acos(Math.max(-1, Math.min(1, 2 * v - 1)));
  const radial = Math.cbrt(w) * (0.94 + tier * 0.03);
  const bulge = Math.exp(-radial * radial * 2.1);
  const edgeFade = 1.0 - Math.max(0, radial - 0.88) * 2.8;
  const density = (0.28 + bulge * 0.48 + hashUnit(h, 9) * 0.14) * edgeFade;
  const sr = Math.sin(phi);
  let lx = sr * Math.cos(theta) * radial * rx;
  let ly = Math.cos(phi) * radial * ry;
  let lz = sr * Math.sin(theta) * radial * rz;
  const wisp = 0.04 * (1 - radial * 0.6);
  lx += gauss3(hashSeed(h, 'w1'), hashSeed(h, 'w2'), hashSeed(h, 'w3')) * rx * wisp;
  ly += gauss3(hashSeed(h, 'w4'), hashSeed(h, 'w5'), hashSeed(h, 'w6')) * ry * wisp;
  lz += gauss3(hashSeed(h, 'w7'), hashSeed(h, 'w8'), hashSeed(h, 'w9')) * rz * wisp;
  return { lx, ly, lz, density };
}

/**
 * 单粒气体云：三维球团体积采样
 * @returns {{ lx: number, ly: number, lz: number, density: number }}
 */
export function sampleGasCloudParticle(h, field) {
  const tier = hashUnit(h, 1);
  const cl = pickGasClump(h, field);
  const local = sampleEllipsoidVolume(h, cl.rx, cl.ry, cl.rz, tier);
  const [rx, ry, rz] = rotateGalaxyLocal(local.lx, local.ly, local.lz, cl.tiltX, cl.tiltZ);
  return {
    lx: cl.cx + rx,
    ly: cl.cy + ry,
    lz: cl.cz + rz,
    density: local.density,
  };
}

/** 星系际场星：宇宙_void 中的稀疏背景星 */
function sampleIntergalactic(h, span) {
  const { INTERGALACTIC_SPREAD } = COSMIC_UNIVERSE;
  const u = hashUnit(h, 10);
  const v = hashUnit(h, 11);
  const w = hashUnit(h, 12);
  const theta = Math.PI * 2 * u;
  const phi = Math.acos(Math.max(-1, Math.min(1, 2 * v - 1)));
  const r = span * INTERGALACTIC_SPREAD * Math.cbrt(w) * (0.55 + hashUnit(h, 13) * 0.45);
  let x = r * Math.sin(phi) * Math.cos(theta);
  let y = r * Math.cos(phi);
  let z = r * Math.sin(phi) * Math.sin(theta);
  const jitter = span * 0.04;
  x += gauss3(hashSeed(h, 'ig1'), hashSeed(h, 'ig2'), hashSeed(h, 'ig3')) * jitter;
  y += gauss3(hashSeed(h, 'ig4'), hashSeed(h, 'ig5'), hashSeed(h, 'ig6')) * jitter * 0.7;
  z += gauss3(hashSeed(h, 'ig7'), hashSeed(h, 'ig8'), hashSeed(h, 'ig9')) * jitter;
  return [x, y, z];
}

function buildCosmicRepoAnchors(repos, layout) {
  const sf = Math.min(layout.spreadFactor ?? 1, 1.32);
  const total = Math.max(repos.length, 1);
  const hubs = buildLanguageGalaxyHubs(layout);
  /** @type {Map<string, [number, number, number]>} */
  const repoPosById = new Map();
  const span = R_MAX - R_MIN;
  const { INTERGALACTIC_RATIO, VOLUME_SCALE } = { ...COSMIC_UNIVERSE, VOLUME_SCALE: MORPHOLOGY_LAYOUT.VOLUME_SCALE };

  for (const item of repos) {
    const id = item?.id;
    if (!id) continue;

    const h = hashStr(id);
    let x;
    let y;
    let z;

    if (hashUnit(h, 0) < INTERGALACTIC_RATIO) {
      [x, y, z] = sampleIntergalactic(h, span);
    } else {
      const lang = layoutLanguageKey(item, layout);
      const hub = hubs.get(lang) ?? [0, 0, 0];
      const galaxyR = galaxyRadiusForLanguage(lang, layout, total);
      const frame = galaxyFrameAngles(lang);
      const [lx, ly, lz] = sampleGalaxyLocal(h, lang, galaxyR);
      const [rx, ry, rz] = rotateGalaxyLocal(lx, ly, lz, frame.tiltX, frame.tiltZ);
      x = hub[0] * sf + rx * sf;
      y = hub[1] * sf + ry * sf;
      z = hub[2] * sf + rz * sf;
    }

    const jitter = span * 0.016 * VOLUME_SCALE;
    x += gauss3(hashSeed(h, 'jx1'), hashSeed(h, 'jx2'), hashSeed(h, 'jx3')) * jitter;
    y += gauss3(hashSeed(h, 'jy1'), hashSeed(h, 'jy2'), hashSeed(h, 'jy3')) * jitter * 0.72;
    z += gauss3(hashSeed(h, 'jz1'), hashSeed(h, 'jz2'), hashSeed(h, 'jz3')) * jitter;

    repoPosById.set(id, [x, y, z]);
  }

  return repoPosById;
}

function placeNebulaStar(v, base, spread, positions, i, topicBoost = 1) {
  const h = hashStr(v.virtualKey);
  const { NEBULA_WISP } = COSMIC_UNIVERSE;
  const boost = topicBoost;
  const sx = spread * boost * (0.85 + hashUnit(h, 7) * 0.62);
  const sy = spread * boost * (0.72 + hashUnit(h, 8) * 0.68);
  const sz = spread * boost * (0.85 + hashUnit(h, 9) * 0.62);

  let px = base[0] + gauss3(hashSeed(h, 'nx1'), hashSeed(h, 'nx2'), hashSeed(h, 'nx3')) * sx;
  let py = base[1] + gauss3(hashSeed(h, 'ny1'), hashSeed(h, 'ny2'), hashSeed(h, 'ny3')) * sy;
  let pz = base[2] + gauss3(hashSeed(h, 'nz1'), hashSeed(h, 'nz2'), hashSeed(h, 'nz3')) * sz;

  const wisp = spread * NEBULA_WISP;
  const stretch = hashUnit(h, 11) * Math.PI * 2;
  px += Math.cos(stretch) * gauss3(hashSeed(h, 'cx'), hashSeed(h, 'cy'), hashSeed(h, 'cz')) * wisp;
  py += gauss3(hashSeed(h, 'y4'), hashSeed(h, 'y5'), hashSeed(h, 'y6')) * wisp * 0.85;
  pz += Math.sin(stretch) * gauss3(hashSeed(h, 'cz1'), hashSeed(h, 'cz2'), hashSeed(h, 'cz3')) * wisp;

  positions[i * 3] = px;
  positions[i * 3 + 1] = py;
  positions[i * 3 + 2] = pz;
}

function placeDustStar(base, spread, positions, i, h) {
  const dust = spread * (1.05 + hashUnit(h, 21) * 1.45);
  positions[i * 3] =
    base[0] + gauss3(hashSeed(h, 'd1'), hashSeed(h, 'd2'), hashSeed(h, 'd3')) * dust;
  positions[i * 3 + 1] =
    base[1] + gauss3(hashSeed(h, 'd4'), hashSeed(h, 'd5'), hashSeed(h, 'd6')) * dust * 0.82;
  positions[i * 3 + 2] =
    base[2] + gauss3(hashSeed(h, 'd7'), hashSeed(h, 'd8'), hashSeed(h, 'd9')) * dust;
}

/**
 * 宇宙布局：多星系 + 星云晕 + 场星
 */
export function buildMorphologicalVirtualPositions(repos, virtualStars, layout, ringKeys) {
  const n = virtualStars?.length ?? 0;
  const positions = new Float32Array(n * 3);
  if (!n) return positions;

  const repoPosById = buildCosmicRepoAnchors(repos, layout);

  /** @type {Map<string, number>} */
  const repoTopicCounts = new Map();
  for (const v of virtualStars) {
    if (!v.topic) continue;
    repoTopicCounts.set(v.repoId, (repoTopicCounts.get(v.repoId) || 0) + 1);
  }

  const { NEBULA_SPREAD_MIN, NEBULA_SPREAD_MAX, DUST_RATIO } = MORPHOLOGY_LAYOUT;
  const { TOPIC_NEBULA_BOOST } = COSMIC_UNIVERSE;
  const sf = layout.spreadFactor ?? 1;
  const diskScale = R_MAX * sf * 0.88;
  /** @type {Map<string, number>} */
  const repoTopicSlot = new Map();

  for (let i = 0; i < n; i += 1) {
    const v = virtualStars[i];
    const base = repoPosById.get(v.repoId) ?? [0, 0, 0];
    const h = hashStr(v.virtualKey);
    const dist = Math.hypot(base[0], base[2]);
    const t = Math.min(1, dist / diskScale);
    const spread = NEBULA_SPREAD_MIN + t * (NEBULA_SPREAD_MAX - NEBULA_SPREAD_MIN);
    const topicBoost = v.topic ? TOPIC_NEBULA_BOOST : 1;

    if (hashUnit(h, 20) < DUST_RATIO) {
      placeDustStar(base, spread * topicBoost, positions, i, h);
    } else {
      placeNebulaStar(v, base, spread, positions, i, topicBoost);
    }

    const topicCount = repoTopicCounts.get(v.repoId) || 1;
    if (topicCount > 1 && v.topic) {
      let slot = repoTopicSlot.get(v.repoId) ?? 0;
      repoTopicSlot.set(v.repoId, slot + 1);
      const subSpread = spread * (0.18 + topicCount * 0.038) * topicBoost;
      positions[i * 3] +=
        gauss3(hashSeed(h, 'st1'), hashSeed(h, 'st2'), hashSeed(h, 'st3')) * subSpread;
      positions[i * 3 + 1] +=
        gauss3(hashSeed(h, 'st4'), hashSeed(h, 'st5'), hashSeed(h, 'st6')) * subSpread * 0.65;
      positions[i * 3 + 2] +=
        gauss3(hashSeed(h, 'st7'), hashSeed(h, 'st8'), hashSeed(h, 'st9')) * subSpread;
    }
  }

  return positions;
}

/**
 * 质心归零 + 温和缩放
 */
export function harmonizeCosmicSpan(positions, count, auxBuffers = []) {
  if (count <= 0) return null;
  const targetSpan = FORCE_LAYOUT.TARGET_SPAN;
  const yFlatten = COSMIC_UNIVERSE.UNIVERSE_Y_FLATTEN;

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

  const radii = new Float32Array(count);
  let maxR = 1;
  for (let i = 0; i < count; i += 1) {
    const x = positions[i * 3] - cx;
    const y = positions[i * 3 + 1] - cy;
    const z = positions[i * 3 + 2] - cz;
    const r = Math.sqrt(x * x + y * y + z * z);
    radii[i] = r;
    maxR = Math.max(maxR, r);
  }

  const sorted = [...radii].sort((a, b) => a - b);
  const p88 = sorted[Math.min(count - 1, Math.floor(count * 0.88))] || maxR;
  const desired = targetSpan * 0.92;
  const effectiveR = Math.max(p88 * 1.02, maxR * 0.78);
  let scale = desired / effectiveR;
  if (scale > 1.14) scale = 1.14;

  const applyScale = (buf, n) => {
    for (let i = 0; i < n; i += 1) {
      buf[i * 3] = (buf[i * 3] - cx) * scale;
      buf[i * 3 + 1] = (buf[i * 3 + 1] - cy) * scale * yFlatten;
      buf[i * 3 + 2] = (buf[i * 3 + 2] - cz) * scale;
    }
  };

  applyScale(positions, count);
  for (const aux of auxBuffers) {
    if (!aux?.buf || aux.n <= 0) continue;
    applyScale(aux.buf, aux.n);
  }

  return { cx, cy, cz, scale, yFlatten };
}

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

/** 语言星系 hub：兼容 motion/gas，返回密度场吸引子中心 */
export function buildLanguageGalaxyHubs(layout) {
  const field = buildCosmicLanguageField(layout, 1);
  /** @type {Map<string, [number, number, number]>} */
  const hubs = new Map();
  for (const [lang, kernel] of field.kernels) {
    hubs.set(lang, [kernel.cx, kernel.cy, kernel.cz]);
  }
  return hubs;
}

/** 语言高斯核 σ（仓数越多略大，但上限受控避免独占） */
export function galaxyRadiusForLanguage(lang, layout, totalRepos) {
  const span = R_MAX - R_MIN;
  const count = layout.langCounts?.get(lang) ?? 1;
  const share = count / Math.max(totalRepos, 1);
  const { KERNEL_SIGMA_FRAC, KERNEL_SIGMA_POWER, GALAXY_BASE_FRAC, GALAXY_SIZE_POWER } =
    COSMIC_UNIVERSE;
  const sigmaFrac = KERNEL_SIGMA_FRAC ?? GALAXY_BASE_FRAC;
  const sigmaPow = KERNEL_SIGMA_POWER ?? GALAXY_SIZE_POWER;
  return span * sigmaFrac * (0.68 + Math.pow(share, sigmaPow) * 0.48);
}

/**
 * 单一宇宙密度场：每个语言一个重叠高斯吸引子
 * @returns {{ kernels: Map<string, { cx: number, cy: number, cz: number, sigma: number, frame: object, lang: string }>, span: number, coreR: number }}
 */
export function buildCosmicLanguageField(layout, totalRepos = 1) {
  const langs = layout.languages || [];
  const span = R_MAX - R_MIN;
  const { ATTRACTOR_CORE_FRAC, HUB_RADIUS_FRAC } = COSMIC_UNIVERSE;
  const coreR = span * (ATTRACTOR_CORE_FRAC ?? HUB_RADIUS_FRAC ?? 0.36);
  /** @type {Map<string, { cx: number, cy: number, cz: number, sigma: number, frame: ReturnType<typeof galaxyFrameAngles>, lang: string }>} */
  const kernels = new Map();

  for (const lang of langs) {
    const h = hashStr(`field-attractor:${lang}`);
    const u = hashUnit(h, 1);
    const v = hashUnit(h, 2);
    const w = hashUnit(h, 3);
    const theta = Math.PI * 2 * u;
    const phi = Math.acos(Math.max(-1, Math.min(1, 2 * v - 1)));
    const radial = coreR * Math.cbrt(w) * (0.35 + hashUnit(h, 4) * 0.65);
    const cx = radial * Math.sin(phi) * Math.cos(theta);
    const cy = radial * Math.cos(phi);
    const cz = radial * Math.sin(phi) * Math.sin(theta);
    kernels.set(lang, {
      cx,
      cy,
      cz,
      sigma: galaxyRadiusForLanguage(lang, layout, totalRepos),
      frame: galaxyFrameAngles(lang),
      lang,
    });
  }

  return { kernels, span, coreR };
}

function pickSecondaryKernel(h, lang, kernels) {
  const langs = [...kernels.keys()];
  if (langs.length < 2) return null;
  let idx = Math.floor(hashUnit(h, 16) * langs.length) % langs.length;
  let secLang = langs[idx];
  if (secLang === lang) secLang = langs[(idx + 1) % langs.length];
  return kernels.get(secLang) ?? null;
}

/** 在语言高斯核内采样（取向随核 frame 旋转） */
function sampleLanguageKernel(h, kernel) {
  const { cx, cy, cz, sigma, frame, lang } = kernel;
  const [lx, ly, lz] = sampleGalaxyLocal(h, lang, sigma);
  const [rx, ry, rz] = rotateGalaxyLocal(lx, ly, lz, frame.tiltX, frame.tiltZ, frame.tiltY);
  return [cx + rx, cy + ry, cz + rz];
}

/** 场星：在整个宇宙球均匀采样 */
function sampleCosmicVoid(h, span) {
  const { INTERGALACTIC_SPREAD } = COSMIC_UNIVERSE;
  const u = hashUnit(h, 10);
  const v = hashUnit(h, 11);
  const w = hashUnit(h, 12);
  const theta = Math.PI * 2 * u;
  const phi = Math.acos(Math.max(-1, Math.min(1, 2 * v - 1)));
  const r = span * INTERGALACTIC_SPREAD * Math.cbrt(w) * (0.48 + hashUnit(h, 13) * 0.52);
  let x = r * Math.sin(phi) * Math.cos(theta);
  let y = r * Math.cos(phi);
  let z = r * Math.sin(phi) * Math.sin(theta);
  const jitter = span * 0.035;
  x += gauss3(hashSeed(h, 'ig1'), hashSeed(h, 'ig2'), hashSeed(h, 'ig3')) * jitter;
  y += gauss3(hashSeed(h, 'ig4'), hashSeed(h, 'ig5'), hashSeed(h, 'ig6')) * jitter * 0.82;
  z += gauss3(hashSeed(h, 'ig7'), hashSeed(h, 'ig8'), hashSeed(h, 'ig9')) * jitter;
  return [x, y, z];
}

function applyFieldFilament(h, x, y, z, span) {
  const amp = span * (COSMIC_UNIVERSE.FIELD_FILAMENT ?? 0.04);
  const fx = hashUnit(h, 21) * Math.PI * 2;
  const fy = hashUnit(h, 22) * Math.PI * 2;
  return [
    x + Math.sin(fy + z * 0.028) * amp * gauss3(hashSeed(h, 'f1'), hashSeed(h, 'f2'), hashSeed(h, 'f3')),
    y + Math.cos(fx + x * 0.024) * amp * 0.72 * gauss3(hashSeed(h, 'f4'), hashSeed(h, 'f5'), hashSeed(h, 'f6')),
    z + Math.sin(fx + y * 0.026) * amp * gauss3(hashSeed(h, 'f7'), hashSeed(h, 'f8'), hashSeed(h, 'f9')),
  ];
}

/** 密度场采样：主语言核 + 次核混合 + 丝状扰动 */
function sampleCosmicFieldPosition(item, h, field, layout) {
  const lang = layoutLanguageKey(item, layout);
  const kernel = field.kernels.get(lang) ?? [...field.kernels.values()][0];
  if (!kernel) return [0, 0, 0];

  let pos = sampleLanguageKernel(h, kernel);

  const secondary = pickSecondaryKernel(h, lang, field.kernels);
  if (secondary) {
    const secPos = sampleLanguageKernel(hashSeed(h, 'blend'), secondary);
    const bleed = COSMIC_UNIVERSE.KERNEL_OVERLAP_BLEED ?? 0.14;
    const mix = bleed * (0.45 + hashUnit(h, 17) * 0.55);
    pos = [
      pos[0] * (1 - mix) + secPos[0] * mix,
      pos[1] * (1 - mix) + secPos[1] * mix,
      pos[2] * (1 - mix) + secPos[2] * mix,
    ];
  }

  return applyFieldFilament(h, pos[0], pos[1], pos[2], field.span);
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

/** 星系局部坐标系：近全向随机取向（三轴欧拉角） */
export function galaxyFrameAngles(lang) {
  const h = hashStr(`galaxy-frame:${lang}`);
  const spread = COSMIC_UNIVERSE.GALAXY_TILT_SPREAD;
  return {
    tiltX: (hashUnit(h, 1) - 0.5) * spread * Math.PI,
    tiltY: hashUnit(h, 2) * Math.PI * 2,
    tiltZ: hashUnit(h, 3) * Math.PI * 2,
  };
}

export function rotateGalaxyLocal(x, y, z, tiltX, tiltZ, tiltY = 0) {
  if (tiltY) {
    const cy = Math.cos(tiltY);
    const sy = Math.sin(tiltY);
    const x0 = cy * x + sy * z;
    const z0 = -sy * x + cy * z;
    x = x0;
    z = z0;
  }
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

/** 星系内摆位：三维椭球高斯云（Sérsic 式中心渐密），无旋臂/极坐标盘 */
function sampleGalaxyLocal(h, lang, galaxyR) {
  const { GALAXY_DISK_Y } = COSMIC_UNIVERSE;
  const ax = galaxyR * (0.48 + hashUnit(h, 3) * 0.38);
  const ay = galaxyR * GALAXY_DISK_Y * (0.48 + hashUnit(h, 4) * 0.38);
  const az = galaxyR * (0.48 + hashUnit(h, 5) * 0.38);

  let lx = gauss3(hashSeed(h, 'lx1'), hashSeed(h, 'lx2'), hashSeed(h, 'lx3')) * ax;
  let ly = gauss3(hashSeed(h, 'ly1'), hashSeed(h, 'ly2'), hashSeed(h, 'ly3')) * ay;
  let lz = gauss3(hashSeed(h, 'lz1'), hashSeed(h, 'lz2'), hashSeed(h, 'lz3')) * az;

  const r2 = (lx * lx) / (ax * ax) + (ly * ly) / (ay * ay) + (lz * lz) / (az * az);
  const bulge = Math.exp(-r2 * 1.35);
  const shrink = 0.52 + bulge * 0.48;
  lx *= shrink;
  ly *= shrink;
  lz *= shrink;

  const wisp = galaxyR * 0.04 * (1 - bulge * 0.6);
  lx += gauss3(hashSeed(h, 'w1'), hashSeed(h, 'w2'), hashSeed(h, 'w3')) * wisp;
  ly += gauss3(hashSeed(h, 'w4'), hashSeed(h, 'w5'), hashSeed(h, 'w6')) * wisp * 0.85;
  lz += gauss3(hashSeed(h, 'w7'), hashSeed(h, 'w8'), hashSeed(h, 'w9')) * wisp;

  return [lx, ly, lz];
}

/** 与星系盘面共面，使气体云覆盖星点分布范围 */
export function gasCloudFrameAngles(lang) {
  return galaxyFrameAngles(lang);
}

/**
 * 多 clump 气体场：椭球团 + 丝状链，模拟真实星云结构
 */
export function buildGasClumpField(lang, galaxyR) {
  const h = hashStr(`gas-mono:${lang}`);
  const gR = galaxyR;
  const { GAS_DISK_RADIUS_MULT, GAS_DISK_RADIUS_JITTER } = COSMIC_UNIVERSE;
  const diskR = GAS_DISK_RADIUS_MULT + hashUnit(h, 1) * GAS_DISK_RADIUS_JITTER;
  const frame = galaxyFrameAngles(lang);
  const clumpCount = 3 + Math.floor(hashUnit(h, 2) * 4);

  /** @type {Array<{ cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, tiltX: number, tiltY: number, tiltZ: number, weight: number, filDx: number, filDy: number, filDz: number, pillar: boolean }>} */
  const clumps = [];
  let weightSum = 0;

  for (let ci = 0; ci < clumpCount; ci += 1) {
    const ch = hashStr(`gas-clump:${lang}:${ci}`);
    const ang = hashUnit(ch, 0) * Math.PI * 2;
    const dist = gR * (0.08 + hashUnit(ch, 1) * 0.68);
    const scale = 0.34 + hashUnit(ch, 3) * 0.48;
    const filAng = hashUnit(ch, 9) * Math.PI * 2;
    const weight = 0.45 + hashUnit(ch, 8) * 1.15;
    const pillar = hashUnit(ch, 11) < 0.38;
    const rxBase = gR * diskR * scale * (0.88 + hashUnit(ch, 4) * 0.42);
    const ryBase = gR * diskR * scale * (0.68 + hashUnit(ch, 5) * 0.38);
    const rzBase = gR * diskR * scale * (0.82 + hashUnit(ch, 6) * 0.4);
    clumps.push({
      cx: Math.cos(ang) * dist,
      cy: (hashUnit(ch, 2) - 0.5) * gR * (pillar ? 0.28 : 0.22),
      cz: Math.sin(ang) * dist,
      rx: pillar ? rxBase * 0.32 : rxBase,
      ry: pillar ? ryBase * (2.1 + hashUnit(ch, 12) * 0.9) : ryBase,
      rz: pillar ? rzBase * 0.34 : rzBase,
      tiltX: frame.tiltX,
      tiltY: frame.tiltY,
      tiltZ: frame.tiltZ + (hashUnit(ch, 7) - 0.5) * 0.45,
      weight,
      filDx: pillar ? 0 : Math.cos(filAng),
      filDy: pillar ? 1 : (hashUnit(ch, 10) - 0.5) * 0.32,
      filDz: pillar ? 0 : Math.sin(filAng),
      pillar,
    });
    weightSum += weight;
  }

  if (!clumps.length) {
    clumps.push({
      cx: 0,
      cy: 0,
      cz: 0,
      rx: gR * diskR * 0.72,
      ry: gR * diskR * 0.58,
      rz: gR * diskR * 0.68,
      tiltX: frame.tiltX,
      tiltY: frame.tiltY,
      tiltZ: frame.tiltZ,
      weight: 1,
      filDx: 1,
      filDy: 0,
      filDz: 0,
      pillar: false,
    });
    weightSum = 1;
  }

  return { clumps, weightSum, morphology: 2 };
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

/** 在椭球/尘柱体内采样 */
function sampleEllipsoidVolume(h, rx, ry, rz, tier, pillar = false) {
  const u = hashUnit(h, 6);
  const v = hashUnit(h, 7);
  const w = hashUnit(h, 8);
  let lx;
  let ly;
  let lz;
  let radial;
  if (pillar) {
    const theta = Math.PI * 2 * u;
    radial = Math.pow(w, 1.15) * (0.82 + tier * 0.14);
    lx = Math.cos(theta) * radial * rx;
    lz = Math.sin(theta) * radial * rz;
    ly = (v * 2 - 1) * ry * (0.55 + radial * 0.45);
  } else {
    const theta = Math.PI * 2 * u;
    const phi = Math.acos(Math.max(-1, Math.min(1, 2 * v - 1)));
    radial = Math.pow(w, 1.48) * (0.88 + tier * 0.16);
    const sr = Math.sin(phi);
    lx = sr * Math.cos(theta) * radial * rx;
    ly = Math.cos(phi) * radial * ry;
    lz = sr * Math.sin(theta) * radial * rz;
  }
  const bulge = Math.exp(-radial * radial * (pillar ? 1.8 : 2.2));
  const edgeFade = 1.0 - smoothstep(pillar ? 0.68 : 0.72, 0.98, radial);
  const density = (0.16 + bulge * 0.38 + hashUnit(h, 9) * 0.1) * edgeFade;
  const wisp = 0.14 * (1 - radial * 0.55);
  lx += gauss3(hashSeed(h, 'w1'), hashSeed(h, 'w2'), hashSeed(h, 'w3')) * rx * wisp;
  ly += gauss3(hashSeed(h, 'w4'), hashSeed(h, 'w5'), hashSeed(h, 'w6')) * ry * wisp;
  lz += gauss3(hashSeed(h, 'w7'), hashSeed(h, 'w8'), hashSeed(h, 'w9')) * rz * wisp;
  return { lx, ly, lz, density };
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function normalize3(x, y, z) {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

function sampleFilamentParticle(h, cl) {
  const chainT = hashUnit(h, 2);
  const chainLen = cl.rx * (0.58 + hashUnit(h, 3) * 1.35);
  const perpAng = hashUnit(h, 4) * Math.PI * 2;
  const perpR = cl.rx * 0.16 * (1 - Math.abs(chainT - 0.5) * 1.2) * hashUnit(h, 5);
  const [dx, dy, dz] = normalize3(cl.filDx ?? 1, cl.filDy ?? 0, cl.filDz ?? 0);
  let px = dy * Math.sin(perpAng) - dz * Math.cos(perpAng);
  let py = dz * Math.sin(perpAng) - dx * Math.cos(perpAng);
  let pz = dx * Math.sin(perpAng) - dy * Math.cos(perpAng);
  [px, py, pz] = normalize3(px, py, pz);

  const along = (chainT - 0.5) * chainLen;
  let lx = cl.cx + dx * along + px * perpR;
  let ly = cl.cy + dy * along + py * perpR * 0.65;
  let lz = cl.cz + dz * along + pz * perpR;

  const wisp = 0.1 * cl.rx;
  lx += gauss3(hashSeed(h, 'f1'), hashSeed(h, 'f2'), hashSeed(h, 'f3')) * wisp;
  ly += gauss3(hashSeed(h, 'f4'), hashSeed(h, 'f5'), hashSeed(h, 'f6')) * wisp * 0.55;
  lz += gauss3(hashSeed(h, 'f7'), hashSeed(h, 'f8'), hashSeed(h, 'f9')) * wisp;

  const radial = Math.abs(chainT - 0.5) * 2;
  const edgeFade = 1.0 - smoothstep(0.52, 0.96, radial);
  const density = (0.2 + (1 - radial) * 0.38 + hashUnit(h, 9) * 0.14) * edgeFade;
  const stretch = 0.48 + hashUnit(h, 10) * 0.52;
  return { lx, ly, lz, density, stretch };
}

/**
 * 单粒气体云：丝状链 + 椭球体混合采样
 * @returns {{ lx: number, ly: number, lz: number, density: number, stretch: number }}
 */
export function sampleGasCloudParticle(h, field) {
  const cl = pickGasClump(h, field);
  const useFilament = !cl.pillar && hashUnit(h, 0) < 0.52;

  let local;
  let stretch;
  if (useFilament) {
    local = sampleFilamentParticle(h, cl);
    stretch = local.stretch;
  } else {
    const tier = hashUnit(h, 1);
    const ell = sampleEllipsoidVolume(h, cl.rx, cl.ry, cl.rz, tier, !!cl.pillar);
    local = {
      lx: cl.cx + ell.lx,
      ly: cl.cy + ell.ly,
      lz: cl.cz + ell.lz,
      density: ell.density * (cl.pillar ? 1.08 : 1.0),
    };
    stretch = cl.pillar ? 0.08 + hashUnit(h, 13) * 0.12 : 0.12 + hashUnit(h, 13) * 0.28;
  }

  const [rx, ry, rz] = rotateGalaxyLocal(local.lx, local.ly, local.lz, cl.tiltX, cl.tiltZ, cl.tiltY ?? 0);
  return {
    lx: rx,
    ly: ry,
    lz: rz,
    density: local.density,
    stretch,
  };
}

/**
 * 暗尘采样：偏向 clump 中心高密度区
 * @returns {{ lx: number, ly: number, lz: number, density: number }}
 */
export function sampleGasDustParticle(h, field) {
  const cl = pickGasClump(h, field);
  const tier = hashUnit(h, 1) * 0.42;
  const shrink = 0.52 + hashUnit(h, 2) * 0.22;
  const ell = sampleEllipsoidVolume(h, cl.rx * shrink, cl.ry * shrink, cl.rz * shrink, tier);
  const [rx, ry, rz] = rotateGalaxyLocal(cl.cx + ell.lx, cl.cy + ell.ly, cl.cz + ell.lz, cl.tiltX, cl.tiltZ, cl.tiltY ?? 0);
  return {
    lx: rx,
    ly: ry,
    lz: rz,
    density: 0.48 + ell.density * 0.52,
  };
}

/** @deprecated 与 sampleCosmicVoid 相同 */
function sampleIntergalactic(h, span) {
  return sampleCosmicVoid(h, span);
}

function buildCosmicRepoAnchors(repos, layout) {
  const sf = Math.min(layout.spreadFactor ?? 1, 1.32);
  const total = Math.max(repos.length, 1);
  const field = buildCosmicLanguageField(layout, total);
  /** @type {Map<string, [number, number, number]>} */
  const repoPosById = new Map();
  const span = field.span;
  const { INTERGALACTIC_RATIO, VOLUME_SCALE } = {
    ...COSMIC_UNIVERSE,
    VOLUME_SCALE: MORPHOLOGY_LAYOUT.VOLUME_SCALE,
  };

  for (const item of repos) {
    const id = item?.id;
    if (!id) continue;

    const h = hashStr(id);
    let x;
    let y;
    let z;

    if (hashUnit(h, 0) < INTERGALACTIC_RATIO) {
      [x, y, z] = sampleCosmicVoid(h, span);
    } else {
      [x, y, z] = sampleCosmicFieldPosition(item, h, field, layout);
    }

    x *= sf;
    y *= sf;
    z *= sf;

    const jitter = span * 0.022 * VOLUME_SCALE;
    x += gauss3(hashSeed(h, 'jx1'), hashSeed(h, 'jx2'), hashSeed(h, 'jx3')) * jitter;
    y += gauss3(hashSeed(h, 'jy1'), hashSeed(h, 'jy2'), hashSeed(h, 'jy3')) * jitter * 0.78;
    z += gauss3(hashSeed(h, 'jz1'), hashSeed(h, 'jz2'), hashSeed(h, 'jz3')) * jitter;

    repoPosById.set(id, [x, y, z]);
  }

  return repoPosById;
}

function topicClusterKey(v, layout) {
  if (!v.topic) return '';
  const lang = layoutLanguageKey(v.item ?? v, layout);
  return `${lang}\0${v.topic}`;
}

/** 按语言+topic 聚合开放星团中心（团心 = 成员仓锚点质心） */
function buildTopicClusterCenters(virtualStars, repoPosById, layout) {
  /** @type {Map<string, { sx: number, sy: number, sz: number, repoN: number }>} */
  const acc = new Map();
  /** @type {Map<string, Set<string>>} */
  const seenRepos = new Map();

  for (const v of virtualStars) {
    if (!v.topic) continue;
    const key = topicClusterKey(v, layout);
    const base = repoPosById.get(v.repoId);
    if (!base) continue;
    if (!acc.has(key)) {
      acc.set(key, { sx: 0, sy: 0, sz: 0, repoN: 0 });
      seenRepos.set(key, new Set());
    }
    const repos = seenRepos.get(key);
    if (repos.has(v.repoId)) continue;
    repos.add(v.repoId);
    const m = acc.get(key);
    m.sx += base[0];
    m.sy += base[1];
    m.sz += base[2];
    m.repoN += 1;
  }

  /** @type {Map<string, [number, number, number, number]>} */
  const centers = new Map();
  for (const [key, m] of acc) {
    if (m.repoN > 0) {
      centers.set(key, [m.sx / m.repoN, m.sy / m.repoN, m.sz / m.repoN, m.repoN]);
    }
  }
  return centers;
}

function openClusterSpread(repoCount, sf) {
  const { CLUSTER_SPREAD_MIN, CLUSTER_SPREAD_MAX, CLUSTER_SPREAD_LOG } = MORPHOLOGY_LAYOUT;
  const logN = Math.log1p(Math.max(repoCount, 1));
  return Math.min(CLUSTER_SPREAD_MAX, CLUSTER_SPREAD_MIN + logN * CLUSTER_SPREAD_LOG) * sf;
}

/** 开放星团成员：三维高斯弥散 + 丝状扰动，锚定所属仓 */
function placeOpenClusterStar(v, repoAnchor, clusterCenter, repoCount, positions, i, sf) {
  const h = hashStr(v.virtualKey);
  const { CLUSTER_WISP, MULTI_TOPIC_SIBLING } = COSMIC_UNIVERSE;
  const spread = openClusterSpread(repoCount, sf);
  const [rax, ray, raz] = repoAnchor;
  const blend = 0.62;
  const ax = clusterCenter[0] * (1 - blend) + rax * blend;
  const ay = clusterCenter[1] * (1 - blend) + ray * blend;
  const az = clusterCenter[2] * (1 - blend) + raz * blend;

  let px = ax + gauss3(hashSeed(h, 'nx1'), hashSeed(h, 'nx2'), hashSeed(h, 'nx3')) * spread;
  let py = ay + gauss3(hashSeed(h, 'ny1'), hashSeed(h, 'ny2'), hashSeed(h, 'ny3')) * spread * 0.62;
  let pz = az + gauss3(hashSeed(h, 'nz1'), hashSeed(h, 'nz2'), hashSeed(h, 'nz3')) * spread;

  const wisp = spread * CLUSTER_WISP;
  const stretch = hashUnit(h, 11) * Math.PI * 2;
  px += Math.cos(stretch) * gauss3(hashSeed(h, 'cx'), hashSeed(h, 'cy'), hashSeed(h, 'cz')) * wisp;
  py += gauss3(hashSeed(h, 'y4'), hashSeed(h, 'y5'), hashSeed(h, 'y6')) * wisp * 0.72;
  pz += Math.sin(stretch) * gauss3(hashSeed(h, 'cz1'), hashSeed(h, 'cz2'), hashSeed(h, 'cz3')) * wisp;

  positions[i * 3] = px;
  positions[i * 3 + 1] = py;
  positions[i * 3 + 2] = pz;
}

/** 场星 / 无 topic 仓：锚点附近小抖动 */
function placeRepoStar(repoAnchor, positions, i, h, sf) {
  const { REPO_JITTER_MIN, REPO_JITTER_MAX } = MORPHOLOGY_LAYOUT;
  const jitter = REPO_JITTER_MIN + hashUnit(h, 7) * (REPO_JITTER_MAX - REPO_JITTER_MIN);
  const s = jitter * sf;
  positions[i * 3] =
    repoAnchor[0] + gauss3(hashSeed(h, 'rx1'), hashSeed(h, 'rx2'), hashSeed(h, 'rx3')) * s;
  positions[i * 3 + 1] =
    repoAnchor[1] + gauss3(hashSeed(h, 'ry1'), hashSeed(h, 'ry2'), hashSeed(h, 'ry3')) * s * 0.55;
  positions[i * 3 + 2] =
    repoAnchor[2] + gauss3(hashSeed(h, 'rz1'), hashSeed(h, 'rz2'), hashSeed(h, 'rz3')) * s;
}

/** 同仓多 topic：聚星极近距偏移 */
function applyMultiTopicSibling(v, repoAnchor, topicSlot, topicCount, positions, i, sf) {
  if (topicCount <= 1 || !v.topic) return;
  const h = hashStr(v.virtualKey);
  const { MULTI_TOPIC_SIBLING } = COSMIC_UNIVERSE;
  const sibling = sf * MULTI_TOPIC_SIBLING * (0.22 + topicCount * 0.06);
  positions[i * 3] +=
    gauss3(hashSeed(h, 'st1'), hashSeed(h, 'st2'), hashSeed(h, 'st3')) * sibling + topicSlot * sibling * 0.08;
  positions[i * 3 + 1] +=
    gauss3(hashSeed(h, 'st4'), hashSeed(h, 'st5'), hashSeed(h, 'st6')) * sibling * 0.45;
  positions[i * 3 + 2] +=
    gauss3(hashSeed(h, 'st7'), hashSeed(h, 'st8'), hashSeed(h, 'st9')) * sibling;
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
 * 宇宙布局：多星系 + 开放星团 + 场星
 */
export function buildMorphologicalVirtualPositions(repos, virtualStars, layout, ringKeys) {
  const n = virtualStars?.length ?? 0;
  const positions = new Float32Array(n * 3);
  if (!n) return positions;

  const repoPosById = buildCosmicRepoAnchors(repos, layout);
  const clusterCenters = buildTopicClusterCenters(virtualStars, repoPosById, layout);

  /** @type {Map<string, number>} */
  const repoTopicCounts = new Map();
  for (const v of virtualStars) {
    if (!v.topic) continue;
    repoTopicCounts.set(v.repoId, (repoTopicCounts.get(v.repoId) || 0) + 1);
  }

  const { DUST_RATIO } = MORPHOLOGY_LAYOUT;
  const sf = layout.spreadFactor ?? 1;
  /** @type {Map<string, number>} */
  const repoTopicSlot = new Map();

  for (let i = 0; i < n; i += 1) {
    const v = virtualStars[i];
    const repoAnchor = repoPosById.get(v.repoId) ?? [0, 0, 0];
    const h = hashStr(v.virtualKey);
    const clusterKey = topicClusterKey(v, layout);
    const cluster = clusterKey ? clusterCenters.get(clusterKey) : null;

    if (hashUnit(h, 20) < DUST_RATIO) {
      placeDustStar(repoAnchor, openClusterSpread(cluster?.[3] ?? 1, sf), positions, i, h);
    } else if (cluster && v.topic) {
      placeOpenClusterStar(v, repoAnchor, cluster, cluster[3], positions, i, sf);
    } else {
      placeRepoStar(repoAnchor, positions, i, h, sf);
    }

    const topicCount = repoTopicCounts.get(v.repoId) || 1;
    if (topicCount > 1 && v.topic) {
      let slot = repoTopicSlot.get(v.repoId) ?? 0;
      repoTopicSlot.set(v.repoId, slot + 1);
      applyMultiTopicSibling(v, repoAnchor, slot, topicCount, positions, i, sf);
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

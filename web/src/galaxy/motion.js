import { COSMIC_UNIVERSE, GALAXY_MOTION } from './constants.js';
import { hashStr, hashUnit } from './hash.js';
import { buildLanguageGalaxyHubs } from './morphological-layout.js';
import { topicRingKey, virtualLanguageKey } from './virtual-stars.js';

function motionSign(key) {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  return h % 2 === 0 ? 1 : -1;
}

function xzRadius(x, z) {
  return Math.sqrt(x * x + z * z);
}

function rotateY(x, y, z, ang) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return [c * x + s * z, y, -s * x + c * z];
}

/** 绕 Y 倾斜轴旋转（用于层间不同倾角） */
function rotateTiltedY(x, y, z, ang, tilt) {
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const y1 = y * ct - z * st;
  const z1 = y * st + z * ct;
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const x2 = c * x + s * z1;
  const z2 = -s * x + c * z1;
  const y2 = y1 * ct + z2 * st;
  const z3 = -y1 * st + z2 * ct;
  return [x2, y2, z3];
}

function virtualTopicKey(v, layout) {
  const lang = virtualLanguageKey(v, layout);
  const topic = v.topic || '__none__';
  return `${lang}\0${topic}`;
}

function isIntergalacticRepo(repoId) {
  return hashUnit(hashStr(repoId), 0) < COSMIC_UNIVERSE.INTERGALACTIC_RATIO;
}

/**
 * 运动字段：宇宙漂移 + 星系差动自转 + 星团微自转（无嵌套公转）
 */
export function buildMotionFields(
  list,
  positions,
  count,
  layout,
  ringKeys = new Set(),
  langHubOverrides = null
) {
  const rawHubs = buildLanguageGalaxyHubs(layout);
  const span = 72;

  /** @type {Map<string, { cx: number, cy: number, cz: number, count: number }>} */
  const topicMeta = new Map();
  /** @type {Map<string, { cx: number, cy: number, cz: number, count: number }>} */
  const repoMeta = new Map();

  for (let i = 0; i < count; i += 1) {
    const v = list[i];
    const topicKey = virtualTopicKey(v, layout);
    if (!topicMeta.has(topicKey)) topicMeta.set(topicKey, { cx: 0, cy: 0, cz: 0, count: 0 });
    const tm = topicMeta.get(topicKey);
    tm.cx += positions[i * 3];
    tm.cy += positions[i * 3 + 1];
    tm.cz += positions[i * 3 + 2];
    tm.count += 1;

    if (!repoMeta.has(v.repoId)) repoMeta.set(v.repoId, { cx: 0, cy: 0, cz: 0, count: 0 });
    const rm = repoMeta.get(v.repoId);
    rm.cx += positions[i * 3];
    rm.cy += positions[i * 3 + 1];
    rm.cz += positions[i * 3 + 2];
    rm.count += 1;
  }

  let maxTopicCount = 1;
  for (const meta of topicMeta.values()) {
    maxTopicCount = Math.max(maxTopicCount, meta.count);
    const inv = 1 / meta.count;
    meta.cx *= inv;
    meta.cy *= inv;
    meta.cz *= inv;
  }
  for (const meta of repoMeta.values()) {
    const inv = 1 / meta.count;
    meta.cx *= inv;
    meta.cy *= inv;
    meta.cz *= inv;
  }

  const galaxyHubs = new Float32Array(count * 3);
  const nebulaCenters = new Float32Array(count * 3);
  const motionOmega = new Float32Array(count * 4);
  const motionOmega2 = new Float32Array(count * 4);
  const yBobAmp = new Float32Array(count);
  const yBobPhase = new Float32Array(count);

  const {
    SPEED_SCALE,
    HUB_ORBIT_BASE,
    HUB_ORBIT_SPREAD,
    GALAXY_SPIN_BASE,
    GALAXY_SPIN_SPREAD,
    GALAXY_ORBIT_BASE,
    GALAXY_ORBIT_SPREAD,
    CLUSTER_SPIN_BASE,
    CLUSTER_SPIN_SPREAD,
    CLUSTER_ORBIT_BASE,
    CLUSTER_ORBIT_SPREAD,
    TOPIC_MIN_COUNT,
    STAR_SPIN_BASE,
    STAR_SPIN_SPREAD,
    STAR_ORBIT_BASE,
    STAR_ORBIT_SPREAD,
    STAR_BOB_BASE,
    STAR_BOB_SPREAD,
    FIELD_UNIVERSE_MULT,
    FIELD_GALAXY_MULT,
  } = GALAXY_MOTION;
  const motionScale = SPEED_SCALE ?? 1;

  for (let i = 0; i < count; i += 1) {
    const v = list[i];
    const lang = virtualLanguageKey(v, layout);
    const topicKey = virtualTopicKey(v, layout);
    const ringKey = v.topic ? topicRingKey(lang, v.topic) : '';
    const hStar = hashStr(v.virtualKey);
    const hLang = hashStr(`cosmic-motion:${lang}`);
    const hTopic = hashStr(`cluster-motion:${topicKey}`);
    const hRepo = hashStr(`repo-motion:${v.repoId}`);

    const px = positions[i * 3];
    const py = positions[i * 3 + 1];
    const pz = positions[i * 3 + 2];
    const starR = xzRadius(px, pz);
    const starSign = motionSign(v.virtualKey) * (hashUnit(hStar, 3) > 0.5 ? 1 : -1);
    const langSign = motionSign(lang) * (hashUnit(hLang, 4) > 0.5 ? 1 : -1);
    const topicSign = motionSign(topicKey) * starSign;

    const hub = langHubOverrides?.get(lang) ?? rawHubs.get(lang) ?? [0, 0, 0];
    const intergalactic = isIntergalacticRepo(v.repoId);

    galaxyHubs[i * 3] = intergalactic ? px * 0.15 : hub[0];
    galaxyHubs[i * 3 + 1] = intergalactic ? py * 0.15 : hub[1];
    galaxyHubs[i * 3 + 2] = intergalactic ? pz * 0.15 : hub[2];

    const tm = topicMeta.get(topicKey);
    const rm = repoMeta.get(v.repoId);
    const topicCount = tm?.count ?? 1;
    const useTopicCluster = v.topic && topicCount >= TOPIC_MIN_COUNT && tm;

    if (useTopicCluster) {
      nebulaCenters[i * 3] = tm.cx;
      nebulaCenters[i * 3 + 1] = tm.cy;
      nebulaCenters[i * 3 + 2] = tm.cz;
    } else if (rm) {
      nebulaCenters[i * 3] = rm.cx;
      nebulaCenters[i * 3 + 1] = rm.cy;
      nebulaCenters[i * 3 + 2] = rm.cz;
    } else {
      nebulaCenters[i * 3] = px;
      nebulaCenters[i * 3 + 1] = py;
      nebulaCenters[i * 3 + 2] = pz;
    }

    const hubDist = Math.hypot(hub[0], hub[2]);
    const hubFactor = 18 / Math.pow(Math.max(hubDist, span * 0.12), 0.55);
    const rFactor = Math.min(2.8, 16 / Math.pow(Math.max(starR, 6), 0.72));
    const langGalaxySpin =
      langSign *
      GALAXY_SPIN_BASE *
      (0.42 + hashUnit(hLang, 2) * GALAXY_SPIN_SPREAD) *
      (14 / Math.max(hubDist, 5.5));
    const langGalaxyOrbit =
      langSign * GALAXY_ORBIT_BASE * (0.4 + hashUnit(hLang, 5) * GALAXY_ORBIT_SPREAD);

    const universeMult = intergalactic ? FIELD_UNIVERSE_MULT : 1;
    const galaxyMult = intergalactic ? FIELD_GALAXY_MULT : 1;

    const universeOrbit =
      langSign *
      HUB_ORBIT_BASE *
      hubFactor *
      (0.45 + hashUnit(hLang, 1) * HUB_ORBIT_SPREAD) *
      universeMult;
    const galaxySpin = langGalaxySpin * galaxyMult;
    const clusterSpin =
      useTopicCluster
        ? topicSign *
          CLUSTER_SPIN_BASE *
          (0.35 +
            hashUnit(hTopic, 1) * CLUSTER_SPIN_SPREAD *
            (0.45 +
              ((topicCount - TOPIC_MIN_COUNT) / Math.max(maxTopicCount - TOPIC_MIN_COUNT, 1)) * 0.75))
        : 0;
    const starSpin = 0;

    motionOmega[i * 4] = universeOrbit * motionScale;
    motionOmega[i * 4 + 1] = galaxySpin * motionScale;
    motionOmega[i * 4 + 2] = clusterSpin * motionScale;
    motionOmega[i * 4 + 3] = starSpin * motionScale;

    const galaxyOrbit = langGalaxyOrbit * galaxyMult;
    const clusterOrbit =
      topicSign * CLUSTER_ORBIT_BASE * (0.28 + hashUnit(hTopic, 3) * CLUSTER_ORBIT_SPREAD);
    const starOrbit = 0;
    const tiltMix = hashUnit(hRepo, 6) * Math.PI * 2;

    motionOmega2[i * 4] = galaxyOrbit * motionScale;
    motionOmega2[i * 4 + 1] = clusterOrbit * motionScale;
    motionOmega2[i * 4 + 2] = starOrbit * motionScale;
    motionOmega2[i * 4 + 3] = tiltMix;

    yBobAmp[i] = (STAR_BOB_BASE + hashUnit(hStar, 12) * STAR_BOB_SPREAD) * motionScale;
    yBobPhase[i] = hashUnit(hStar, 11) * Math.PI * 2;
  }

  return {
    galaxyHubs,
    nebulaCenters,
    motionOmega,
    motionOmega2,
    yBobAmp,
    yBobPhase,
  };
}

function applyHierarchicalMotion(rx, ry, rz, fields, i, time) {
  const {
    galaxyHubs,
    nebulaCenters,
    motionOmega,
    motionOmega2,
    yBobAmp,
    yBobPhase,
  } = fields;

  const hubX = galaxyHubs[i * 3];
  const hubY = galaxyHubs[i * 3 + 1];
  const hubZ = galaxyHubs[i * 3 + 2];
  const nebX = nebulaCenters[i * 3];
  const nebY = nebulaCenters[i * 3 + 1];
  const nebZ = nebulaCenters[i * 3 + 2];

  const universeOrbit = motionOmega[i * 4];
  const galaxySpin = motionOmega[i * 4 + 1];
  const clusterSpin = motionOmega[i * 4 + 2];

  const galaxyOrbit = motionOmega2[i * 4];
  const clusterOrbit = motionOmega2[i * 4 + 1];
  const tiltMix = motionOmega2[i * 4 + 3];

  const galTilt = tiltMix * 0.12;
  const clusterTilt = (hashUnit(hashStr(`cl-tilt:${i}`), 0) - 0.5) * 0.12;

  let x = rx;
  let y = ry;
  let z = rz;

  if (clusterSpin !== 0 || clusterOrbit !== 0) {
    let relCx = x - nebX;
    let relCy = y - nebY;
    let relCz = z - nebZ;
    [relCx, relCy, relCz] = rotateTiltedY(relCx, relCy, relCz, time * clusterSpin, clusterTilt);
    if (clusterOrbit !== 0) {
      [relCx, relCy, relCz] = rotateY(relCx, relCy, relCz, time * clusterOrbit);
    }
    x = nebX + relCx;
    y = nebY + relCy;
    z = nebZ + relCz;
  }

  let relGx = x - hubX;
  let relGy = y - hubY;
  let relGz = z - hubZ;
  const galR = Math.max(xzRadius(relGx, relGz), 6);
  const diffSpin = galaxySpin * (1.15 / Math.pow(galR, 0.38));
  [relGx, relGy, relGz] = rotateTiltedY(relGx, relGy, relGz, time * diffSpin, galTilt);
  if (galaxyOrbit !== 0) {
    [relGx, relGy, relGz] = rotateY(relGx, relGy, relGz, time * galaxyOrbit);
  }
  x = hubX + relGx;
  y = hubY + relGy + Math.sin(time * diffSpin * 0.6 + yBobPhase[i]) * yBobAmp[i];
  z = hubZ + relGz;

  [x, y, z] = rotateY(x, y, z, time * universeOrbit);

  return [x, y, z];
}

export function motionWorldPosition(rx, ry, rz, fields, i, time) {
  return applyHierarchicalMotion(rx, ry, rz, fields, i, time);
}

export const GALAXY_MOTION_GLSL = `
attribute vec3 aGalaxyHub;
attribute vec3 aNebulaCenter;
attribute vec4 aMotionOmega;
attribute vec4 aMotionOmega2;
attribute vec2 aMotionBob;

vec3 rotateGalaxyY(vec3 p, float ang) {
  float c = cos(ang);
  float s = sin(ang);
  return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

vec3 rotateTiltedGalaxyY(vec3 p, float ang, float tilt) {
  float ct = cos(tilt);
  float st = sin(tilt);
  float y1 = p.y * ct - p.z * st;
  float z1 = p.y * st + p.z * ct;
  float c = cos(ang);
  float s = sin(ang);
  float x2 = c * p.x + s * z1;
  float z2 = -s * p.x + c * z1;
  float y2 = y1 * ct + z2 * st;
  float z3 = -y1 * st + z2 * ct;
  return vec3(x2, y2, z3);
}

vec3 applyGalaxyMotion(vec3 rest) {
  float universeOrbit = uMotionTime * aMotionOmega.x;
  float galaxySpin = uMotionTime * aMotionOmega.y;
  float clusterSpin = uMotionTime * aMotionOmega.z;

  float galaxyOrbit = uMotionTime * aMotionOmega2.x;
  float clusterOrbit = uMotionTime * aMotionOmega2.y;
  float tiltMix = aMotionOmega2.w;

  float galTilt = tiltMix * 0.12;
  float clusterTilt = sin(tiltMix * 2.17) * 0.12;

  vec3 hub = aGalaxyHub;
  vec3 clusterC = aNebulaCenter;
  vec3 pos = rest;

  if (abs(clusterSpin) > 0.0001 || abs(clusterOrbit) > 0.0001) {
    vec3 relC = pos - clusterC;
    relC = rotateTiltedGalaxyY(relC, clusterSpin, clusterTilt);
    if (abs(clusterOrbit) > 0.0001) {
      relC = rotateGalaxyY(relC, clusterOrbit);
    }
    pos = clusterC + relC;
  }

  vec3 relG = pos - hub;
  float galR = max(length(relG.xz), 6.0);
  float diffSpin = galaxySpin * (1.15 / pow(galR, 0.38));
  relG = rotateTiltedGalaxyY(relG, diffSpin, galTilt);
  if (abs(galaxyOrbit) > 0.0001) {
    relG = rotateGalaxyY(relG, galaxyOrbit);
  }
  pos = hub + relG;
  pos.y += sin(diffSpin * 0.6 + aMotionBob.y) * aMotionBob.x;

  pos = rotateGalaxyY(pos, universeOrbit);
  return pos;
}
`;

/** 星系气体云：仅宇宙公转 + 绕 hub 的星系自转/轨道 */
export const GALAXY_HUB_MOTION_GLSL = `
vec3 rotateGalaxyY(vec3 p, float ang) {
  float c = cos(ang);
  float s = sin(ang);
  return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

vec3 rotateTiltedGalaxyY(vec3 p, float ang, float tilt) {
  float ct = cos(tilt);
  float st = sin(tilt);
  float y1 = p.y * ct - p.z * st;
  float z1 = p.y * st + p.z * ct;
  float c = cos(ang);
  float s = sin(ang);
  float x2 = c * p.x + s * z1;
  float z2 = -s * p.x + c * z1;
  float y2 = y1 * ct + z2 * st;
  float z3 = -y1 * st + z2 * ct;
  return vec3(x2, y2, z3);
}

vec3 applyGalaxyHubMotion(vec3 rest) {
  float universeOrbit = uMotionTime * aMotionOmega.x;
  float galaxySpin = uMotionTime * aMotionOmega.y;
  float galaxyOrbit = uMotionTime * aMotionOmega2.x;
  float tiltMix = aMotionOmega2.w;
  float galTilt = tiltMix * 0.18;

  vec3 hub = aGalaxyHub;
  vec3 relG = rest - hub;
  relG = rotateTiltedGalaxyY(relG, galaxySpin, galTilt);
  relG = rotateGalaxyY(relG, galaxyOrbit);
  vec3 pos = hub + relG;
  pos = rotateGalaxyY(pos, universeOrbit);
  return pos;
}
`;

/**
 * 将布局 hub 经 harmonize 变换到与星点一致的坐标系
 */
export function buildHarmonizedRawLanguageHubs(layout, harmonizeMeta) {
  if (!harmonizeMeta) return null;
  const rawHubs = buildLanguageGalaxyHubs(layout);
  const { cx, cy, cz, scale, yFlatten } = harmonizeMeta;
  /** @type {Map<string, [number, number, number]>} */
  const hubs = new Map();
  for (const [lang, hub] of rawHubs) {
    hubs.set(lang, [
      (hub[0] - cx) * scale,
      (hub[1] - cy) * scale * yFlatten,
      (hub[2] - cz) * scale,
    ]);
  }
  return hubs;
}

/** 与 applyGalaxyHubMotion 一致的 JS 实现（气体云每帧摆位） */
export function applyGalaxyHubMotionJs(x, y, z, hub, motionOmega, motionOmega2, time) {
  const universeOrbit = time * motionOmega[0];
  const galaxySpin = time * motionOmega[1];
  const galaxyOrbit = time * motionOmega2[0];
  const tiltMix = motionOmega2[3];
  const galTilt = tiltMix * 0.18;

  let relGx = x - hub[0];
  let relGy = y - hub[1];
  let relGz = z - hub[2];
  [relGx, relGy, relGz] = rotateTiltedY(relGx, relGy, relGz, galaxySpin, galTilt);
  [relGx, relGy, relGz] = rotateY(relGx, relGy, relGz, galaxyOrbit);
  let px = hub[0] + relGx;
  let py = hub[1] + relGy;
  let pz = hub[2] + relGz;
  [px, py, pz] = rotateY(px, py, pz, universeOrbit);
  return [px, py, pz];
}

/**
 * 从已 harmonize 的星点坐标求各语言星系质心（运动 hub）
 */
export function buildHarmonizedLanguageHubs(layout, virtualStars, positions, count) {
  /** @type {Map<string, { cx: number, cy: number, cz: number, n: number }>} */
  const acc = new Map();
  for (let i = 0; i < count; i += 1) {
    const lang = virtualLanguageKey(virtualStars[i], layout);
    if (!acc.has(lang)) acc.set(lang, { cx: 0, cy: 0, cz: 0, n: 0 });
    const m = acc.get(lang);
    m.cx += positions[i * 3];
    m.cy += positions[i * 3 + 1];
    m.cz += positions[i * 3 + 2];
    m.n += 1;
  }
  /** @type {Map<string, [number, number, number]>} */
  const hubs = new Map();
  for (const [lang, m] of acc) {
    const inv = 1 / m.n;
    hubs.set(lang, [m.cx * inv, m.cy * inv, m.cz * inv]);
  }
  return hubs;
}

/** 单语言星系的宇宙公转 + 自转参数（与星点星系层一致） */
export function buildLanguageHubMotion(layout, lang, hub) {
  const hLang = hashStr(`cosmic-motion:${lang}`);
  const langSign = motionSign(lang) * (hashUnit(hLang, 4) > 0.5 ? 1 : -1);
  const hubDist = Math.hypot(hub[0], hub[2]);
  const span = 72;
  const hubFactor = 18 / Math.pow(Math.max(hubDist, span * 0.12), 0.55);
  const {
    SPEED_SCALE,
    HUB_ORBIT_BASE,
    HUB_ORBIT_SPREAD,
    GALAXY_SPIN_BASE,
    GALAXY_SPIN_SPREAD,
    GALAXY_ORBIT_BASE,
    GALAXY_ORBIT_SPREAD,
  } = GALAXY_MOTION;
  const motionScale = SPEED_SCALE ?? 1;

  const universeOrbit =
    langSign * HUB_ORBIT_BASE * hubFactor * (0.45 + hashUnit(hLang, 1) * HUB_ORBIT_SPREAD) * motionScale;
  const galaxySpin =
    langSign *
    GALAXY_SPIN_BASE *
    (0.42 + hashUnit(hLang, 2) * GALAXY_SPIN_SPREAD) *
    (14 / Math.max(hubDist, 5.5)) *
    motionScale;
  const galaxyOrbit =
    langSign * GALAXY_ORBIT_BASE * (0.4 + hashUnit(hLang, 5) * GALAXY_ORBIT_SPREAD) * motionScale;
  const tiltMix = hashUnit(hLang, 6) * Math.PI * 2;

  return { universeOrbit, galaxySpin, galaxyOrbit, tiltMix };
}

/** 为气体云粒子填充星系级运动字段 */
export function fillGasMotionFields(gasBuffers, layout, harmonizedHubs) {
  if (!gasBuffers?.count) return;
  const langs = gasBuffers.languages || [];
  const perGalaxy = gasBuffers.perGalaxy ?? COSMIC_UNIVERSE.GAS_PARTICLES_PER_GALAXY;
  const corePerGalaxy = gasBuffers.corePerGalaxy ?? COSMIC_UNIVERSE.GAS_CORE_FILL_COUNT ?? 0;
  const particlesPerLayer = perGalaxy + corePerGalaxy;
  const count = gasBuffers.count;
  const galaxyHubs = new Float32Array(count * 3);
  const motionOmega = new Float32Array(count * 4);
  const motionOmega2 = new Float32Array(count * 4);

  let o = 0;
  for (const lang of langs) {
    const hub = harmonizedHubs.get(lang) ?? [0, 0, 0];
    const m = buildLanguageHubMotion(layout, lang, hub);
    for (let j = 0; j < particlesPerLayer; j += 1) {
      galaxyHubs[o * 3] = hub[0];
      galaxyHubs[o * 3 + 1] = hub[1];
      galaxyHubs[o * 3 + 2] = hub[2];
      motionOmega[o * 4] = m.universeOrbit;
      motionOmega[o * 4 + 1] = m.galaxySpin;
      motionOmega[o * 4 + 2] = 0;
      motionOmega[o * 4 + 3] = 0;
      motionOmega2[o * 4] = m.galaxyOrbit;
      motionOmega2[o * 4 + 1] = 0;
      motionOmega2[o * 4 + 2] = 0;
      motionOmega2[o * 4 + 3] = m.tiltMix;
      o += 1;
    }
  }

  gasBuffers.galaxyHubs = galaxyHubs;
  gasBuffers.motionOmega = motionOmega;
  gasBuffers.motionOmega2 = motionOmega2;
  gasBuffers.languages = [...langs];
  gasBuffers.perGalaxy = perGalaxy;
  gasBuffers.corePerGalaxy = corePerGalaxy;
  gasBuffers.langMotions = langs.map((lang) => {
    const hub = harmonizedHubs.get(lang) ?? [0, 0, 0];
    const m = buildLanguageHubMotion(layout, lang, hub);
    return {
      hub,
      omega: [m.universeOrbit, m.galaxySpin, 0, 0],
      omega2: [m.galaxyOrbit, 0, 0, m.tiltMix],
    };
  });
}

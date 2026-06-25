import { GALAXY_MOTION } from './constants';

function layoutLanguageKey(item, layout) {
  const lang = item.language || '其他';
  if (!layout?.langKeys) return lang;
  return layout.langKeys.has(lang) ? lang : '其他';
}

function primaryTopic(item) {
  const topics = Array.isArray(item?.topics) ? item.topics : [];
  if (!topics.length) return '';
  return String(topics[0]).toLowerCase();
}

/** 语言 / topic 运动方向：相邻团反向，便于看出差速 */
function motionSign(key) {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  return h % 2 === 0 ? 1 : -1;
}

/**
 * @param {number} x
 * @param {number} z
 */
function xzRadius(x, z) {
  return Math.sqrt(x * x + z * z);
}

/**
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} ang
 * @returns {[number, number, number]}
 */
function rotateY(x, y, z, ang) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return [c * x + s * z, y, -s * x + c * z];
}

/**
 * 统计语言 / topic 聚团质心，并生成 per-star 运动属性
 * @param {Array<object>} list
 * @param {Float32Array} positions 已质心归零后的坐标
 * @param {number} count
 * @param {ReturnType<typeof import('./positions.js').buildLanguageLayout> | null} layout
 */
export function buildMotionFields(list, positions, count, layout) {
  const langGroups = new Map();
  const topicGroups = new Map();

  for (let i = 0; i < count; i += 1) {
    const item = list[i];
    const lang = layout ? layoutLanguageKey(item, layout) : item.language || '其他';
    const topic = primaryTopic(item) || '__none__';
    const topicKey = `${lang}\0${topic}`;

    if (!langGroups.has(lang)) langGroups.set(lang, []);
    langGroups.get(lang).push(i);

    if (!topicGroups.has(topicKey)) topicGroups.set(topicKey, []);
    topicGroups.get(topicKey).push(i);
  }

  /** @type {Map<string, { cx: number, cy: number, cz: number, count: number }>} */
  const langMeta = new Map();
  for (const [lang, indices] of langGroups) {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const i of indices) {
      cx += positions[i * 3];
      cy += positions[i * 3 + 1];
      cz += positions[i * 3 + 2];
    }
    const inv = 1 / indices.length;
    langMeta.set(lang, { cx: cx * inv, cy: cy * inv, cz: cz * inv, count: indices.length });
  }

  let maxLangCount = 1;
  for (const meta of langMeta.values()) {
    maxLangCount = Math.max(maxLangCount, meta.count);
  }

  /** @type {Map<string, { cx: number, cy: number, cz: number, count: number }>} */
  const topicMeta = new Map();
  for (const [key, indices] of topicGroups) {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const i of indices) {
      cx += positions[i * 3];
      cy += positions[i * 3 + 1];
      cz += positions[i * 3 + 2];
    }
    const inv = 1 / indices.length;
    topicMeta.set(key, { cx: cx * inv, cy: cy * inv, cz: cz * inv, count: indices.length });
  }

  let maxTopicCount = 1;
  for (const meta of topicMeta.values()) {
    maxTopicCount = Math.max(maxTopicCount, meta.count);
  }

  const langCenters = new Float32Array(count * 3);
  const topicCenters = new Float32Array(count * 3);
  const langOrbitOmega = new Float32Array(count);
  const langSpinOmega = new Float32Array(count);
  const topicActive = new Float32Array(count);
  const topicSpinOmega = new Float32Array(count);

  const {
    LANG_ORBIT_BASE,
    LANG_SPIN_BASE,
    LANG_SPIN_MIN,
    LANG_SPIN_MAX,
    TOPIC_MIN_COUNT,
    TOPIC_SPIN_BASE,
    TOPIC_SPIN_MIN,
    TOPIC_SPIN_MAX,
  } = GALAXY_MOTION;

  for (let i = 0; i < count; i += 1) {
    const item = list[i];
    const lang = layout ? layoutLanguageKey(item, layout) : item.language || '其他';
    const topic = primaryTopic(item) || '__none__';
    const topicKey = `${lang}\0${topic}`;

    const lm = langMeta.get(lang);
    const tm = topicMeta.get(topicKey);
    const langCount = lm?.count ?? 1;
    const topicCount = tm?.count ?? 1;

    langCenters[i * 3] = lm?.cx ?? positions[i * 3];
    langCenters[i * 3 + 1] = lm?.cy ?? positions[i * 3 + 1];
    langCenters[i * 3 + 2] = lm?.cz ?? positions[i * 3 + 2];

    const useTopic = topicCount >= TOPIC_MIN_COUNT && topic !== '__none__';
    if (useTopic && tm) {
      topicCenters[i * 3] = tm.cx;
      topicCenters[i * 3 + 1] = tm.cy;
      topicCenters[i * 3 + 2] = tm.cz;
      topicActive[i] = 1;
    } else {
      topicCenters[i * 3] = langCenters[i * 3];
      topicCenters[i * 3 + 1] = langCenters[i * 3 + 1];
      topicCenters[i * 3 + 2] = langCenters[i * 3 + 2];
      topicActive[i] = 0;
      topicSpinOmega[i] = 0;
    }

    const langR = xzRadius(lm?.cx ?? 0, lm?.cz ?? 0);
    const langSign = motionSign(lang);
    langOrbitOmega[i] = langSign * LANG_ORBIT_BASE * (32 / Math.max(langR, 14));

    const lShare = (langCount - 1) / Math.max(maxLangCount - 1, 1);
    langSpinOmega[i] =
      langSign * LANG_SPIN_BASE * (LANG_SPIN_MIN + lShare * (LANG_SPIN_MAX - LANG_SPIN_MIN));

    if (useTopic && tm) {
      const tShare = (topicCount - TOPIC_MIN_COUNT) / Math.max(maxTopicCount - TOPIC_MIN_COUNT, 1);
      const topicSign = motionSign(topicKey) * langSign;
      topicSpinOmega[i] =
        topicSign *
        TOPIC_SPIN_BASE *
        (TOPIC_SPIN_MIN + tShare * (TOPIC_SPIN_MAX - TOPIC_SPIN_MIN));
    }
  }

  return {
    langCenters,
    topicCenters,
    langOrbitOmega,
    langSpinOmega,
    topicActive,
    topicSpinOmega,
  };
}

/**
 * 刚体绕 Y 轴旋转偏移向量（保持团形）
 * @param {number} ox
 * @param {number} oy
 * @param {number} oz
 * @param {number} ang
 */
function rotateOffsetY(ox, oy, oz, ang) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return [c * ox + s * oz, oy, -s * ox + c * oz];
}

/**
 * CPU 端与 shader 一致的世界坐标（用于拾取）
 */
export function motionWorldPosition(rx, ry, rz, fields, i, time) {
  const {
    langCenters,
    topicCenters,
    langOrbitOmega,
    langSpinOmega,
    topicActive,
    topicSpinOmega,
  } = fields;

  const langCx = langCenters[i * 3];
  const langCy = langCenters[i * 3 + 1];
  const langCz = langCenters[i * 3 + 2];
  const topicCx = topicCenters[i * 3];
  const topicCy = topicCenters[i * 3 + 1];
  const topicCz = topicCenters[i * 3 + 2];

  const langOrbit = time * langOrbitOmega[i];
  const langSpin = time * langSpinOmega[i];

  const [langCxR, langCyR, langCzR] = rotateY(langCx, langCy, langCz, langOrbit);

  const relLx = rx - langCx;
  const relLy = ry - langCy;
  const relLz = rz - langCz;
  const [spinLx, spinLy, spinLz] = rotateOffsetY(relLx, relLy, relLz, langSpin);
  let px = langCxR + spinLx;
  let py = langCyR + spinLy;
  let pz = langCzR + spinLz;

  if (topicActive[i] < 0.5) {
    return [px, py, pz];
  }

  const relTopicCx = topicCx - langCx;
  const relTopicCy = topicCy - langCy;
  const relTopicCz = topicCz - langCz;
  const [orbitTx, orbitTy, orbitTz] = rotateOffsetY(relTopicCx, relTopicCy, relTopicCz, langSpin);
  const orbitTopicCx = langCxR + orbitTx;
  const orbitTopicCy = langCyR + orbitTy;
  const orbitTopicCz = langCzR + orbitTz;

  const relStarX = rx - topicCx;
  const relStarY = ry - topicCy;
  const relStarZ = rz - topicCz;
  const topicSpin = time * topicSpinOmega[i];
  const [spinTx, spinTy, spinTz] = rotateOffsetY(relStarX, relStarY, relStarZ, topicSpin);

  return [orbitTopicCx + spinTx, orbitTopicCy + spinTy, orbitTopicCz + spinTz];
}

/** GLSL：语言团公转 + 自转，topic 子盘自转（与 motionWorldPosition 一致） */
export const GALAXY_MOTION_GLSL = `
attribute vec3 aLangCenter;
attribute vec3 aTopicCenter;
attribute float aLangOrbitOmega;
attribute float aLangSpinOmega;
attribute float aTopicActive;
attribute float aTopicSpinOmega;

vec3 rotateGalaxyY(vec3 p, float ang) {
  float c = cos(ang);
  float s = sin(ang);
  return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

vec3 applyGalaxyMotion(vec3 rest) {
  vec3 langC = aLangCenter;
  vec3 topicC = aTopicCenter;
  float langOrbit = uMotionTime * aLangOrbitOmega;
  float langSpin = uMotionTime * aLangSpinOmega;

  vec3 langCR = rotateGalaxyY(langC, langOrbit);
  vec3 relL = rest - langC;
  vec3 spinL = rotateGalaxyY(relL, langSpin);
  vec3 pos = langCR + spinL;

  if (aTopicActive < 0.5) {
    return pos;
  }

  vec3 relTopicC = topicC - langC;
  vec3 orbitT = rotateGalaxyY(relTopicC, langSpin);
  vec3 orbitTopicC = langCR + orbitT;

  vec3 relStar = rest - topicC;
  float topicSpin = uMotionTime * aTopicSpinOmega;
  vec3 spinT = rotateGalaxyY(relStar, topicSpin);
  return orbitTopicC + spinT;
}
`;

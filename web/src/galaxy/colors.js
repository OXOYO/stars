import { langColor } from '../utils/lang-colors.js';

/** @param {string} hex */
export function hexToRgb(hex) {
  const raw = String(hex || '#6e7681').replace('#', '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw.padEnd(6, '0').slice(0, 6);
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** @param {string | null | undefined} language */
export function repoLangRgb(language) {
  const hex = langColor(language || '其他');
  const [r, g, b] = hexToRgb(hex);
  return [r / 255, g / 255, b / 255];
}

/**
 * 综合影响力 → 近似恒星色温（红 → 黄 → 蓝白）
 * @param {number} influence 0~1
 * @param {number} [hashJitter] 小幅随机扰动
 * @returns {[number, number, number]}
 */
export function stellarTempRgb(influence, hashJitter = 0) {
  const t = Math.max(0, Math.min(1, influence * 0.92 + hashJitter));
  const warm = 1 - t;
  const r = 0.55 + warm * 0.42 + t * 0.22;
  const g = 0.38 + warm * 0.32 + t * 0.58;
  const b = 0.28 + warm * 0.08 + t * 0.82;
  const len = Math.hypot(r, g, b) || 1;
  return [r / len, g / len, b / len];
}

/** @param {[number, number, number]} rgb @param {number} [amount] */
function boostSaturation(rgb, amount = 1.42) {
  const lum = (rgb[0] + rgb[1] + rgb[2]) / 3;
  return [
    Math.min(1, lum + (rgb[0] - lum) * amount),
    Math.min(1, lum + (rgb[1] - lum) * amount),
    Math.min(1, lum + (rgb[2] - lum) * amount),
  ];
}

/**
 * 语言色为主、恒星色温作少量物理 accent
 * @param {[number, number, number]} langRgb
 * @param {[number, number, number]} stellarRgb
 * @param {number} [langMix] 语言色占比
 */
export function blendCosmicColor(langRgb, stellarRgb, langMix = 0.2) {
  const m = Math.max(0, Math.min(0.88, langMix));
  const lang = boostSaturation(langRgb);
  return [
    lang[0] * m + stellarRgb[0] * (1 - m),
    lang[1] * m + stellarRgb[1] * (1 - m),
    lang[2] * m + stellarRgb[2] * (1 - m),
  ];
}

/**
 * 星云 tint：语言色作 accent，主色由 shader 内发射线色带驱动
 */
export function nebulaLangTint(langRgb, density = 0.5) {
  const lang = boostSaturation(langRgb, 1.38);
  const d = Math.max(0, Math.min(1, density));
  return [
    Math.min(1, lang[0] * (0.62 + d * 0.38)),
    Math.min(1, lang[1] * (0.62 + d * 0.38)),
    Math.min(1, lang[2] * (0.62 + d * 0.38)),
  ];
}

/** @deprecated 保留别名 */
export function nebulaEmissionRgb(langRgb, density = 0.5, hashUnit = 0.5) {
  void hashUnit;
  return nebulaLangTint(langRgb, density);
}

/** 暗尘柱：深褐为主，保留微量语言色相 */
export function nebulaDustRgb(langRgb, density = 0.5) {
  const d = Math.max(0, Math.min(1, density));
  const deep = [0.035, 0.028, 0.022];
  const dust = [
    0.1 + langRgb[0] * 0.09,
    0.06 + langRgb[1] * 0.05,
    0.045 + langRgb[2] * 0.04,
  ];
  return [
    deep[0] * (1 - d) + dust[0] * d,
    deep[1] * (1 - d) + dust[1] * d,
    deep[2] * (1 - d) + dust[2] * d,
  ];
}

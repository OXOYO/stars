import { langColor } from '../utils/lang-colors';

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

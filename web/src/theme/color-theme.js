export const STARS_COLOR_THEME_KEY = 'stars-color-theme';

/** @typedef {'light' | 'dark' | 'system'} StarsColorThemePreference */

export function readColorThemePreference() {
  try {
    const value = localStorage.getItem(STARS_COLOR_THEME_KEY);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch {
    /* ignore */
  }
  return 'system';
}

export function persistColorThemePreference(preference) {
  try {
    localStorage.setItem(STARS_COLOR_THEME_KEY, preference);
  } catch {
    /* ignore */
  }
}

export function resolveColorTheme(preference = readColorThemePreference()) {
  if (preference === 'light') return 'light';
  if (preference === 'dark') return 'dark';
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

export function applyColorTheme(preference = readColorThemePreference()) {
  if (typeof document === 'undefined') return resolveColorTheme(preference);
  const resolved = resolveColorTheme(preference);
  document.documentElement.dataset.starsTheme = resolved;
  return resolved;
}

export function initColorTheme() {
  return applyColorTheme();
}

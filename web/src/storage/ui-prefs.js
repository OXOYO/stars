export const STARS_UI_PREFS_KEY = 'stars-ui-prefs';

const LEGACY_SIDEBAR_KEY = 'stars-sidebar-collapsed';
const LEGACY_FILTERS_KEY = 'stars-filters';

/** @typedef {{ uiLocale?: string, viewMode?: string, sidebarCollapsed?: boolean, galaxyAreaExpanded?: boolean }} StarsUiPrefs */

function readRawPrefs() {
  try {
    const raw = localStorage.getItem(STARS_UI_PREFS_KEY);
    if (!raw) return {};
    const saved = JSON.parse(raw);
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}

function migrateLegacyPrefs(prefs) {
  if (prefs.sidebarCollapsed == null) {
    try {
      if (sessionStorage.getItem(LEGACY_SIDEBAR_KEY) === '1') {
        prefs.sidebarCollapsed = true;
      }
    } catch {
      /* ignore */
    }
  }

  if (!prefs.uiLocale || !prefs.viewMode) {
    try {
      const raw = sessionStorage.getItem(LEGACY_FILTERS_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (!prefs.uiLocale && saved?.uiLocale) prefs.uiLocale = saved.uiLocale;
        if (!prefs.viewMode && saved?.viewMode) prefs.viewMode = saved.viewMode;
      }
    } catch {
      /* ignore */
    }
  }

  return prefs;
}

/** @returns {StarsUiPrefs} */
export function readUiPrefs() {
  return migrateLegacyPrefs(readRawPrefs());
}

/** @param {Partial<StarsUiPrefs>} patch */
export function writeUiPrefs(patch) {
  try {
    const next = { ...readRawPrefs(), ...patch };
    localStorage.setItem(STARS_UI_PREFS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function readSidebarCollapsedPref() {
  return readUiPrefs().sidebarCollapsed === true;
}

export function writeSidebarCollapsedPref(collapsed) {
  writeUiPrefs({ sidebarCollapsed: collapsed });
}

export function readStoredUiLocale() {
  const locale = readUiPrefs().uiLocale;
  return locale === 'en' || locale === 'zh-CN' ? locale : '';
}

export function writeStoredUiLocale(locale) {
  const next = locale === 'en' ? 'en' : 'zh-CN';
  writeUiPrefs({ uiLocale: next });
}

export function readStoredViewMode() {
  const mode = readUiPrefs().viewMode;
  return mode === 'galaxy' || mode === 'list' ? mode : '';
}

export function writeStoredViewMode(mode) {
  writeUiPrefs({ viewMode: mode === 'galaxy' ? 'galaxy' : 'list' });
}

export function readStoredGalaxyAreaExpanded() {
  return readUiPrefs().galaxyAreaExpanded === true;
}

export function writeStoredGalaxyAreaExpanded(expanded) {
  writeUiPrefs({ galaxyAreaExpanded: expanded === true });
}

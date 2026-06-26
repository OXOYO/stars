import { computed, reactive, ref, watch, nextTick } from 'vue';
import {
  filterAndSortStars,
  filterStars,
  buildLanguageOptions,
  buildLicenseOptions,
  buildYearOptions,
  mapLegacySort,
} from '../utils/stars-filter';
import { normalizeUiLocale, resolveUiLocale } from '../i18n';
import {
  buildGalaxyVirtualIndexMap,
  GALAXY_LAYOUT_CACHE_TAG,
  GALAXY_LAYOUT_VERSION,
  hasValidGalaxyLayout,
} from '../galaxy/layout-payload.js';
import { expandReposToVirtualStars } from '../galaxy/virtual-stars.js';
import {
  readStoredUiLocale,
  readStoredViewMode,
  readStoredGalaxyAreaExpanded,
  writeStoredUiLocale,
  writeStoredViewMode,
  writeStoredGalaxyAreaExpanded,
} from '../storage/ui-prefs.js';
import { isMobileViewport } from './useMediaQuery.js';

const PAGE_TITLE_CACHE_KEY = 'stars-page-title';

/** @type {string} */
const DEFAULT_SITE_TITLE =
  typeof __STARS_DEFAULT_SITE_TITLE__ === 'string' && __STARS_DEFAULT_SITE_TITLE__.trim()
    ? __STARS_DEFAULT_SITE_TITLE__.trim()
    : 'Stars';

function readCachedPageTitle() {
  try {
    const cached = sessionStorage.getItem(PAGE_TITLE_CACHE_KEY);
    return typeof cached === 'string' && cached.trim() ? cached.trim() : '';
  } catch {
    return '';
  }
}

function cachePageTitle(title) {
  if (!title) return;
  try {
    sessionStorage.setItem(PAGE_TITLE_CACHE_KEY, title);
  } catch {
    /* ignore */
  }
}

/** @type {Promise<void> | null} */
let bootstrapPromise = null;

const payload = ref(null);
const siteMeta = ref(null);
const loading = ref(true);
const error = ref('');
const qInput = ref('');
const qApplied = ref('');
const language = ref('all');
const license = ref('all');
const starredYear = ref('all');
const type = ref('all');
const sort = ref('recently_starred');
const uiLocale = ref('zh-CN');
const showLanguage = ref(true);
const showStarsCount = ref(true);
const showLicense = ref(true);
const virtualRowHeight = ref(140);

let debounceTimer;
let scrollListFn = () => {};
let rowRemeasureFn = () => {};
let searchDebounceMs = 300;
let configuredUiLocale = 'zh-CN';
const expandedDescIds = ref(new Set());
const viewMode = ref('list');
const galaxyFocus = ref('');
const galaxySelected = ref(null);
const galaxyAreaExpanded = ref(false);
/** @type {import('vue').Ref<object | null>} */
const galaxyLayoutPayload = ref(null);
let galaxyLayoutPromise = null;
/** 星云渲染诊断：布局版本、星点数、是否预计算 */
const galaxyRenderStats = ref({
  layoutVersion: 0,
  pointCount: 0,
  precomputed: false,
});

export function registerStarsListScroller(fn) {
  scrollListFn = typeof fn === 'function' ? fn : () => {};
}

export function registerStarsRowRemeasure(fn) {
  rowRemeasureFn = typeof fn === 'function' ? fn : () => {};
}

export function requestStarsRowRemeasure(itemIndex) {
  nextTick(() => rowRemeasureFn(itemIndex));
}

function isDescExpanded(id) {
  return expandedDescIds.value.has(id);
}

function toggleDescExpanded(id) {
  const next = new Set(expandedDescIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedDescIds.value = next;
}

function collapseDescExpanded(id) {
  if (!expandedDescIds.value.has(id)) return;
  const next = new Set(expandedDescIds.value);
  next.delete(id);
  expandedDescIds.value = next;
}

function scrollListToTop() {
  if (viewMode.value !== 'list') return;
  scrollListFn();
}

function currentPathname() {
  if (typeof window === 'undefined') return '/';
  return window.location.pathname || '/';
}

function hasStarsViewQuery() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('stars-view');
}

function hasUiLocaleQuery() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('lang');
}

function hasGalaxyExpandQuery() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('stars-galaxy-expand');
}

function applyQuery() {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);

  if (hasUiLocaleQuery()) {
    uiLocale.value = resolveUiLocale(window.location.search, configuredUiLocale);
    writeStoredUiLocale(uiLocale.value);
  } else {
    const storedLocale = readStoredUiLocale();
    uiLocale.value = storedLocale
      ? normalizeUiLocale(storedLocale)
      : resolveUiLocale('', configuredUiLocale);
  }

  if (params.has('stars-lang')) {
    language.value = params.get('stars-lang') || 'all';
  } else {
    language.value = 'all';
  }

  if (params.has('stars-license')) {
    license.value = params.get('stars-license') || 'all';
  } else {
    license.value = 'all';
  }

  if (params.has('stars-year')) {
    starredYear.value = params.get('stars-year') || 'all';
  } else {
    starredYear.value = 'all';
  }

  if (params.has('stars-q')) {
    const starsQ = params.get('stars-q');
    qInput.value = starsQ;
    qApplied.value = starsQ;
  } else {
    qInput.value = '';
    qApplied.value = '';
  }

  if (params.has('stars-type')) {
    type.value = params.get('stars-type') || 'all';
  } else {
    type.value = 'all';
  }

  const starsSort = params.get('stars-sort');
  if (starsSort) {
    sort.value = mapLegacySort(starsSort);
  }

  const viewParam = params.get('stars-view');
  if (viewParam === 'galaxy') {
    viewMode.value = 'galaxy';
    writeStoredViewMode('galaxy');
  } else if (hasStarsViewQuery()) {
    viewMode.value = 'list';
    writeStoredViewMode('list');
  } else {
    const storedView = readStoredViewMode();
    viewMode.value = storedView === 'galaxy' ? 'galaxy' : 'list';
  }
  galaxyFocus.value = params.get('stars-focus') || '';

  const expandParam = params.get('stars-galaxy-expand');
  if (expandParam === '1' && !isMobileViewport()) {
    galaxyAreaExpanded.value = true;
    writeStoredGalaxyAreaExpanded(true);
  } else if (hasGalaxyExpandQuery() || isMobileViewport()) {
    galaxyAreaExpanded.value = false;
    writeStoredGalaxyAreaExpanded(false);
  } else {
    galaxyAreaExpanded.value = readStoredGalaxyAreaExpanded();
  }
}

function hasStarsFilterQuery() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return ['stars-q', 'stars-lang', 'stars-license', 'stars-year', 'stars-type', 'stars-sort'].some(
    (key) => params.has(key)
  );
}

function patchQueryParam(key, valueRef, allValue = 'all') {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);

  if (!valueRef.value || valueRef.value === allValue) {
    params.delete(key);
    valueRef.value = allValue;
  } else {
    params.set(key, valueRef.value);
  }

  const qs = params.toString();
  const path = currentPathname();
  window.history.pushState({}, '', `${path}${qs ? `?${qs}` : ''}`);
  persistSession();
  scrollListToTop();
}

export function patchLanguageInQuery(langValue) {
  language.value = !langValue || langValue === 'all' ? 'all' : langValue;
  patchQueryParam('stars-lang', language);
}

export function patchLicenseInQuery(licenseValue) {
  license.value = !licenseValue || licenseValue === 'all' ? 'all' : licenseValue;
  patchQueryParam('stars-license', license);
}

export function patchStarredYearInQuery(yearValue) {
  starredYear.value = !yearValue || yearValue === 'all' ? 'all' : yearValue;
  patchQueryParam('stars-year', starredYear);
}

/** 按 GitHub topic 筛选（搜索框写入 #topic） */
export function applyTopicSearch(topic) {
  const name = String(topic || '')
    .trim()
    .toLowerCase();
  if (!name) return;
  const next = `#${name}`;
  qInput.value = next;
  qApplied.value = next;
  if (typeof window !== 'undefined') {
    syncQuery();
    persistSession();
    scrollListToTop();
  }
}

export function clearAllFilters() {
  qInput.value = '';
  qApplied.value = '';
  language.value = 'all';
  license.value = 'all';
  starredYear.value = 'all';
  type.value = 'all';
  sort.value = 'recently_starred';
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    ['stars-q', 'stars-lang', 'stars-license', 'stars-year', 'stars-type', 'stars-sort'].forEach(
      (key) => params.delete(key)
    );
    const qs = params.toString();
    window.history.replaceState({}, '', `${currentPathname()}${qs ? `?${qs}` : ''}`);
  }
  try {
    sessionStorage.removeItem('stars-filters');
  } catch {
    /* ignore */
  }
  scrollListToTop();
}

export function setUiLocale(locale) {
  if (typeof window === 'undefined') return;
  const next = locale === 'en' ? 'en' : 'zh-CN';
  uiLocale.value = next;
  const params = new URLSearchParams(window.location.search);
  if (next === 'en') params.set('lang', 'en');
  else params.delete('lang');
  const qs = params.toString();
  const path = currentPathname();
  window.history.replaceState({}, '', `${path}${qs ? `?${qs}` : ''}`);
  writeStoredUiLocale(next);
  persistSession();
}

function syncQuery() {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams();
  if (uiLocale.value === 'en') params.set('lang', 'en');
  if (qApplied.value.trim()) params.set('stars-q', qApplied.value.trim());
  if (language.value !== 'all') params.set('stars-lang', language.value);
  if (license.value !== 'all') params.set('stars-license', license.value);
  if (starredYear.value !== 'all') params.set('stars-year', starredYear.value);
  if (type.value !== 'all') params.set('stars-type', type.value);
  if (sort.value !== 'recently_starred') params.set('stars-sort', sort.value);
  if (viewMode.value === 'galaxy') params.set('stars-view', 'galaxy');
  else params.delete('stars-view');
  if (galaxyFocus.value) params.set('stars-focus', galaxyFocus.value);
  else params.delete('stars-focus');
  if (viewMode.value === 'galaxy' && galaxyAreaExpanded.value) {
    params.set('stars-galaxy-expand', '1');
  } else {
    params.delete('stars-galaxy-expand');
  }
  const qs = params.toString();
  const path = currentPathname();
  window.history.replaceState({}, '', `${path}${qs ? `?${qs}` : ''}`);
}

function persistSession() {
  try {
    sessionStorage.setItem(
      'stars-filters',
      JSON.stringify({
        q: qApplied.value,
        language: language.value,
        license: license.value,
        starredYear: starredYear.value,
        type: type.value,
        sort: sort.value,
      })
    );
  } catch {
    /* ignore */
  }
}

function restoreSession() {
  try {
    const raw = sessionStorage.getItem('stars-filters');
    if (!raw || hasStarsFilterQuery()) return;
    const saved = JSON.parse(raw);
    if (saved.q) {
      qInput.value = saved.q;
      qApplied.value = saved.q;
    }
    if (saved.language) language.value = saved.language;
    if (saved.license) license.value = saved.license;
    if (saved.starredYear) starredYear.value = saved.starredYear;
    if (saved.type) type.value = saved.type;
    if (saved.sort) sort.value = saved.sort;
  } catch {
    /* ignore */
  }
}

async function loadSiteMeta() {
  const base = import.meta.env.BASE_URL || '/';
  try {
    const res = await fetch(`${base}site.json`);
    if (res.ok) siteMeta.value = await res.json();
  } catch {
    siteMeta.value = null;
  }
}

function pickGalaxyLayoutPayload(remote) {
  return hasValidGalaxyLayout(remote) ? remote : null;
}

async function loadGalaxyLayout() {
  const base = import.meta.env.BASE_URL || '/';
  let remote = null;

  try {
    const res = await fetch(
      `${base}galaxy.json?v=${GALAXY_LAYOUT_VERSION}-${GALAXY_LAYOUT_CACHE_TAG}`,
      { cache: 'no-store' }
    );
    if (res.ok) remote = await res.json();
  } catch {
    /* ignore */
  }

  const picked = pickGalaxyLayoutPayload(remote);
  if (picked) galaxyLayoutPayload.value = picked;
  return picked;
}

export function ensureGalaxyLayout() {
  const cached = galaxyLayoutPayload.value;
  if (cached && hasValidGalaxyLayout(cached)) {
    return Promise.resolve(cached);
  }
  if (!galaxyLayoutPromise) {
    galaxyLayoutPromise = loadGalaxyLayout().finally(() => {
      galaxyLayoutPromise = null;
    });
  }
  return galaxyLayoutPromise;
}

export function setGalaxyRenderStats(stats) {
  galaxyRenderStats.value = {
    layoutVersion: Number(stats?.layoutVersion) || 0,
    pointCount: Number(stats?.pointCount) || 0,
    precomputed: Boolean(stats?.precomputed),
  };
}

async function loadData() {
  error.value = '';
  try {
    const base = import.meta.env.BASE_URL || '/';
    const res = await fetch(`${base}stars.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    payload.value = await res.json();
    const ui = payload.value.ui || {};
    showLanguage.value = ui.showLanguage !== false;
    showStarsCount.value = ui.showStarsCount !== false;
    showLicense.value = ui.showLicense !== false;
    virtualRowHeight.value = ui.virtualRowHeight || 140;
    if (ui.defaultSort) sort.value = mapLegacySort(ui.defaultSort);
    if (ui.defaultUiLocale) configuredUiLocale = normalizeUiLocale(ui.defaultUiLocale);
    if (ui.searchDebounceMs) searchDebounceMs = ui.searchDebounceMs;
  } catch (e) {
    error.value = e.message || 'Error';
  }
}

function onSearch() {
  qApplied.value = qInput.value;
  persistSession();
  syncQuery();
  scrollListToTop();
}

function scheduleDebouncedSearch() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    qApplied.value = qInput.value;
    persistSession();
    syncQuery();
    scrollListToTop();
  }, searchDebounceMs);
}

watch(qInput, () => {
  scheduleDebouncedSearch();
});

watch([type, sort, license, starredYear], () => {
  persistSession();
  syncQuery();
  scrollListToTop();
});

watch(language, () => {
  persistSession();
  syncQuery();
  scrollListToTop();
});

function currentFilterState(overrides = {}) {
  return {
    q: qApplied.value,
    language: language.value,
    license: license.value,
    starredYear: starredYear.value,
    type: type.value,
    sort: sort.value,
    ...overrides,
  };
}

export function useStarsStore() {
  const items = computed(() => payload.value?.items || []);
  const total = computed(() => payload.value?.total ?? items.value.length);
  const owner = computed(() => payload.value?.owner || siteMeta.value?.owner || '');
  const repoName = computed(
    () => payload.value?.repoName || siteMeta.value?.repoName || 'stars'
  );
  const generatedAt = computed(() => payload.value?.generatedAt || siteMeta.value?.generatedAt || '');
  const pageTitle = computed(() => {
    const fromMeta = siteMeta.value?.title;
    const fromPayload = payload.value?.ui?.siteName;
    const title =
      (typeof fromMeta === 'string' && fromMeta.trim()) ||
      (typeof fromPayload === 'string' && fromPayload.trim()) ||
      '';
    if (title) {
      cachePageTitle(title);
      return title;
    }
    const cached = readCachedPageTitle();
    if (cached) return cached;
    return DEFAULT_SITE_TITLE;
  });
  const stats = computed(() => payload.value?.stats || null);
  const galaxyLayout = computed(() => galaxyLayoutPayload.value);
  const galaxyVirtualIndexMap = computed(() =>
    buildGalaxyVirtualIndexMap(expandReposToVirtualStars(items.value))
  );

  const languageOptions = computed(() =>
    buildLanguageOptions(filterStars(items.value, currentFilterState({ language: 'all' })))
  );
  const licenseOptions = computed(() =>
    buildLicenseOptions(filterStars(items.value, currentFilterState({ license: 'all' })))
  );
  const yearOptions = computed(() =>
    buildYearOptions(filterStars(items.value, currentFilterState({ starredYear: 'all' })))
  );

  const filtered = computed(() => filterAndSortStars(items.value, currentFilterState()));

  const hasActiveFilters = computed(
    () =>
      !!qApplied.value.trim() ||
      language.value !== 'all' ||
      license.value !== 'all' ||
      starredYear.value !== 'all' ||
      type.value !== 'all'
  );

  function setViewMode(mode) {
    viewMode.value = mode === 'galaxy' ? 'galaxy' : 'list';
    if (viewMode.value === 'list') {
      galaxySelected.value = null;
    } else {
      void ensureGalaxyLayout();
      if (typeof window !== 'undefined' && !hasGalaxyExpandQuery()) {
        galaxyAreaExpanded.value = isMobileViewport()
          ? false
          : readStoredGalaxyAreaExpanded();
      }
    }
    writeStoredViewMode(viewMode.value);
    persistSession();
    syncQuery();
    scrollListToTop();
  }

  function setGalaxyAreaExpanded(expanded) {
    const next = isMobileViewport() ? false : Boolean(expanded);
    galaxyAreaExpanded.value = next;
    writeStoredGalaxyAreaExpanded(next);
    syncQuery();
  }

  function toggleGalaxyAreaExpanded() {
    if (isMobileViewport()) return;
    setGalaxyAreaExpanded(!galaxyAreaExpanded.value);
  }

  function selectGalaxyItem(item) {
    if (!item?.id) return;
    galaxySelected.value = item;
    galaxyFocus.value = item.id;
    persistSession();
    syncQuery();
  }

  function closeGalaxyDetail() {
    galaxySelected.value = null;
    galaxyFocus.value = '';
    persistSession();
    syncQuery();
  }

  function clearFilterKey(key) {
    if (key === 'type') {
      type.value = 'all';
    }
    if (key === 'q') {
      qInput.value = '';
      qApplied.value = '';
    }
    persistSession();
    syncQuery();
    scrollListToTop();
  }

  async function bootstrap() {
    if (bootstrapPromise) return bootstrapPromise;
    bootstrapPromise = (async () => {
      loading.value = true;
      error.value = '';
      try {
        await Promise.all([loadSiteMeta(), loadData()]);
        const ui = payload.value?.ui || {};
        if (ui.defaultSort && !hasStarsFilterQuery()) {
          const params = new URLSearchParams(window.location.search);
          if (!params.has('stars-sort')) sort.value = mapLegacySort(ui.defaultSort);
        }
        applyQuery();
        if (!hasStarsFilterQuery()) restoreSession();
        if (viewMode.value === 'galaxy') await ensureGalaxyLayout();
      } finally {
        loading.value = false;
      }
    })();
    return bootstrapPromise;
  }

  function onPopState() {
    applyQuery();
    scrollListToTop();
  }

  const store = reactive({
    uiLocale,
    loading,
    error,
    payload,
    siteMeta,
    qInput,
    qApplied,
    language,
    license,
    starredYear,
    type,
    sort,
    galaxyRenderStats,
    setGalaxyRenderStats,
    showLanguage,
    showStarsCount,
    showLicense,
    virtualRowHeight,
    viewMode,
    galaxyFocus,
    galaxySelected,
    galaxyAreaExpanded,
    setViewMode,
    setGalaxyAreaExpanded,
    toggleGalaxyAreaExpanded,
    ensureGalaxyLayout,
    selectGalaxyItem,
    closeGalaxyDetail,
    bootstrap,
    onSearch,
    onPopState,
    applyQuery,
    scrollListToTop,
    setUiLocale,
    patchLanguageInQuery,
    patchLicenseInQuery,
    patchStarredYearInQuery,
    clearAllFilters,
    clearFilterKey,
    isDescExpanded,
    toggleDescExpanded,
    collapseDescExpanded,
  });

  Object.defineProperties(store, {
    items: { get: () => items.value },
    total: { get: () => total.value },
    owner: { get: () => owner.value },
    repoName: { get: () => repoName.value },
    generatedAt: { get: () => generatedAt.value },
    pageTitle: { get: () => pageTitle.value },
    stats: { get: () => stats.value },
    galaxyLayout: { get: () => galaxyLayout.value },
    galaxyVirtualIndexMap: { get: () => galaxyVirtualIndexMap.value },
    licenseOptions: { get: () => licenseOptions.value },
    yearOptions: { get: () => yearOptions.value },
    languageOptions: { get: () => languageOptions.value },
    filtered: { get: () => filtered.value },
    hasActiveFilters: { get: () => hasActiveFilters.value },
  });

  return store;
}

export function remeasureStarsList(virtualizer, viewportEl, itemIndex) {
  const run = () => {
    const v = virtualizer?.value;
    const root = viewportEl;
    if (!v || !root) return;

    const measureEl = (el) => {
      if (el) v.measureElement(el);
    };

    if (itemIndex != null && itemIndex >= 0) {
      measureEl(root.querySelector(`.stars-explorer__virtual-row[data-index="${itemIndex}"]`));
    }

    root.querySelectorAll('.stars-explorer__virtual-row[data-index]').forEach(measureEl);
  };

  nextTick(() => {
    requestAnimationFrame(run);
  });
}

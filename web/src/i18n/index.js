export const messages = {
  'zh-CN': {
    loading: '正在加载 Star 数据…',
    loadError: '无法加载 stars.json：{error}。请先运行 npm run generate。',
    empty: '无匹配结果，请调整筛选条件。',
    clearFilters: '清除全部筛选',
    filtersTitle: '筛选',
    filtersOpen: '筛选',
    filtersClose: '关闭',
    filtersWithCount: '筛选 ({count})',
    searchPlaceholder: '搜索仓库、描述或 #主题',
    filterTopic: '主题',
    filterByTopic: '按 #{topic} 筛选',
    type: '类型',
    sortBy: '排序',
    typeAll: '全部',
    typeSources: '源仓库',
    typeForks: 'Fork',
    langAll: '全部语言',
    sortRecentlyStarred: '最近 Star',
    sortRecentlyActive: '最近活跃',
    sortMostStars: '星标最多',
    filterCount: '显示 <strong>{filtered}</strong> / <strong>{total}</strong> 个匹配',
    filterActive: '当前筛选',
    filterSearch: '搜索',
    filterLang: '语言',
    ownerProfile: '查看 {owner} 的 GitHub 主页',
    descNone: '无',
    descExpand: '展开',
    descCollapse: '收起',
    site: '网站',
    createdAt: '创建于',
    pushedAt: '最后推送',
    forksCount: 'Fork',
    watchersCount: 'Watch',
    shieldFork: 'fork',
    shieldWatch: 'watch',
    shieldStars: 'stars',
    topics: '主题',
    stars: '星标数',
    otherLang: '其他',
    fork: 'Fork',
    license: '协议',
    licenseAll: '全部协议',
    licenseNone: '未声明',
    starredYear: 'Star 年份',
    yearAll: '全部年份',
    statTotal: '共 {count} 个',
    statLangs: '{count} 种语言',
    statLicenses: '{count} 种协议',
    statTopLang: '语言 Top 5',
    statTopLicense: '协议 Top 5',
    statByYear: '按年 Star',
    statClickHint: '点击图表可筛选；与侧栏其它条件叠加。柱条浅色为全库，深色为当前其它筛选下的占比。',
    statCountFiltered: '{filtered} / {total}',
    statPanelTitle: '统计',
    statPanelExpand: '展开统计',
    statPanelCollapse: '收起统计',
    progLang: '编程语言',
    footerMeta: '更新于 <strong>{updatedAt}</strong> · 数据来自 GitHub API',
    navGitHub: 'GitHub',
    langZh: '中文',
    langEn: 'EN',
  },
  en: {
    loading: 'Loading starred repositories…',
    loadError: 'Failed to load stars.json: {error}. Run npm run generate first.',
    empty: 'No matches. Try adjusting filters.',
    clearFilters: 'Clear all filters',
    filtersTitle: 'Filters',
    filtersOpen: 'Filters',
    filtersClose: 'Close',
    filtersWithCount: 'Filters ({count})',
    searchPlaceholder: 'Search repos, description, or #topic',
    filterTopic: 'Topic',
    filterByTopic: 'Filter by #{topic}',
    type: 'Type',
    sortBy: 'Sort by',
    typeAll: 'All',
    typeSources: 'Sources',
    typeForks: 'Forks',
    langAll: 'All languages',
    sortRecentlyStarred: 'Recently starred',
    sortRecentlyActive: 'Recently active',
    sortMostStars: 'Most stars',
    filterCount: '<strong>{filtered}</strong> / <strong>{total}</strong> matches',
    filterActive: 'Active filters',
    filterSearch: 'Search',
    filterLang: 'Language',
    ownerProfile: 'View {owner} on GitHub',
    descNone: 'None',
    descExpand: 'Show more',
    descCollapse: 'Show less',
    site: 'Site',
    createdAt: 'Created',
    pushedAt: 'Last push',
    forksCount: 'Forks',
    watchersCount: 'Watchers',
    shieldFork: 'fork',
    shieldWatch: 'watch',
    shieldStars: 'stars',
    topics: 'Topics',
    stars: 'Stars',
    otherLang: 'Other',
    fork: 'Fork',
    license: 'License',
    licenseAll: 'All licenses',
    licenseNone: 'Unlicensed',
    starredYear: 'Starred year',
    yearAll: 'All years',
    statTotal: '{count} total',
    statLangs: '{count} languages',
    statLicenses: '{count} licenses',
    statTopLang: 'Top languages',
    statTopLicense: 'Top licenses',
    statByYear: 'Stars by year',
    statClickHint: 'Click charts to filter. Light bar = all stars; dark overlay = count under other active filters.',
    statCountFiltered: '{filtered} / {total}',
    statPanelTitle: 'Statistics',
    statPanelExpand: 'Show stats',
    statPanelCollapse: 'Hide stats',
    footerMeta: 'Updated <strong>{updatedAt}</strong> · Data from GitHub API',
    navGitHub: 'GitHub',
    langZh: '中文',
    langEn: 'EN',
  },
};

export function normalizeUiLocale(value) {
  return value === 'en' ? 'en' : 'zh-CN';
}

export function resolveUiLocale(search = '', fallback = 'zh-CN') {
  const params = new URLSearchParams(search);
  if (params.has('lang')) {
    return normalizeUiLocale(params.get('lang'));
  }
  return normalizeUiLocale(fallback);
}

export function createTranslator(localeRef) {
  return (key, params = {}) => {
    const locale = typeof localeRef === 'function' ? localeRef() : localeRef.value ?? localeRef;
    const pack = messages[locale] || messages['zh-CN'];
    let text = pack[key] ?? messages['zh-CN'][key] ?? key;
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
    return text;
  };
}

export function formatGeneratedAt(iso, locale) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (locale === 'en') {
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
      timeZoneName: 'short',
    });
  }
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Shanghai',
  });
}

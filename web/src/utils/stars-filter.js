/** GitHub topic 名：小写字母、数字、连字符 */
const TOPIC_TAG_RE = /(?:^|\s)#([a-z0-9][a-z0-9-]*)/gi;

/**
 * 解析搜索框：支持 `#vue` / `vite #electron`（多标签为 AND）
 * @param {string} q
 * @returns {{ text: string, topics: string[] }}
 */
export function parseSearchQuery(q) {
  const raw = (q || '').trim();
  const topics = [];
  const seen = new Set();
  let match;
  while ((match = TOPIC_TAG_RE.exec(raw)) !== null) {
    const topic = match[1].toLowerCase();
    if (!seen.has(topic)) {
      seen.add(topic);
      topics.push(topic);
    }
  }
  const text = raw
    .replace(/(?:^|\s)#[a-z0-9][a-z0-9-]*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { text, topics };
}

function itemTopicKeys(item) {
  return (item.topics || []).map((t) => String(t).toLowerCase());
}

/**
 * @param {Array<{ fullName: string, description?: string, topics?: string[], language: string | null, license: string | null, fork: boolean, stars: number, starredAt: string, pushedAt: string }>} items
 * @param {{ q: string, language: string, license: string, starredYear: string, type: string, sort: string }} opts
 */
export function filterAndSortStars(items, { q, language, license, starredYear, type, sort }) {
  let list = items.slice();
  const { text, topics } = parseSearchQuery(q);

  if (topics.length) {
    list = list.filter((item) => {
      const keys = itemTopicKeys(item);
      return topics.every((topic) => keys.includes(topic));
    });
  }

  if (text) {
    const query = text.toLowerCase();
    list = list.filter(
      (item) =>
        item.fullName.toLowerCase().includes(query) ||
        (item.description || '').toLowerCase().includes(query) ||
        itemTopicKeys(item).some((topic) => topic.includes(query))
    );
  }

  if (language && language !== 'all') {
    if (language === '其他') {
      list = list.filter((item) => !item.language);
    } else {
      list = list.filter((item) => item.language === language);
    }
  }

  if (license && license !== 'all') {
    list = list.filter((item) => item.license === license);
  }

  if (starredYear && starredYear !== 'all') {
    list = list.filter((item) => (item.starredAt || '').startsWith(starredYear));
  }

  if (type === 'sources') list = list.filter((item) => !item.fork);
  else if (type === 'forks') list = list.filter((item) => item.fork);

  const byDate = (a, b, field) => new Date(b[field] || 0) - new Date(a[field] || 0);

  if (sort === 'most_stars') {
    list.sort((a, b) => b.stars - a.stars);
  } else if (sort === 'recently_active') {
    list.sort((a, b) => byDate(a, b, 'pushedAt'));
  } else {
    list.sort((a, b) => byDate(a, b, 'starredAt'));
  }

  return list;
}

/** 筛选（排序不改变条数，sort 仅用于保持接口一致） */
export function filterStars(items, opts) {
  return filterAndSortStars(items, { ...opts, sort: 'recently_starred' });
}

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'zh-CN'))
    .map(([name, count]) => ({ name, count }));
}

/** @param {Array<{ language: string | null }>} items */
export function buildLanguageOptions(items) {
  return countBy(items, (item) => item.language || '其他');
}

/** @param {Array<{ license: string | null }>} items */
export function buildLicenseOptions(items) {
  return countBy(items, (item) => item.license).filter((o) => o.name);
}

/** @param {Array<{ starredAt: string }>} items */
export function buildYearOptions(items) {
  const counts = new Map();
  for (const item of items) {
    const y = (item.starredAt || '').slice(0, 4);
    if (!y) continue;
    counts.set(y, (counts.get(y) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, count]) => ({ year, count }));
}

function itemLanguageKey(item) {
  return item.language || '其他';
}

function itemYearKey(item) {
  return (item.starredAt || '').slice(0, 4);
}

/**
 * 图表叠加：在排除本维度筛选的前提下，统计各分类在当前其它筛选下的数量
 * @param {ReturnType<typeof filterAndSortStars>} items
 * @param {{ q: string, language: string, license: string, starredYear: string, type: string, sort: string }} state
 * @param {'language' | 'license' | 'starredYear'} dimension
 * @param {string[]} keys
 * @param {(item: object) => string} keyFn
 */
export function buildChartOverlayCounts(items, state, dimension, keys, keyFn) {
  const relaxed = { ...state, sort: 'recently_starred' };
  if (dimension === 'language') relaxed.language = 'all';
  else if (dimension === 'license') relaxed.license = 'all';
  else if (dimension === 'starredYear') relaxed.starredYear = 'all';

  const pool = filterStars(items, relaxed);
  const map = new Map(keys.map((k) => [k, 0]));
  for (const item of pool) {
    const k = keyFn(item);
    if (map.has(k)) map.set(k, map.get(k) + 1);
  }
  return map;
}

export { itemLanguageKey, itemYearKey };

/** @param {string} legacy */
export function mapLegacySort(legacy) {
  if (legacy === 'stars') return 'most_stars';
  if (legacy === 'date') return 'recently_starred';
  if (legacy === 'recently_active' || legacy === 'most_stars') return legacy;
  return 'recently_starred';
}

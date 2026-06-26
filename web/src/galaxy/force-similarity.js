const MS_DAY = 86400000;

/** 语言亲缘（非精确匹配时的弱相似） */
const LANG_RELATED = {
  javascript: ['typescript', 'vue', 'html', 'css'],
  typescript: ['javascript', 'vue'],
  vue: ['javascript', 'typescript'],
  python: ['jupyter notebook', 'cython'],
  'jupyter notebook': ['python'],
  java: ['kotlin', 'scala'],
  kotlin: ['java'],
  go: ['rust'],
  rust: ['go', 'c++', 'c'],
  'c++': ['c', 'rust'],
  c: ['c++', 'rust'],
};

function normLang(lang) {
  return String(lang || '其他').trim().toLowerCase();
}

/**
 * @param {string | null | undefined} starredAt
 * @returns {number | null}
 */
export function parseStarredMs(starredAt) {
  const t = Date.parse(starredAt || '');
  return Number.isFinite(t) ? t : null;
}

/**
 * @param {object} item
 * @returns {Set<string>}
 */
export function topicSet(item) {
  const topics = Array.isArray(item?.topics) ? item.topics : [];
  const set = new Set();
  for (const t of topics) {
    const key = String(t || '').trim().toLowerCase();
    if (key) set.add(key);
  }
  return set;
}

/**
 * @param {Set<string>} a
 * @param {Set<string>} b
 */
function topicSimilarity(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) {
    if (b.has(x)) inter += 1;
  }
  if (inter === 0) return 0;
  const union = a.size + b.size - inter;
  const jaccard = union > 0 ? inter / union : 0;
  // tag 很多时 Jaccard 偏低，有交集则保证最低相似度
  const sharedFloor = Math.min(0.6, 0.25 + inter * 0.14);
  return Math.max(jaccard, sharedFloor);
}

/**
 * @param {string | null | undefined} langA
 * @param {string | null | undefined} langB
 */
export function langSimilarity(langA, langB) {
  const a = normLang(langA);
  const b = normLang(langB);
  if (a === b) return 1;
  const relatedA = LANG_RELATED[a];
  if (relatedA && relatedA.includes(b)) return 0.55;
  const relatedB = LANG_RELATED[b];
  if (relatedB && relatedB.includes(a)) return 0.55;
  return 0;
}

/**
 * @param {{ ms: number | null, language: string | null, topics: Set<string> }} na
 * @param {{ ms: number | null, language: string | null, topics: Set<string> }} nb
 * @param {{ weights: { time: number, lang: number, topic: number }, timeTauDays: number }} ctx
 */
export function pairSimilarity(na, nb, ctx) {
  let timeSim = 0;
  if (na.ms != null && nb.ms != null) {
    const dtDays = Math.abs(na.ms - nb.ms) / MS_DAY;
    timeSim = Math.exp(-dtDays / ctx.timeTauDays);
  }
  const langSim = langSimilarity(na.language, nb.language);
  const topicSim = topicSimilarity(na.topics, nb.topics);
  const { time, lang, topic } = ctx.weights;
  return time * timeSim + lang * langSim + topic * topicSim;
}

/**
 * @param {Array<object>} items
 */
export function prepareForceNodes(items) {
  return items.map((item) => ({
    id: item.id,
    language: item.language ?? null,
    ms: parseStarredMs(item.starredAt),
    topics: topicSet(item),
  }));
}

/**
 * 虚拟星节点：每颗星只带一个 topic（或无 topic）
 * @param {import('./virtual-stars.js').VirtualStar[]} virtualStars
 */
export function prepareForceNodesFromVirtualStars(virtualStars) {
  return (virtualStars || []).map((v) => ({
    id: v.virtualKey,
    language: v.language ?? null,
    ms: parseStarredMs(v.item?.starredAt),
    topics: v.topic ? new Set([v.topic]) : new Set(),
    repoId: v.repoId,
  }));
}

/**
 * @param {Array<object>} items
 */
export function findAnchorRepoId(items) {
  const list = items || [];
  if (!list.length) return null;
  const nodes = prepareForceNodes(list);
  const idx = findAnchorIndex(nodes);
  return list[idx]?.id ?? null;
}

/**
 * @param {import('./virtual-stars.js').VirtualStar[]} virtualStars
 * @param {string | null} anchorRepoId
 */
export function findVirtualStarAnchorIndex(virtualStars, anchorRepoId) {
  const stars = virtualStars || [];
  if (!stars.length) return 0;
  if (anchorRepoId) {
    for (let i = 0; i < stars.length; i += 1) {
      if (stars[i].repoId === anchorRepoId) return i;
    }
  }
  return findAnchorIndex(prepareForceNodesFromVirtualStars(stars));
}

/**
 * 最早 starred 的仓库索引（第一个关注）
 * @param {Array<{ ms: number | null }>} nodes
 */
export function findAnchorIndex(nodes) {
  let best = 0;
  let bestMs = Infinity;
  for (let i = 0; i < nodes.length; i += 1) {
    const ms = nodes[i].ms;
    if (ms != null && ms < bestMs) {
      bestMs = ms;
      best = i;
    }
  }
  return best;
}

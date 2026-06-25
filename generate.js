const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const axios = require('axios');

const ROOT = __dirname;
const CONFIG_PATH = path.join(ROOT, 'config.json');
const STARS_JSON_PATH = path.join(ROOT, 'web', 'public', 'stars.json');
const SITE_JSON_PATH = path.join(ROOT, 'web', 'public', 'site.json');
const PACKAGE_JSON_PATH = path.join(ROOT, 'package.json');

const defaultConfig = {
  pageConfig: {
    siteName: 'Stars',
    defaultUiLocale: 'zh-CN',
    showLanguage: true,
    showStarsCount: true,
    showLicense: true,
    defaultSort: 'recently_starred',
    virtualRowHeight: 140,
    searchDebounceMs: 300,
    maxItems: 0,
  },
  deployConfig: {
    publishDir: 'web/dist',
    forceOrphan: true,
    pagesBase: 'repo',
  },
};

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { ...defaultConfig, pageConfig: { ...defaultConfig.pageConfig }, deployConfig: { ...defaultConfig.deployConfig } };
  }
  const file = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  return {
    ...defaultConfig,
    ...file,
    pageConfig: { ...defaultConfig.pageConfig, ...file.pageConfig },
    deployConfig: { ...defaultConfig.deployConfig, ...file.deployConfig },
  };
}

const config = loadConfig();
const TOKEN = process.env.GITHUB_TOKEN;

function isToolRepo(owner, repoName) {
  const toolOwner = (config.pageConfig.toolRepoOwner || 'OXOYO').toLowerCase();
  const toolRepo = (config.pageConfig.toolRepoName || 'stars').toLowerCase();
  return (
    String(owner || '').toLowerCase() === toolOwner &&
    String(repoName || '').toLowerCase() === toolRepo
  );
}

/** 解析站点仓库名（CI 注入 REPO_NAME；本地可从 origin 读取） */
function resolveRepoEnv() {
  const envRepo = (process.env.REPO_NAME || '').trim();
  const fromGit = parseGithubRemote(readGitOriginUrl());
  const repoName = envRepo || fromGit?.repoName || 'stars';
  const gitOwner = fromGit?.owner || '';
  return { repoName, gitOwner };
}

async function fetchGitHubLoginFromToken() {
  if (!TOKEN) return null;
  try {
    const { data } = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${TOKEN}` },
      timeout: 20000,
    });
    return data?.login || null;
  } catch {
    return null;
  }
}

function fetchGitHubLoginFromGhCli() {
  try {
    const login = execFileSync('gh', ['api', 'user', '-q', '.login'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 15000,
    }).trim();
    return login || null;
  } catch {
    return null;
  }
}

/**
 * 解析要拉取 Star 列表的 GitHub 用户（CI 注入 OWNER）。
 * clone 工具仓库上游时不用 origin 的 owner，改从 TOKEN / gh / OWNER 识别。
 */
async function resolveStarOwner(repoEnv) {
  const envOwner = (process.env.OWNER || '').trim();
  if (envOwner) return { owner: envOwner, source: 'env' };

  const { gitOwner, repoName } = repoEnv;
  if (gitOwner && !isToolRepo(gitOwner, repoName)) {
    return { owner: gitOwner, source: 'git' };
  }

  const fromToken = await fetchGitHubLoginFromToken();
  if (fromToken) return { owner: fromToken, source: 'token' };

  const fromGh = fetchGitHubLoginFromGhCli();
  if (fromGh) return { owner: fromGh, source: 'gh' };

  return { owner: '', source: 'none' };
}

function formatGenerateError(error) {
  const msg = error.response?.data?.message || error.message || String(error);
  if (/rate limit/i.test(msg)) {
    return `${msg}\n   请设置 GITHUB_TOKEN 后重试（认证后限额约 5000 次/小时）。`;
  }
  return msg;
}

function logOwnerSource(owner, source) {
  if (source === 'env') console.log(`📦 Star 用户：${owner}（环境变量 OWNER）`);
  else if (source === 'git') console.log(`📦 Star 用户：${owner}（git origin）`);
  else if (source === 'token') console.log(`📦 Star 用户：${owner}（GITHUB_TOKEN）`);
  else if (source === 'gh') console.log(`📦 Star 用户：${owner}（GitHub CLI）`);
}

function readGitOriginUrl() {
  try {
    return execFileSync('git', ['config', '--get', 'remote.origin.url'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function parseGithubRemote(url) {
  if (!url) return null;
  const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?\/?$/i);
  if (!match) return null;
  return { owner: match[1], repoName: match[2] };
}

const STAR_MEDIA_TYPE = 'application/vnd.github.v3.star+json';

function normalizeUiLocale(value) {
  return value === 'en' ? 'en' : 'zh-CN';
}

function mapLegacySort(sortBy) {
  if (sortBy === 'stars') return 'most_stars';
  if (sortBy === 'date') return 'recently_starred';
  return sortBy || 'recently_starred';
}

function reportFetchProgress(page, count, { done = false } = {}) {
  const msg = done
    ? `✅ 拉取完成，共 ${count} 条`
    : `🔍 拉取中… 第 ${page} 页，已累计 ${count} 条`;
  if (process.stdout.isTTY) {
    process.stdout.write(`\r${msg}   `);
    if (done) process.stdout.write('\n');
  } else {
    console.log(msg);
  }
}

async function fetchStars(owner) {
  const stars = [];
  let page = 1;
  const max = Number(process.env.MAX_ITEMS) || config.pageConfig.maxItems || 0;

  while (true) {
    const { data } = await axios.get(`https://api.github.com/users/${owner}/starred`, {
      headers: {
        Accept: STAR_MEDIA_TYPE,
        ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      },
      params: { per_page: 100, page },
      timeout: 60000,
    });

    if (!Array.isArray(data) || data.length === 0) break;

    for (const item of data) {
      const repo = item.repo || item;
      stars.push({
        ...repo,
        starred_at: item.starred_at || null,
      });
    }

    reportFetchProgress(page, stars.length);

    if (max > 0 && stars.length >= max) break;
    if (data.length < 100) break;
    page += 1;
  }

  reportFetchProgress(page, stars.length, { done: true });

  if (max > 0 && stars.length > max) {
    console.log(`ℹ️  仅展示前 ${max} 条（可在 config.json 设置 pageConfig.maxItems）`);
    return stars.slice(0, max);
  }
  return stars;
}

function repoAnchor(fullName) {
  return fullName.toLowerCase().replace(/\//g, '-');
}

function normalizeLicense(repo) {
  const lic = repo.license;
  if (!lic) return { license: null, licenseUrl: null };
  const spdx = lic.spdx_id && lic.spdx_id !== 'NOASSERTION' ? lic.spdx_id : null;
  const label = spdx || lic.name || lic.key || null;
  if (!label) return { license: null, licenseUrl: null };
  const licenseUrl =
    lic.html_url ||
    lic.url ||
    (repo.full_name ? `https://github.com/${repo.full_name}/blob/HEAD/LICENSE` : null);
  return { license: label, licenseUrl };
}

function normalizeHomepage(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  return raw || null;
}

function normalizeTopics(repo) {
  if (!Array.isArray(repo.topics)) return [];
  return repo.topics.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim());
}

function normalizeStarItem(repo) {
  const { license, licenseUrl } = normalizeLicense(repo);
  const owner = repo.owner && typeof repo.owner === 'object' ? repo.owner : null;
  const ownerLogin = (repo.full_name || '').split('/')[0] || owner?.login || '';
  return {
    id: repoAnchor(repo.full_name),
    fullName: repo.full_name,
    url: repo.html_url,
    description: repo.description || '',
    language: repo.language || null,
    license,
    licenseUrl,
    stars: repo.stargazers_count || 0,
    starredAt: repo.starred_at || '',
    createdAt: repo.created_at || '',
    pushedAt: repo.pushed_at || repo.updated_at || '',
    homepage: normalizeHomepage(repo.homepage),
    forksCount: Number(repo.forks_count) || 0,
    watchersCount: Number(repo.subscribers_count ?? repo.watchers_count) || 0,
    avatarUrl: ownerLogin ? `https://github.com/${ownerLogin}.png` : null,
    topics: normalizeTopics(repo),
    fork: !!repo.fork,
    private: !!repo.private,
    isTemplate: !!repo.is_template,
  };
}

function computeStats(items) {
  const lang = new Map();
  const lic = new Map();
  const years = new Map();
  const starBuckets = { under1k: 0, from1k: 0, from10k: 0, from50k: 0 };
  let forks = 0;
  let templates = 0;
  let withLicense = 0;

  for (const it of items) {
    const langKey = it.language || '其他';
    lang.set(langKey, (lang.get(langKey) || 0) + 1);
    if (it.license) {
      lic.set(it.license, (lic.get(it.license) || 0) + 1);
      withLicense += 1;
    }
    const y = (it.starredAt || '').slice(0, 4);
    if (y) years.set(y, (years.get(y) || 0) + 1);
    if (it.fork) forks += 1;
    if (it.isTemplate) templates += 1;
    const s = it.stars || 0;
    if (s < 1000) starBuckets.under1k += 1;
    else if (s < 10000) starBuckets.from1k += 1;
    else if (s < 50000) starBuckets.from10k += 1;
    else starBuckets.from50k += 1;
  }

  const sortDesc = (entries) =>
    [...entries]
      .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'zh-CN'))
      .map(([name, count]) => ({ name, count }));

  const starredByYear = [...years.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([year, count]) => ({ year, count }));

  return {
    totals: {
      total: items.length,
      languages: lang.size,
      licenses: lic.size,
      withLicense,
      forks,
      templates,
    },
    topLanguages: sortDesc(lang).slice(0, 5),
    topLicenses: sortDesc(lic).slice(0, 5),
    licenses: sortDesc(lic),
    starredByYear,
    starBuckets: [
      { key: 'under1k', count: starBuckets.under1k },
      { key: 'from1k', count: starBuckets.from1k },
      { key: 'from10k', count: starBuckets.from10k },
      { key: 'from50k', count: starBuckets.from50k },
    ],
  };
}

function writeStarsJson(stars, owner, repoName, generatedAt, galaxy) {
  const defaultSort = mapLegacySort(config.pageConfig.defaultSort || 'recently_starred');
  const items = stars.map(normalizeStarItem);
  const payload = {
    generatedAt,
    owner,
    repoName,
    total: items.length,
    stats: computeStats(items),
    ui: {
      siteName: config.pageConfig.siteName || 'Stars',
      defaultSort,
      defaultUiLocale: normalizeUiLocale(config.pageConfig.defaultUiLocale),
      virtualRowHeight: config.pageConfig.virtualRowHeight || 140,
      searchDebounceMs: config.pageConfig.searchDebounceMs || 300,
      showLanguage: config.pageConfig.showLanguage !== false,
      showStarsCount: config.pageConfig.showStarsCount !== false,
      showLicense: config.pageConfig.showLicense !== false,
    },
    items,
    galaxy: galaxy || null,
  };
  fs.mkdirSync(path.dirname(STARS_JSON_PATH), { recursive: true });
  fs.writeFileSync(STARS_JSON_PATH, JSON.stringify(payload), 'utf8');
}

async function computeGalaxyLayoutForItems(items) {
  if (!items.length) return null;
  const started = Date.now();
  const { computeGalaxyLayout } = await import('./scripts/compute-galaxy-layout.mjs');
  const galaxy = computeGalaxyLayout(items);
  const sec = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`🌌 星云力导向布局已预计算（${sec}s，${items.length} 颗星）`);
  return galaxy;
}

function readToolVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : '';
  } catch {
    return '';
  }
}

function writeSiteJson(owner, repoName, generatedAt) {
  fs.mkdirSync(path.dirname(SITE_JSON_PATH), { recursive: true });
  fs.writeFileSync(
    SITE_JSON_PATH,
    JSON.stringify(
      {
        owner,
        repoName,
        title: config.pageConfig.siteName || 'Stars',
        generatedAt,
        toolRepoOwner: config.pageConfig.toolRepoOwner || 'OXOYO',
        toolRepoName: config.pageConfig.toolRepoName || 'stars',
        toolVersion: readToolVersion(),
      },
      null,
      2
    ),
    'utf8'
  );
}

async function main() {
  const repoEnv = resolveRepoEnv();
  const { owner, source } = await resolveStarOwner(repoEnv);
  const { repoName } = repoEnv;

  if (!owner) {
    const toolOwner = config.pageConfig.toolRepoOwner || 'OXOYO';
    const toolRepo = config.pageConfig.toolRepoName || 'stars';
    console.error('❌ 无法确定要拉取 Star 的 GitHub 用户');
    console.error(`   当前 origin 指向工具仓库 ${toolOwner}/${toolRepo} 时，请任选其一：`);
    console.error('   1. OWNER=你的用户名 npm run generate');
    console.error('   2. 设置 GITHUB_TOKEN（将自动识别登录用户）');
    console.error('   3. 安装并登录 GitHub CLI：gh auth login');
    console.error('   或 Fork 后 clone 你自己的仓库（origin 为你的用户名/<仓库名>）');
    process.exit(1);
  }

  logOwnerSource(owner, source);
  console.log(`📁 站点仓库名：${repoName}`);

  try {
    console.log(`🔍 开始拉取 @${owner} 的 Star 列表…`);
    const stars = await fetchStars(owner);
    const generatedAt = new Date().toISOString();
    const items = stars.map(normalizeStarItem);
    let galaxy = null;
    try {
      galaxy = await computeGalaxyLayoutForItems(items);
    } catch (layoutError) {
      console.warn('⚠️  星云布局预计算失败，前端将回退为实时计算：', layoutError.message || layoutError);
    }
    writeStarsJson(stars, owner, repoName, generatedAt, galaxy);
    writeSiteJson(owner, repoName, generatedAt);
    console.log(`✅ 已生成 web/public/stars.json（${stars.length} 个仓库）与 site.json`);
  } catch (error) {
    console.error('❌ 失败：', formatGenerateError(error));
    process.exit(1);
  }
}

main();

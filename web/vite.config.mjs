import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoSlug = (process.env.REPO_NAME || 'stars').replace(/^\/+|\/+$/g, '');

function readToolVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : '';
  } catch {
    return '';
  }
}

function loadDeployConfig() {
  const configPath = path.join(__dirname, '..', 'config.json');
  try {
    const file = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return file.deployConfig || {};
  } catch {
    return {};
  }
}

/** Pages 构建时的资源前缀：读 config.json deployConfig.pagesBase */
function resolvePagesBase() {
  if (process.env.VITE_PAGES !== 'true') return '/';

  const pagesBase = String(loadDeployConfig().pagesBase ?? 'repo').trim();
  const key = pagesBase.toLowerCase();

  if (key === 'root' || key === '/') return '/';

  if (pagesBase.startsWith('/')) {
    return pagesBase.endsWith('/') ? pagesBase : `${pagesBase}/`;
  }

  const slug = repoSlug || 'stars';
  return `/${slug}/`;
}

function readSiteName() {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
    const name = config?.pageConfig?.siteName;
    return typeof name === 'string' && name.trim() ? name.trim() : 'Stars';
  } catch {
    return 'Stars';
  }
}

const defaultSiteTitle = readSiteName();
const base = resolvePagesBase();

/** app.css 体量大，Vite CSS HMR 偶发把样式更新成空字符串，导致页面「裸奔」布局 */
function starsCssFullReload() {
  return {
    name: 'stars-css-full-reload',
    handleHotUpdate({ file, server }) {
      if (file.replace(/\\/g, '/').endsWith('/src/styles/app.css')) {
        server.ws.send({ type: 'full-reload', path: '*' });
        return [];
      }
    },
  };
}

export default defineConfig({
  root: __dirname,
  base,
  publicDir: path.join(__dirname, 'public'),
  define: {
    __STARS_TOOL_VERSION__: JSON.stringify(readToolVersion()),
    __STARS_DEFAULT_SITE_TITLE__: JSON.stringify(defaultSiteTitle),
  },
  server: {
    host: true,
    port: Number(process.env.PORT) || 4173,
    strictPort: true,
  },
  build: {
    outDir: path.join(__dirname, 'dist'),
    emptyOutDir: true,
  },
  plugins: [
    vue(),
    starsCssFullReload(),
    {
      name: 'stars-inject-site-title',
      transformIndexHtml(html) {
        return html.replace(/<title>.*?<\/title>/, `<title>${defaultSiteTitle}</title>`);
      },
    },
  ],
});

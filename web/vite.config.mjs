import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoSlug = (process.env.REPO_NAME || 'stars').replace(/^\/+|\/+$/g, '');

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

const base = resolvePagesBase();

export default defineConfig({
  root: __dirname,
  base,
  publicDir: path.join(__dirname, 'public'),
  server: {
    port: Number(process.env.PORT) || 4173,
    strictPort: true,
  },
  build: {
    outDir: path.join(__dirname, 'dist'),
    emptyOutDir: true,
  },
  plugins: [vue()],
});

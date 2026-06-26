import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeGalaxyLayout } from './compute-galaxy-layout.mjs';
import { expandReposToVirtualStars } from '../web/src/galaxy/virtual-stars.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STARS_JSON_PATH = path.join(__dirname, '../web/public/stars.json');
const GALAXY_JSON_PATH = path.join(__dirname, '../web/public/galaxy.json');

if (!fs.existsSync(STARS_JSON_PATH)) {
  console.error('❌ 未找到 web/public/stars.json，请先运行 npm run generate');
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(STARS_JSON_PATH, 'utf8'));
const items = payload.items || [];
if (!items.length) {
  console.error('❌ stars.json 中没有 items');
  process.exit(1);
}

const started = Date.now();
const virtualStars = expandReposToVirtualStars(items);
console.log(`🌌 正在为 ${items.length} 个仓库 / ${virtualStars.length} 颗虚拟星预计算分层摆位…`);
const galaxy = computeGalaxyLayout(items);
fs.writeFileSync(GALAXY_JSON_PATH, JSON.stringify(galaxy), 'utf8');
const sec = ((Date.now() - started) / 1000).toFixed(1);
console.log(`✅ 已写入 galaxy.json（${sec}s）`);

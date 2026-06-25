import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeGalaxyLayout } from './compute-galaxy-layout.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STARS_JSON_PATH = path.join(__dirname, '../web/public/stars.json');

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
console.log(`🌌 正在为 ${items.length} 颗星预计算力导向布局…`);
payload.galaxy = computeGalaxyLayout(items);
fs.writeFileSync(STARS_JSON_PATH, JSON.stringify(payload), 'utf8');
const sec = ((Date.now() - started) / 1000).toFixed(1);
console.log(`✅ 已写入 stars.json.galaxy（${sec}s）`);

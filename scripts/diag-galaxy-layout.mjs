import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildGalaxyVirtualIndexMap,
  extractVirtualLayoutPositions,
  hasValidGalaxyLayout,
  isVirtualGalaxyLayout,
} from '../web/src/galaxy/layout-payload.js';
import { expandReposToVirtualStars } from '../web/src/galaxy/virtual-stars.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const stars = JSON.parse(fs.readFileSync(path.join(root, '../web/public/stars.json'), 'utf8'));
const galaxy = JSON.parse(fs.readFileSync(path.join(root, '../web/public/galaxy.json'), 'utf8'));
const items = stars.items || [];

console.log('galaxy valid', hasValidGalaxyLayout(galaxy), 'virtual', isVirtualGalaxyLayout(galaxy));
const virtualStars = expandReposToVirtualStars(items);
const map = buildGalaxyVirtualIndexMap(virtualStars);
console.log('virtualStars', virtualStars.length, 'map', map.size);

const extracted = extractVirtualLayoutPositions(virtualStars, galaxy, map);
console.log('extract ok', !!extracted, 'anchor', extracted?.anchorIndex);

if (extracted) {
  const pos = extracted.positions;
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  let same = 0;
  const ax = pos[0], ay = pos[1], az = pos[2];
  for (let i = 0; i < virtualStars.length; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    if (x === ax && y === ay && z === az) same++;
    minx = Math.min(minx, x); maxx = Math.max(maxx, x);
    miny = Math.min(miny, y); maxy = Math.max(maxy, y);
  }
  console.log('extracted span', maxx - minx, maxy - miny, 'same', same);
}

// Compare repo-only positions from galaxy if we wrongly read v3 as repo
const repoCount = items.length;
const wrongRepo = galaxy.positions.length === repoCount * 3;
console.log('positions length', galaxy.positions.length, 'repo*3', repoCount * 3, 'wrongRepoLayout', wrongRepo);

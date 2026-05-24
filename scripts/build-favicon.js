/**
 * 从 web/public/favicon.svg 生成多尺寸 favicon.ico（16/32/48）
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const toIco = require('to-ico');

const root = path.resolve(__dirname, '..');
const svgPath = path.join(root, 'web/public/favicon.svg');
const icoPath = path.join(root, 'web/public/favicon.ico');

async function main() {
  const svg = fs.readFileSync(svgPath);
  const sizes = [16, 32, 48];
  const pngs = await Promise.all(
    sizes.map((size) => sharp(svg).resize(size, size).png().toBuffer())
  );
  const ico = await toIco(pngs);
  fs.writeFileSync(icoPath, ico);
  console.log(`Wrote ${icoPath} (${ico.length} bytes, sizes: ${sizes.join(', ')})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

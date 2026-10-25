/* Resizes site preview images to 900px wide WebP into public/sites/ and updates lib/site-images.json.
   Usage: node scripts/import-site-images.mjs id=path/to/file.png [id=...] */
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const manifestPath = new URL('../lib/site-images.json', import.meta.url);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
for (const arg of process.argv.slice(2)) {
  const [id, file] = arg.split('=');
  const out = new URL(`../public/sites/${id}.webp`, import.meta.url);
  const info = await sharp(file).resize({ width: 900 }).webp({ quality: 82 }).toFile(fileURLToPath(out));
  manifest[id] = { src: `/sites/${id}.webp`, width: info.width, height: info.height };
  console.log(id, info.width + 'x' + info.height, Math.round(info.size / 1024) + 'KB');
}
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

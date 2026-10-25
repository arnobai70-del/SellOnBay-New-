/*
 * Renders the clip behind the home hero (public/video/marketplace-wall.mp4) from scripts/hero-video-scene.html:
 * our own product pictures in browser windows drifting past. Every motion finishes whole cycles, so it loops cleanly.
 *
 *   node scripts/hero-video-render.cjs /tmp/frames 500        (500 frames = 20 s at 25 fps)
 *   ffmpeg -framerate 25 -i /tmp/frames/f%04d.png -c:v libx264 -preset slow -crf 31 -pix_fmt yuv420p -movflags +faststart -an public/video/marketplace-wall.mp4
 *   ffmpeg -i /tmp/frames/f0000.png -c:v libwebp -quality 72 public/video/marketplace-wall-poster.webp
 *
 * Needs Playwright's Chromium (set PW_CHROMIUM to its path if it is not found by itself).
 */
const path = require('node:path');
const { mkdirSync } = require('node:fs');
const { chromium } = require('playwright');

const [out, frames = '500'] = process.argv.slice(2);
if (!out) throw new Error('usage: node scripts/hero-video-render.cjs <frames-dir> [frames]');
mkdirSync(out, { recursive: true });

(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto('file://' + path.join(__dirname, 'hero-video-scene.html'));
  await p.waitForTimeout(800);
  for (let f = 0; f < +frames; f++) {
    await p.evaluate((t) => window.render(t), f / +frames);
    await p.screenshot({ path: path.join(out, `f${String(f).padStart(4, '0')}.png`) });
  }
  await b.close();
})();

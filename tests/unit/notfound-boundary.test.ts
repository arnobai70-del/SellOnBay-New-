import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * A page that calls notFound() must not sit under a loading.tsx: the loading screen starts the response with status 200, so the 404 page
 * would be served as 200 (found in the browser suite on the admin SEO editors). Such pages go in app/(dash)/(exact)/dashboard.
 */
const app = path.join(__dirname, '..', '..', 'app');
function pages(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) pages(p, out);
    else if (e.name === 'page.tsx') out.push(p);
  }
  return out;
}
function loadingAbove(file: string): string | null {
  for (let d = path.dirname(file); d.startsWith(app); d = path.dirname(d)) if (fs.existsSync(path.join(d, 'loading.tsx'))) return path.relative(app, d);
  return null;
}

describe('pages that can be a 404 answer a real 404', () => {
  it('no page that calls notFound() is under a loading screen', () => {
    const wrong = pages(app)
      .filter((f) => /\bnotFound\(\)/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => [path.relative(app, f), loadingAbove(f)])
      .filter(([, l]) => l);
    expect(wrong).toEqual([]);
  });
  it('the dashboard loading screen is still there for the other dashboard pages', () => {
    expect(fs.existsSync(path.join(app, '(dash)', 'dashboard', 'loading.tsx'))).toBe(true);
  });
});

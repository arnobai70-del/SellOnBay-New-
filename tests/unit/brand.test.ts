import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BRAND_DOMAIN, BRAND_EMAIL, BRAND_NAME } from '@/lib/brand';

const root = path.join(__dirname, '..', '..');
const walk = (d: string, out: string[] = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|css|md|mjs|cjs|json)$/.test(e.name)) out.push(p);
  }
  return out;
};

describe('the product name', () => {
  it('is SellOnBay on sellonbay.com', () => {
    expect(BRAND_NAME).toBe('SellOnBay');
    expect(BRAND_DOMAIN).toBe('sellonbay.com');
    expect(BRAND_EMAIL).toBe('support@sellonbay.com');
  });
  it('the old name does not appear in the code, the pages or the docs (old migrations and the old prototype keep their history)', () => {
    const dirs = ['app', 'components', 'lib', 'emails', 'docs', 'tests', 'scripts'].map((d) => path.join(root, d)).filter((d) => fs.existsSync(d));
    const files = [...dirs.flatMap((d) => walk(d)), path.join(root, 'README.md'), path.join(root, 'CLAUDE.md')].filter((f) => !f.endsWith('brand.test.ts'));
    const hits = files.filter((f) => /Launchbay|LaunchBay/.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(root, f));
    expect(hits).toEqual([]);
  });
});

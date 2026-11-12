import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { placeholderProblem } from '@/lib/i18n/catalog';
// @ts-expect-error plain JavaScript module without types
import { extract } from '../../scripts/i18n-extract.mjs';

/*
 * The interface words written as tx('English') (lib/i18n/tx.ts, i18n phase 2): the catalogue matches the code, every bundled language has every
 * word with the same {placeholders}, and no tx() call hides its text from the extractor.
 */
const LANGS = ['bn', 'ar', 'hi', 'es', 'fr', 'de', 'pt'];
const catalog = JSON.parse(readFileSync('lib/i18n/strings/catalog.json', 'utf8')) as { strings: Record<string, { client: boolean }> };
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? (n === 'node_modules' || n.startsWith('.') ? [] : walk(p)) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });

describe('tx() strings', () => {
  it('the catalogue is up to date (npm run i18n:extract)', () => {
    expect(Object.keys(extract().strings)).toEqual(Object.keys(catalog.strings));
  });
  it('every language has every string, none extra, the same placeholders', () => {
    const en = Object.keys(catalog.strings);
    for (const lang of LANGS) {
      const d = JSON.parse(readFileSync(`lib/i18n/strings/${lang}.json`, 'utf8')) as Record<string, string>;
      expect(
        en.filter((s) => !d[s]?.trim()),
        `${lang} missing`,
      ).toEqual([]);
      expect(
        Object.keys(d).filter((s) => !(s in catalog.strings)),
        `${lang} extra`,
      ).toEqual([]);
      for (const s of en) expect(placeholderProblem(s, d[s]), `${lang}: ${s}`).toBeNull();
    }
  });
  it('tx() is always called with plain text the extractor can read (no template or variable)', () => {
    const bad: string[] = [];
    for (const f of ['app', 'components', 'lib', 'emails'].flatMap(walk)) {
      if (f.includes(`i18n${path.sep}tx.ts`) || f.endsWith(`i18n${path.sep}T.tsx`)) continue; // the helpers themselves take a variable
      for (const m of readFileSync(f, 'utf8').matchAll(/\btx\(\s*([^'"\s)])/g)) bad.push(`${f}: tx(${m[1]}…`);
    }
    expect(bad).toEqual([]);
  });
});

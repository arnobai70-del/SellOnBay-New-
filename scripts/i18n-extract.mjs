// npm run i18n:extract — lists every interface word written as tx('…') in app/, components/, lib/ and emails/ into lib/i18n/strings/catalog.json,
// with whether a client component ('use client') uses it (only those are sent to the browser). Run it after adding or changing words;
// tests/unit/i18n-strings.test.ts fails while the catalogue is out of date or a bundled language lacks a word.
// With --check it changes nothing and exits 1 when the catalogue is out of date.
import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['app', 'components', 'lib', 'emails'];
const OUT = path.join('lib', 'i18n', 'strings', 'catalog.json');
const CALL = /\btx\(\s*(['"])((?:\\.|(?!\1)[^\\\n])*)\1/g;
const T_PROP = /<T\s+s=\{\s*(['"])((?:\\.|(?!\1)[^\\\n])*)\1\s*\}/g; // <T s={'…'} /> (components/i18n/T.tsx), also as Prettier breaks long ones

const walk = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
        const p = path.join(dir, d.name);
        return d.isDirectory() ? (d.name === 'node_modules' || d.name.startsWith('.') ? [] : walk(p)) : /\.(ts|tsx)$/.test(d.name) ? [p] : [];
      })
    : [];

export function extract() {
  const strings = {};
  for (const file of ROOTS.flatMap(walk)) {
    if (file.includes(`${path.sep}i18n${path.sep}tx.ts`)) continue;
    const src = fs.readFileSync(file, 'utf8');
    const client = /^\s*['"]use client['"]/.test(src);
    for (const m of [...src.matchAll(CALL), ...src.matchAll(T_PROP).map((x) => Object.assign(x, { t: true }))]) {
      const text = m[2].replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n');
      if (!text.trim()) continue;
      const e = (strings[text] ??= { client: false, files: [] });
      e.client ||= client || !!m.t; // <T> is a client component: its words go to the browser
      const rel = file.split(path.sep).join('/');
      if (!e.files.includes(rel)) e.files.push(rel);
    }
  }
  const sorted = Object.fromEntries(
    Object.keys(strings)
      .sort()
      .map((k) => [k, { client: strings[k].client, files: strings[k].files.sort() }]),
  );
  return { strings: sorted };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
  const next = JSON.stringify(extract(), null, 1) + '\n';
  const now = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (process.argv.includes('--check')) {
    if (now !== next) {
      console.error('lib/i18n/strings/catalog.json is out of date: run npm run i18n:extract');
      process.exit(1);
    }
    console.log('catalogue up to date');
  } else {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, next);
    console.log(`${Object.keys(JSON.parse(next).strings).length} strings written to ${OUT}`);
  }
}

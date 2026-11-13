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

/*
 * Which files a public page can reach through its imports (app/ outside the (dash) group: the storefront, sign-in, legal, errors). A client
 * string used only by files that no public page reaches is a dashboard word ("dash"): the (dash) layout sends those, the root layout only the
 * "public" ones, so a visitor's page carries no admin words (i18n phase 2, performance).
 */
const IMPORT = /(?:^|[\s;])(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/gm;
function resolveImport(from, spec) {
  const base = spec.startsWith('@/') ? spec.slice(2) : spec.startsWith('.') ? path.join(path.dirname(from), spec) : null;
  if (base === null) return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return path.normalize(c);
  return null;
}
function publicReach(files) {
  const deps = new Map();
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    deps.set(path.normalize(f), [...src.matchAll(IMPORT)].map((m) => resolveImport(f, m[1] ?? m[2] ?? m[3])).filter(Boolean));
  }
  const dash = `app${path.sep}(dash)${path.sep}`;
  const seen = new Set();
  const stack = files.map((f) => path.normalize(f)).filter((f) => f.startsWith(`app${path.sep}`) && !f.startsWith(dash) && !f.startsWith(`app${path.sep}api${path.sep}`));
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const d of deps.get(f) ?? []) if (!seen.has(d)) stack.push(d);
  }
  return seen;
}

export function extract() {
  const strings = {};
  const all = ROOTS.flatMap(walk);
  const reach = publicReach(all);
  for (const file of all) {
    if (file.includes(`${path.sep}i18n${path.sep}tx.ts`)) continue;
    const src = fs.readFileSync(file, 'utf8');
    const client = /^\s*['"]use client['"]/.test(src);
    for (const m of [...src.matchAll(CALL), ...src.matchAll(T_PROP).map((x) => Object.assign(x, { t: true }))]) {
      const text = m[2].replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n');
      if (!text.trim()) continue;
      const e = (strings[text] ??= { client: false, pub: false, files: [] });
      const isClient = client || !!m.t; // <T> is a client component: its words go to the browser
      e.client ||= isClient;
      e.pub ||= isClient && reach.has(path.normalize(file));
      const rel = file.split(path.sep).join('/');
      if (!e.files.includes(rel)) e.files.push(rel);
    }
  }
  const sorted = Object.fromEntries(
    Object.keys(strings)
      .sort()
      .map((k) => [k, { client: strings[k].client, ...(strings[k].client ? { area: strings[k].pub ? 'public' : 'dash' } : {}), files: strings[k].files.sort() }]),
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

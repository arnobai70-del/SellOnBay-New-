/*
 * Builds app/sob.css from the <style> blocks of design-reference/*.html (owner, 2026-11-09: port the design, do not re-create it).
 * The rules are copied as they are; only the scope is added, because class names like .btn and .glass are shared between pages:
 *   - rules every dashboard file has   -> under .sob-d   (admin*, buyer*, seller-*)
 *   - rules every public file has      -> under .sob-p   (the other pages)
 *   - rules only some files have       -> once, under [data-sob="<file>"] or :is() of the files that carry them
 * "body" and ":root" become the scope element itself. A keyframe that one file defines differently from the common one gets the file's name
 * as a suffix, so every page moves exactly like its file. Run: node scripts/design-css.mjs
 */
import fs from 'node:fs';
import postcss from 'postcss';

const DIR = 'design-reference/';
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.html'));
const isDash = (f) => /^(admin|buyer)/.test(f) || /^seller-/.test(f);
const page = (f) => f.replace(/\.html$/, '');
const fontFix = (v) => v.replace(/'Inter'/g, 'var(--font-inter)'); // the bundled Inter (components/glass/font.ts)

const sheets = {};
for (const f of files) {
  const html = fs.readFileSync(DIR + f, 'utf8');
  sheets[f] = postcss.parse([...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n'));
}

/* Each rule as a key: the at-rules around it, its selector and its body. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();
function rulesOf(root) {
  const out = [];
  root.walkRules((r) => {
    if (r.parent.type === 'atrule' && /keyframes$/i.test(r.parent.name)) return;
    const ctx = [];
    for (let p = r.parent; p && p.type === 'atrule'; p = p.parent) ctx.unshift(`@${p.name} ${norm(p.params)}`);
    const body = r.nodes
      .map((d) => (d.type === 'decl' ? `${d.prop}:${norm(d.value)}${d.important ? '!important' : ''}` : ''))
      .filter(Boolean)
      .join(';');
    out.push({ ctx, sel: norm(r.selector), body, key: `${ctx.join('|')}§${norm(r.selector)}§${body}` });
  });
  return out;
}
function keyframesOf(root) {
  const out = {};
  root.walkAtRules(/keyframes$/i, (a) => (out[a.params.trim()] = norm(a.toString())));
  return out;
}

const groups = { d: files.filter(isDash), p: files.filter((f) => !isDash(f)) };
const rules = Object.fromEntries(files.map((f) => [f, rulesOf(sheets[f])]));
const frames = Object.fromEntries(files.map((f) => [f, keyframesOf(sheets[f])]));

/* Keyframes: the version most files use keeps the design's name; others get "--<page>". */
const kfCount = {};
for (const f of files) for (const [n, t] of Object.entries(frames[f])) ((kfCount[n] ??= {})[t] ??= []).push(f);
const kfName = {}; // file -> name -> name used
const kfOut = [];
for (const [n, versions] of Object.entries(kfCount)) {
  const sorted = Object.entries(versions).sort((a, b) => b[1].length - a[1].length);
  sorted.forEach(([text, fs_], i) => {
    const name = i === 0 ? n : `${n}--${page(fs_[0])}`;
    for (const f of fs_) (kfName[f] ??= {})[n] = name;
    kfOut.push(text.replace(/^@(-webkit-)?keyframes\s+[\w-]+/, `@keyframes ${name}`));
  });
}
const renameAnim = (f, body) => body.replace(/\b(animation(?:-name)?):([^;]+)/g, (m, prop, v) => `${prop}:${v.replace(/\bsob-[\w-]+/g, (n) => kfName[f]?.[n] ?? n)}`);

/* A selector inside a scope: body/:root/html become the scope element; * and everything else go under it. */
function scoped(sel, scope) {
  return sel
    .split(',')
    .map((s) => s.trim())
    .map((s) => {
      if (/^(html|body|:root)$/.test(s)) return scope;
      const m = s.match(/^(html|body|:root)\s+(.*)$/);
      if (m) return `${scope} ${m[2]}`;
      return `${scope} ${s}`;
    })
    .join(',');
}

const out = [];
const emit = (ctx, sel, body) => {
  let block = `${sel}{${body}}`;
  for (const c of [...ctx].reverse()) block = `${c}{${block}}`;
  out.push(block);
};
for (const [g, list] of Object.entries(groups)) {
  const counts = {};
  for (const f of list) for (const k of new Set(rules[f].map((r) => r.key))) counts[k] = (counts[k] ?? 0) + 1;
  const base = new Set(Object.keys(counts).filter((k) => counts[k] === list.length));
  // base rules, in the order of the first file (the cascade order matters)
  const seen = new Set();
  for (const r of rules[list[0]]) if (base.has(r.key) && !seen.has(r.key)) (seen.add(r.key), emit(r.ctx, scoped(r.sel, `.sob-${g}`), fontFix(renameAnim(list[0], r.body))));
  // the other rules, once each, for the files that have them (in the order the files list them, after the base)
  const own = new Map();
  for (const f of list)
    for (const r of rules[f]) {
      if (base.has(r.key)) continue;
      const k = r.key + '§' + JSON.stringify(Object.entries(kfName[f] ?? {}).filter(([n, v]) => n !== v && r.body.includes(n)));
      if (!own.has(k)) own.set(k, { r, f, files: [] });
      if (!own.get(k).files.includes(f)) own.get(k).files.push(f);
    }
  for (const { r, f, files: fl } of own.values()) {
    const where = fl.length === 1 ? `[data-sob="${page(fl[0])}"]` : `:is(${fl.map((x) => `[data-sob="${page(x)}"]`).join(',')})`;
    emit(r.ctx, scoped(r.sel, `.sob-${g}${where}`), fontFix(renameAnim(f, r.body)));
  }
}

const header = '/* Generated by scripts/design-css.mjs from design-reference/ (the design, ported as it is). Do not edit by hand. */\n';
const css = header + kfOut.join('\n') + '\n' + out.join('\n') + '\n';
fs.writeFileSync('app/sob.css', css);
console.log(`app/sob.css: ${(css.length / 1024).toFixed(1)} KB, ${kfOut.length} keyframes, ${out.length} rules`);

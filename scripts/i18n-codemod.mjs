// node scripts/i18n-codemod.mjs <file-or-folder>... [--dry]
// i18n phase 2: wraps the visible English words of .tsx files for translation (lib/i18n/tx.ts), using the TypeScript parser, never regexes on code:
//   - JSX text (with simple values next to it) becomes <T s={'Pay {amount} now'} v={{ amount: … }} /> (components/i18n/T.tsx, server or client);
//   - placeholder / title / aria-label / alt strings become {tx('…')}: useTx() in a client component, await getI18n() in an async server one;
//     elsewhere they are left in English and listed.
// Never touched: code, <code>/<pre>/<script>/<style>, words without letters, addresses, emails, prices, the brand name, already wrapped text.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ts = createRequire(path.join(process.cwd(), 'package.json'))('typescript');
const ATTRS = new Set(['placeholder', 'title', 'aria-label', 'alt']);
const SKIP_TAGS = new Set(['code', 'pre', 'script', 'style', 'T', 'kbd', 'samp']);
const dry = process.argv.includes('--dry');
const targets = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const walk = (p) => (fs.statSync(p).isDirectory() ? fs.readdirSync(p).flatMap((n) => walk(path.join(p, n))) : p.endsWith('.tsx') ? [p] : []);
const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  middot: '·',
  rarr: '→',
  larr: '←',
  copy: '©',
  trade: '™',
  reg: '®',
  times: '×',
};
const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e.toLowerCase()] ?? m),
  );
// JSX whitespace rules (what React renders): lines are trimmed at their inner edges, whitespace-only lines dropped, the rest joined with one
// space; a run of whitespace that holds a newline at either end disappears. Entities are decoded, since the result becomes a JavaScript string.
const jsxText = (raw) =>
  decode(
    raw
      .split(/\r?\n/)
      .map((l, i, all) => (all.length === 1 ? l : i === 0 ? l.trimEnd() : i === all.length - 1 ? l.trimStart() : l.trim()))
      .filter((l, i, all) => all.length === 1 || l.length)
      .join(' '),
  );
const translatable = (s) => {
  const t = s.trim();
  if (!/[A-Za-z]{2,}/.test(t)) return false; // no words
  if (/^(SellOnBay|USD|OK|ID|URL|API|CSV|PDF|ZIP|SEO|GA4|FAQ)$/.test(t)) return false;
  if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(t) || /^https?:\/\//.test(t) || /^\/[\w/-]*$/.test(t)) return false; // email, link, path
  if (/^[$€£]?\s?[\d.,]+\s?%?$/.test(t)) return false;
  return true;
};
const exprIsSimple = (e) => {
  let ok = true;
  const visit = (n) => {
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n)) ok = false;
    n.forEachChild(visit);
  };
  visit(e);
  return ok;
};
const tagName = (el) => (ts.isJsxElement(el) ? el.openingElement.tagName.getText() : ts.isJsxSelfClosingElement(el) ? el.tagName.getText() : '');
const isComponentFn = (n) => {
  const name = ts.isFunctionDeclaration(n) ? n.name?.text : ts.isVariableDeclaration(n.parent) ? n.parent.name.getText() : '';
  return /^[A-Z]/.test(name ?? '') || (ts.isFunctionDeclaration(n) && n.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword));
};
const enclosingComponent = (n) => {
  for (let p = n.parent; p; p = p.parent) if ((ts.isFunctionDeclaration(p) || ts.isArrowFunction(p) || ts.isFunctionExpression(p)) && isComponentFn(p)) return p;
  return null;
};

const report = { files: 0, texts: 0, attrs: 0, attrsLeft: [] };
for (const file of targets.flatMap(walk)) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const client = /^\s*['"]use client['"]/.test(src);
  const edits = []; // { start, end, text }
  const hooks = new Map(); // component node -> 'client' | 'server'
  let usesT = false;

  const visit = (node) => {
    // children runs: text and simple values become one sentence
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
      const name = ts.isJsxElement(node) ? tagName(node) : '';
      if (!SKIP_TAGS.has(name)) {
        const kids = node.children;
        let run = [];
        const flush = () => {
          const hasWords = run.some((k) => ts.isJsxText(k) && translatable(decode(k.text)));
          if (hasWords) {
            let s = '';
            const vars = [];
            for (const k of run) {
              if (ts.isJsxText(k)) s += jsxText(k.text);
              else if (ts.isStringLiteral(k.expression))
                s += k.expression.text; // {' '} and the like are part of the sentence
              else {
                const e = k.expression;
                const base = e && ts.isIdentifier(e) ? e.text : e && ts.isPropertyAccessExpression(e) ? e.name.text : `v${vars.length}`;
                let key = base.replace(/[^\w]/g, '') || `v${vars.length}`;
                while (vars.some((v) => v.key === key)) key += '2';
                vars.push({ key, expr: e.getText() });
                s += `{${key}}`;
              }
            }
            const lead = s.match(/^\s*/)[0].length ? ' ' : '';
            const trail = s.match(/\s*$/)[0].length ? ' ' : '';
            const text = s.trim().replace(/\s+/g, ' ');
            const first = run[0];
            const last = run[run.length - 1];
            const v = vars.length ? ` v={{ ${vars.map((x) => (x.key === x.expr ? x.key : `${x.key}: ${x.expr}`)).join(', ')} }}` : '';
            // from the true start of the first node (JSX text has no trivia: its whitespace is part of it)
            edits.push({ start: first.pos, end: last.getEnd(), text: `${lead ? "{' '}" : ''}<T s={${q(text)}}${v} />${trail ? "{' '}" : ''}` });
            usesT = true;
            report.texts++;
          }
          run = [];
        };
        for (const k of kids) {
          if (ts.isJsxText(k)) run.push(k);
          else if (ts.isJsxExpression(k) && k.expression && exprIsSimple(k.expression)) run.push(k);
          else flush();
        }
        flush();
      }
    }
    // attributes
    if (ts.isJsxAttribute(node) && ATTRS.has(node.name.getText()) && node.initializer && ts.isStringLiteral(node.initializer) && translatable(node.initializer.text)) {
      const comp = enclosingComponent(node);
      const isAsync = comp?.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
      if (comp && ts.isBlock(comp.body) && (client || isAsync)) {
        edits.push({ start: node.initializer.getStart(sf), end: node.initializer.getEnd(), text: `{tx(${q(node.initializer.text)})}` });
        hooks.set(comp, client ? 'client' : 'server');
        report.attrs++;
      } else report.attrsLeft.push(`${file}: ${node.name.getText()}="${node.initializer.text}"`);
    }
    node.forEachChild(visit);
  };
  visit(sf);
  if (!edits.length) continue;
  // hooks at the top of each component body
  for (const [comp, kind] of hooks) {
    if (/\bconst (\{ )?tx\b/.test(comp.body.getText())) continue; // the component already has its words
    const body = comp.body;
    const at = body.getStart(sf) + 1;
    const line =
      kind === 'client' ? "\n  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)" : "\n  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)";
    edits.push({ start: at, end: at, text: line });
  }
  edits.sort((a, b) => b.start - a.start);
  let out = src;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  // imports after the last import (or after 'use client')
  const imports = [];
  if (usesT && !/from '@\/components\/i18n\/T'/.test(out)) imports.push("import { T } from '@/components/i18n/T';");
  if ([...hooks.values()].includes('client') && !/\buseTx\b.*from/.test(out)) imports.push("import { useTx } from '@/components/i18n/TxProvider';");
  if ([...hooks.values()].includes('server') && !/\bgetI18n\b.*from/.test(out)) imports.push("import { getI18n } from '@/lib/i18n/server';");
  if (imports.length) {
    const lastImport = [...out.matchAll(/^import [^;]+;\s*$/gm)].pop();
    const pos = lastImport ? lastImport.index + lastImport[0].length : client ? out.indexOf('\n') + 1 : 0;
    out = out.slice(0, pos) + (lastImport ? '\n' : '') + imports.join('\n') + (lastImport ? '' : '\n') + out.slice(pos);
  }
  report.files++;
  if (!dry) fs.writeFileSync(file, out);
}
console.log(JSON.stringify({ files: report.files, texts: report.texts, attrs: report.attrs, attrsLeft: report.attrsLeft.length }, null, 1));
if (report.attrsLeft.length) fs.writeFileSync(path.join(process.env.TEMP ?? '.', 'i18n-attrs-left.txt'), report.attrsLeft.join('\n'));

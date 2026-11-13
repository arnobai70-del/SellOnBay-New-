// node scripts/i18n-codemod-literals.mjs <file-or-folder>... [--dry]
// i18n phase 2, second pass: words the first pass (scripts/i18n-codemod.mjs) could not see because they sit inside an expression, such as
// {open ? 'Close' : 'Open'}, {error && 'Could not save.'} or title={edit ? 'Edit guide' : 'New guide'}. A string literal in a rendered position
// (a JSX child, or a text prop listed below; through ?:, &&, || and ??) becomes tx('…'): useTx() in a client component, await getI18n() in an
// async server one; elsewhere it is left and listed. Uses the TypeScript parser. Never touches code values, addresses, class names or keys.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ts = createRequire(path.join(process.cwd(), 'package.json'))('typescript');
const PROPS = new Set([
  'title',
  'subtitle',
  'label',
  'submit',
  'placeholder',
  'aria-label',
  'alt',
  'heading',
  'hint',
  'confirm',
  'empty',
  'description',
  'note',
  'lead',
  'intro',
  'help',
  'ok',
  'done',
  'busyText',
  'doneText',
]);
const SKIP_TAGS = new Set(['code', 'pre', 'script', 'style', 'T', 'kbd', 'samp']);
const dry = process.argv.includes('--dry');
const targets = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const walk = (p) => (fs.statSync(p).isDirectory() ? fs.readdirSync(p).flatMap((n) => walk(path.join(p, n))) : p.endsWith('.tsx') ? [p] : []);
const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
const translatable = (s) => {
  const t = s.trim();
  if (!/[A-Za-z]{2,}/.test(t)) return false;
  if (!/[A-Z]/.test(t[0]) && !/\s/.test(t)) return false; // a lower-case single token is a code value (a state, a key), not a word
  if (/^(SellOnBay|USD|OK|ID|URL|API|CSV|PDF|ZIP|SEO|GA4|FAQ|PayPal|GitHub|Google|Meta|Payoneer|Wise|bKash)$/.test(t)) return false;
  if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(t) || /^https?:\/\//.test(t) || /^\/[\w/?=&.-]*$/.test(t)) return false;
  if (/^[$€£]?\s?[\d.,]+\s?%?$/.test(t)) return false;
  return true;
};
const isComponentFn = (n) => {
  const name = ts.isFunctionDeclaration(n) ? n.name?.text : ts.isVariableDeclaration(n.parent) ? n.parent.name.getText() : '';
  return /^[A-Z]/.test(name ?? '') || (ts.isFunctionDeclaration(n) && n.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword));
};
const enclosingComponent = (n) => {
  for (let p = n.parent; p; p = p.parent) if ((ts.isFunctionDeclaration(p) || ts.isArrowFunction(p) || ts.isFunctionExpression(p)) && isComponentFn(p)) return p;
  return null;
};
const inSkippedTag = (n) => {
  for (let p = n.parent; p; p = p.parent) if (ts.isJsxElement(p) && SKIP_TAGS.has(p.openingElement.tagName.getText())) return true;
  return false;
};
// The literals an expression can render: itself, both branches of ?:, the right of &&, both sides of || and ??.
const results = (e) => {
  if (!e) return [];
  if (ts.isParenthesizedExpression(e)) return results(e.expression);
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return [e];
  if (ts.isConditionalExpression(e)) return [...results(e.whenTrue), ...results(e.whenFalse)];
  if (ts.isBinaryExpression(e)) {
    const k = e.operatorToken.kind;
    if (k === ts.SyntaxKind.AmpersandAmpersandToken) return results(e.right);
    if (k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken) return [...results(e.left), ...results(e.right)];
  }
  return [];
};

const report = { files: 0, wrapped: 0, left: [] };
for (const file of targets.flatMap(walk)) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const client = /^\s*['"]use client['"]/.test(src);
  const edits = [];
  const hooks = new Map();
  const wrap = (lit) => {
    const text = lit.text;
    if (!translatable(text)) return;
    if (text !== text.trim()) return void report.left.push(`${file}: spaced ${JSON.stringify(text)}`);
    const comp = enclosingComponent(lit);
    const isAsync = comp?.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
    if (!comp || !ts.isBlock(comp.body) || !(client || isAsync)) return void report.left.push(`${file}: ${JSON.stringify(text)}`);
    edits.push({ start: lit.getStart(sf), end: lit.getEnd(), text: `tx(${q(text)})` });
    hooks.set(comp, client ? 'client' : 'server');
    report.wrapped++;
  };
  const visit = (node) => {
    if (ts.isJsxExpression(node) && node.expression && !inSkippedTag(node)) {
      const parent = node.parent;
      if (ts.isJsxElement(parent) || ts.isJsxFragment(parent))
        results(node.expression).forEach(wrap); // a child
      else if (ts.isJsxAttribute(parent) && PROPS.has(parent.name.getText())) results(node.expression).forEach(wrap); // a text prop
    }
    node.forEachChild(visit);
  };
  visit(sf);
  if (!edits.length) continue;
  for (const [comp, kind] of hooks) {
    if (/\bconst (\{ )?tx\b|\{ tx[ ,}]/.test(comp.body.getText())) continue; // already has its words
    const at = comp.body.getStart(sf) + 1;
    edits.push({
      start: at,
      end: at,
      text: kind === 'client' ? "\n  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)" : "\n  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)",
    });
  }
  edits.sort((a, b) => b.start - a.start);
  let out = src;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  const imports = [];
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
console.log(JSON.stringify({ files: report.files, wrapped: report.wrapped, left: report.left.length }, null, 1));
if (report.left.length) fs.writeFileSync(path.join(process.env.TEMP ?? '.', 'i18n-literals-left.txt'), report.left.join('\n'));

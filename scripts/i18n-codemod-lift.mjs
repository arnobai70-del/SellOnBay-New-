// node scripts/i18n-codemod-lift.mjs <file-or-folder>... [--dry]
// i18n phase 2, fourth pass: interface words in module-level constants and helpers, which a hook cannot reach. When every use sits inside
// a client component or an async server component, the constant becomes a function of the page's words and each use passes them:
//   const TABS = [['all', 'All orders']]           ->  const TABS = (tx: Tx) => [['all', tx('All orders')]];   ...TABS(tx)...
//   function greet(h: number) { return 'Good morning' }  ->  function greet(h: number, tx: Tx) { return tx('Good morning') }  ...greet(h, tx)...
// Exported names, names used outside components and names used as a type are left and listed. The same word rules as
// scripts/i18n-codemod-general.mjs: never comparisons, object keys, data fields, class names, or anything sent away.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ts = createRequire(path.join(process.cwd(), 'package.json'))('typescript');
const dry = process.argv.includes('--dry');
const targets = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const walk = (p) => (fs.statSync(p).isDirectory() ? fs.readdirSync(p).flatMap((n) => walk(path.join(p, n))) : p.endsWith('.tsx') ? [p] : []);
const SKIP_FILES = /[\\/]legal[\\/]|opengraph-image|TemplatePage|design-preview|AppPhone|AppWindow|[\\/]i18n[\\/]/;
const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
const BRANDS = /^(SellOnBay|USD|BDT|OK|ID|URL|API|CSV|PDF|ZIP|SEO|GA4|FAQ|PayPal|GitHub|Google|Meta|Payoneer|Wise|bKash|UTC|DMCA|IBAN|POS)$/;
const sentence = (t) => /^[A-Z][a-z’']*(\s|[.,:?!…])/.test(t) && /\s/.test(t.trim()) && !/[{}<>=;`]|=>|^https?:/.test(t);
const label = (t) => sentence(t) || (/^[A-Z][a-z’']{1,}[.:?…!]?$/.test(t.trim()) && !BRANDS.test(t.trim()));
const TEXT_KEYS = new Set([
  'label',
  'title',
  'heading',
  'placeholder',
  'hint',
  'help',
  'submit',
  'empty',
  'subtitle',
  'description',
  'note',
  'lead',
  'intro',
  'confirm',
  'cta',
  'tip',
  'caption',
  'sub',
  'desc',
  'text',
  'what',
  'detail',
  'summary',
  'question',
  'answer',
  'q',
  'a',
  't',
  'd',
  'body',
  'message',
  'short',
  'long',
  'blurb',
  'tagline',
  'button',
  'unit',
]);
const DATA_KEYS = new Set([
  'value',
  'id',
  'key',
  'href',
  'slug',
  'kind',
  'type',
  'code',
  'icon',
  'variant',
  'tone',
  'status',
  'state',
  'action',
  'method',
  'url',
  'path',
  'role',
  'scope',
  'lang',
  'dir',
  'className',
  'format',
  'currency',
  'align',
  'width',
  'name',
  'field',
  'tab',
  'mode',
  'endpoint',
  'src',
  'target',
  'color',
  'style',
  'event',
  'module',
  'area',
  'doc',
  'file',
  'accept',
  'pattern',
  'flag',
  'reason',
  'sort',
  'order',
]);
const AWAY =
  /(^|\.)(fetch|stringify|log|error|warn|startsWith|endsWith|includes|indexOf|split|replace|match|test|has|get|delete|toLocaleString|join|setItem|getItem|append|post|send|insert|update|upsert|eq|select|from|rpc|querySelector|addEventListener|setAttribute|encodeURIComponent|redirect|notFound|audit)$/;
const COMPARE = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.InKeyword,
]);
const isComponentFn = (n) => {
  const name = ts.isFunctionDeclaration(n) ? n.name?.text : ts.isVariableDeclaration(n.parent) ? n.parent.name.getText() : '';
  return /^[A-Z]/.test(name ?? '') || (ts.isFunctionDeclaration(n) && n.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword));
};
const enclosingComponent = (n) => {
  for (let p = n.parent; p; p = p.parent) if ((ts.isFunctionDeclaration(p) || ts.isArrowFunction(p) || ts.isFunctionExpression(p)) && isComponentFn(p)) return p;
  return null;
};
const keep = (n, root) => {
  const p = n.parent;
  if (ts.isBinaryExpression(p) && COMPARE.has(p.operatorToken.kind)) return true;
  if (ts.isPropertyAssignment(p) && p.name === n) return true;
  if (ts.isPropertyAssignment(p) && DATA_KEYS.has(p.name.getText().replace(/['"]/g, ''))) return true;
  if (ts.isElementAccessExpression(p) || ts.isCaseClause(p) || ts.isLiteralTypeNode(p)) return true;
  for (let a = p; a && a !== root.parent; a = a.parent) {
    if (ts.isCallExpression(a) && AWAY.test(a.expression.getText())) return true;
    if (ts.isNewExpression(a) || ts.isThrowStatement(a) || ts.isTypeNode(a)) return true;
    if (ts.isParameter(a)) return true;
  }
  return false;
};
// the words a declaration holds: [{node, text}] replacements
function wordsIn(root) {
  const out = [];
  const visit = (n) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      const prop = ts.isPropertyAssignment(n.parent) ? n.parent.name.getText().replace(/['"]/g, '') : '';
      const inTuple = ts.isArrayLiteralExpression(n.parent) && n.parent.elements.indexOf(n) > 0; // [key, 'Label'] pairs
      const ok = TEXT_KEYS.has(prop) || inTuple ? label(n.text) : sentence(n.text);
      if (ok && !keep(n, root)) out.push({ node: n, text: `tx(${q(n.text)})` });
      return;
    }
    if (ts.isTemplateExpression(n) && /^[A-Z][a-z’']+ /.test(n.head.text) && !keep(n, root)) {
      const vars = [];
      let text = n.head.text;
      for (const span of n.templateSpans) {
        const e = span.expression;
        const base = ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : `v${vars.length}`;
        let key = base.replace(/[^\w]/g, '') || `v${vars.length}`;
        while (vars.some((v) => v.key === key)) key += '2';
        vars.push({ key, expr: e.getText() });
        text += `{${key}}${span.literal.text}`;
      }
      out.push({ node: n, text: `tx(${q(text)}, { ${vars.map((x) => (x.key === x.expr ? x.key : `${x.key}: ${x.expr}`)).join(', ')} })` });
      return;
    }
    n.forEachChild(visit);
  };
  visit(root);
  return out;
}

const report = { files: 0, lifted: 0, words: 0, left: [] };
for (const file of targets.flatMap(walk)) {
  if (SKIP_FILES.test(file)) continue;
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const client = /^\s*['"]use client['"]/.test(src);
  const edits = [];
  const hooks = new Map();
  const ids = [];
  const collect = (n) => {
    if (ts.isIdentifier(n)) ids.push(n);
    n.forEachChild(collect);
  };
  collect(sf);
  // a use is fine when it is a value inside a component that can have the page's words
  const usable = (id) => {
    const comp = enclosingComponent(id);
    const isAsync = comp?.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
    if (!comp || !ts.isBlock(comp.body) || !(client || isAsync)) return null;
    for (let p = id.parent; p && p !== comp; p = p.parent) if (ts.isTypeQueryNode(p) || ts.isTypeReferenceNode(p) || ts.isParameter(p)) return null; // a default value runs before the hook
    if (ts.isPropertyAccessExpression(id.parent) && id.parent.name === id) return null; // obj.NAME is another thing
    if (ts.isPropertyAssignment(id.parent) && id.parent.name === id) return null;
    if (ts.isShorthandPropertyAssignment(id.parent)) return null;
    return comp;
  };
  for (const st of sf.statements) {
    const exported = st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (exported) continue;
    // const NAME = <value> or const helper = (...) => ...
    const decls = ts.isVariableStatement(st) ? st.declarationList.declarations.filter((d) => ts.isIdentifier(d.name) && d.initializer) : [];
    const fns = ts.isFunctionDeclaration(st) && st.name && !isComponentFn(st) ? [st] : [];
    for (const d of [...decls, ...fns]) {
      const name = d.name.text;
      const init = ts.isFunctionDeclaration(d) ? d : d.initializer;
      const fnLike = ts.isFunctionDeclaration(d) || ts.isArrowFunction(init) || ts.isFunctionExpression(init);
      if (fnLike && /^[A-Z]/.test(name)) continue; // a component
      if (/^(metadata|revalidate|dynamic|runtime|config|generateMetadata)$/.test(name)) continue;
      const words = wordsIn(fnLike ? (ts.isFunctionDeclaration(d) ? d.body : init.body) : init);
      if (!words.length) continue;
      const uses = ids.filter((i) => i.text === name && i !== d.name);
      const comps = uses.map(usable);
      const callsOk = !fnLike || uses.every((u) => ts.isCallExpression(u.parent) && u.parent.expression === u);
      if (!uses.length || comps.some((c) => !c) || !callsOk || (fnLike && /\btx\b/.test(init.getText()))) {
        report.left.push(`${file}: ${name} (${words.length} words)`);
        continue;
      }
      for (const w of words) edits.push({ start: w.node.getStart(sf), end: w.node.getEnd(), text: w.text });
      report.words += words.length;
      report.lifted++;
      if (fnLike) {
        const params = ts.isFunctionDeclaration(d) ? d.parameters : init.parameters;
        const close = ts.isFunctionDeclaration(d) || params.end ? params.end : null;
        // add the last parameter: (a, b) -> (a, b, tx: Tx); () -> (tx: Tx)
        edits.push({ start: close, end: close, text: params.length ? ', tx: Tx' : 'tx: Tx' });
        for (const u of uses) {
          const call = u.parent;
          const at = call.arguments.end;
          edits.push({ start: at, end: at, text: call.arguments.length ? ', tx' : 'tx' });
        }
      } else {
        // const NAME[: T] = value  ->  const NAME = (tx: Tx)[: T] => (value)
        const typeText = d.type ? `: ${d.type.getText()}` : '';
        if (d.type) edits.push({ start: d.name.getEnd(), end: d.type.getEnd(), text: '' });
        edits.push({ start: init.getStart(sf), end: init.getStart(sf), text: `(tx: Tx)${typeText} => (` });
        edits.push({ start: init.getEnd(), end: init.getEnd(), text: ')' });
        for (const u of uses) edits.push({ start: u.getEnd(), end: u.getEnd(), text: '(tx)' });
      }
      for (const c of new Set(comps)) hooks.set(c, client ? 'client' : 'server');
    }
  }
  if (!edits.length) continue;
  for (const [comp, kind] of hooks) {
    if (/\bconst (\{ )?tx\b|\{ tx[ ,}]|\btx = /.test(comp.body.getText())) continue;
    const at = comp.body.getStart(sf) + 1;
    edits.push({
      start: at,
      end: at,
      text: kind === 'client' ? "\n  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)" : "\n  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)",
    });
  }
  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let out = src;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  const imports = [];
  if (!/import (type )?\{[^}]*\bTx\b[^}]*\} from '@\/lib\/i18n\/tx'/.test(out)) imports.push("import type { Tx } from '@/lib/i18n/tx';");
  if ([...hooks.values()].includes('client') && !/\buseTx\b.*from/.test(out)) imports.push("import { useTx } from '@/components/i18n/TxProvider';");
  if ([...hooks.values()].includes('server') && !/\bgetI18n\b.*from/.test(out)) imports.push("import { getI18n } from '@/lib/i18n/server';");
  const lastImport = [...out.matchAll(/^import [^;]+;\s*$/gm)].pop();
  const pos = lastImport ? lastImport.index + lastImport[0].length : client ? out.indexOf('\n') + 1 : 0;
  out = out.slice(0, pos) + (lastImport ? '\n' : '') + imports.join('\n') + (lastImport ? '' : '\n') + out.slice(pos);
  report.files++;
  if (!dry) fs.writeFileSync(file, out);
}
console.log(JSON.stringify({ files: report.files, lifted: report.lifted, words: report.words, left: report.left.length }, null, 1));
fs.writeFileSync(path.join(process.env.TEMP ?? '.', 'i18n-lift-left.txt'), report.left.join('\n'));

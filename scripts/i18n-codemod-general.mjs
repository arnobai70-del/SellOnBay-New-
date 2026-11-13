// node scripts/i18n-codemod-general.mjs <file-or-folder>... [--dry]
// i18n phase 2, third pass: interface words still written as plain strings inside a component, wherever they sit (a table row, a tab list
// built in the component, a helper call, a conditional, a component prop, an error message given to setError), and template strings such
// as `Review for ${hours} hours` (they become tx('Review for {hours} hours', { hours })). Only text that looks like words is touched, and
// never: comparisons, object keys, data fields (value, id, href, kind, ...), class names and styles, anything sent away (fetch, JSON,
// storage, analytics, URLs, errors thrown for the log), <code>/<pre>. Client components get useTx(), async server components getI18n();
// anything else is listed in %TEMP%/i18n-general-left.txt. Uses the TypeScript parser.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ts = createRequire(path.join(process.cwd(), 'package.json'))('typescript');
const dry = process.argv.includes('--dry');
const targets = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const walk = (p) => (fs.statSync(p).isDirectory() ? fs.readdirSync(p).flatMap((n) => walk(path.join(p, n))) : p.endsWith('.tsx') ? [p] : []);
const SKIP_FILES = /[\\/]legal[\\/]|opengraph-image|TemplatePage|design-preview|AppPhone|AppWindow|[\\/]i18n[\\/]T\.tsx/;
const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
const BRANDS = /^(SellOnBay|USD|BDT|OK|ID|URL|API|CSV|PDF|ZIP|SEO|GA4|FAQ|PayPal|GitHub|Google|Meta|Payoneer|Wise|bKash|Stripe|Supabase|Zoho|ZeptoMail|Tawk\.to|Next\.js|React|WordPress|Figma|Node|UTC|DMCA|GDPR|IBAN|SWIFT|TOTP|2FA|POS)$/;
// a sentence or a capitalised label of real words
const sentence = (t) => /^[A-Z][a-z’']+(\s|[.,:?!…])/.test(t) && /\s/.test(t.trim()) && !/[{}<>=;`]|=>|^https?:/.test(t);
const label = (t) => sentence(t) || (/^[A-Z][a-z’']{1,}[.:?…!]?$/.test(t.trim()) && !BRANDS.test(t.trim()));
const TEXT_ATTRS = new Set(['label', 'title', 'placeholder', 'aria-label', 'alt', 'submit', 'subtitle', 'heading', 'hint', 'help', 'empty', 'confirm', 'description', 'note', 'cta', 'text', 'caption', 'legend', 'summary', 'tooltip', 'busy', 'done', 'sub', 'lead', 'intro', 'message', 'prompt', 'question', 'emptyText', 'okLabel', 'cancelLabel', 'button', 'busyText', 'doneText', 'unit', 'suffix', 'prefix', 'more', 'less', 'none', 'ok', 'kicker', 'eyebrow']);
const DATA_KEYS = new Set(['value', 'id', 'key', 'href', 'slug', 'kind', 'type', 'code', 'icon', 'variant', 'tone', 'status', 'state', 'action', 'method', 'url', 'path', 'role', 'scope', 'lang', 'dir', 'className', 'format', 'currency', 'align', 'width', 'name', 'field', 'tab', 'mode', 'endpoint', 'src', 'target', 'rel', 'color', 'background', 'font', 'fontFamily', 'style', 'event', 'module', 'area', 'doc', 'file', 'mime', 'accept', 'pattern', 'autoComplete', 'inputMode', 'when', 'at', 'sort', 'order', 'flag', 'reason']);
const AWAY = /^(fetch|JSON\.|console\.|localStorage|sessionStorage|window\.location|location\.|router\.|encodeURI|decodeURI|new URL|URLSearchParams|Intl\.|RegExp|track|gtag|navigator|document\.cookie|crypto|Buffer|Date\b|Number|parseInt|parseFloat|String\(|Math\.|setItem|getItem|post|send|append|FormData|redirect|notFound|revalidate|audit|log|captureException|reportError|headers|cookies|sql|from|select|eq|insert|update|upsert|rpc|matchMedia|addEventListener|removeEventListener|setAttribute|querySelector|getElementById|startsWith|endsWith|includes|indexOf|split|replace|match|test|padStart|toLocaleString|toFixed|slice|join|has|get|delete|set$)/;
const awayCall = (c) => AWAY.test(c) || /\.(startsWith|endsWith|includes|indexOf|split|replace|match|test|has|get|delete|toLocaleString|join|push|setItem|getItem|append|post|send|insert|update|upsert|eq|select|from|rpc|querySelector|addEventListener|setAttribute)$/.test(c);
const COMPARE = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.InKeyword,
  ts.SyntaxKind.InstanceOfKeyword,
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.GreaterThanToken,
]);
const SKIP_TAGS = new Set(['code', 'pre', 'script', 'style', 'T', 'kbd', 'samp', 'option']);
const isComponentFn = (n) => {
  const name = ts.isFunctionDeclaration(n) ? n.name?.text : ts.isVariableDeclaration(n.parent) ? n.parent.name.getText() : '';
  return /^[A-Z]/.test(name ?? '') || (ts.isFunctionDeclaration(n) && n.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword));
};
const enclosingComponent = (n) => {
  for (let p = n.parent; p; p = p.parent) if ((ts.isFunctionDeclaration(p) || ts.isArrowFunction(p) || ts.isFunctionExpression(p)) && isComponentFn(p)) return p;
  return null;
};
// the reasons a literal must stay as it is
function keep(n) {
  const p = n.parent;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isCaseClause(p) || ts.isLiteralTypeNode(p) || ts.isExternalModuleReference(p)) return true;
  if (ts.isBinaryExpression(p) && COMPARE.has(p.operatorToken.kind)) return true;
  if (ts.isPropertyAssignment(p) && p.name === n) return true;
  if (ts.isElementAccessExpression(p) && p.argumentExpression === n) return true;
  if (ts.isPropertyAssignment(p) && DATA_KEYS.has(p.name.getText().replace(/['"]/g, ''))) return true;
  if (ts.isJsxAttribute(p) || (ts.isJsxExpression(p) && ts.isJsxAttribute(p.parent))) {
    const a = (ts.isJsxAttribute(p) ? p : p.parent).name.getText();
    if (!TEXT_ATTRS.has(a)) return true;
  }
  for (let a = p; a && !ts.isSourceFile(a); a = a.parent) {
    if (ts.isCallExpression(a) && (/^(tx|t|translate|pick|useTx|txLookup)$/.test(a.expression.getText().replace(/^.*\./, '')) || awayCall(a.expression.getText()))) return true;
    if (ts.isNewExpression(a) && /^(Error|URL|URLSearchParams|RegExp|Date|Intl)/.test(a.expression.getText())) return true;
    if (ts.isThrowStatement(a)) return true;
    if (ts.isParameter(a)) return true;
    if (ts.isJsxAttribute(a) && /^(className|style|href|src|key|id|fixed|data|value|defaultValue|action|method|name|type|pattern|accept)$/.test(a.name.getText())) return true;
    if (ts.isJsxElement(a) && SKIP_TAGS.has(a.openingElement.tagName.getText())) return true;
    if (ts.isTypeNode(a)) return true;
    if (ts.isPropertyAssignment(a) && /^(style|metadata|robots|openGraph|alternates|headers)$/.test(a.name.getText())) return true;
    if (ts.isVariableDeclaration(a) && /^(metadata|revalidate|dynamic|runtime|config)$/.test(a.name.getText())) return true;
  }
  return false;
}

const report = { files: 0, literals: 0, templates: 0, left: [] };
for (const file of targets.flatMap(walk)) {
  if (SKIP_FILES.test(file)) continue;
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const client = /^\s*['"]use client['"]/.test(src);
  const edits = [];
  const hooks = new Map();
  const place = (node, text, kind) => {
    const comp = enclosingComponent(node);
    const isAsync = comp?.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
    if (!comp || !ts.isBlock(comp.body) || !(client || isAsync)) return void report.left.push(`${file}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}: ${JSON.stringify(node.getText().slice(0, 80))}`);
    edits.push({ start: node.getStart(sf), end: node.getEnd(), text });
    hooks.set(comp, client ? 'client' : 'server');
    report[kind]++;
  };
  const visit = (node) => {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !ts.isJsxAttribute(node.parent)) {
      const inArrayInAttr = ts.isArrayLiteralExpression(node.parent) && node.parent.parent && ts.isJsxExpression(node.parent.parent);
      const prop = ts.isPropertyAssignment(node.parent) ? node.parent.name.getText().replace(/['"]/g, '') : '';
      const ok = TEXT_ATTRS.has(prop) || inArrayInAttr ? label(node.text) : sentence(node.text);
      if (ok && !keep(node)) place(node, `tx(${q(node.text)})`, 'literals');
    } else if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer) && TEXT_ATTRS.has(node.name.getText()) && label(node.initializer.text) && !keep(node.initializer)) {
      place(node.initializer, `{tx(${q(node.initializer.text)})}`, 'literals');
    } else if (ts.isTemplateExpression(node) && /^[A-Z][a-z’']+ /.test(node.head.text) && !keep(node)) {
      // `Review for ${hours} hours` -> tx('Review for {hours} hours', { hours })
      const vars = [];
      let text = node.head.text;
      let fine = true;
      for (const span of node.templateSpans) {
        const e = span.expression;
        if (/[`]/.test(e.getText())) fine = false;
        const base = ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : ts.isCallExpression(e) && ts.isIdentifier(e.expression) ? e.expression.text : `v${vars.length}`;
        let key = base.replace(/[^\w]/g, '') || `v${vars.length}`;
        while (vars.some((v) => v.key === key)) key += '2';
        vars.push({ key, expr: e.getText() });
        text += `{${key}}${span.literal.text}`;
      }
      if (fine && !/[{}]{2}/.test(text)) {
        const v = vars.map((x) => (x.key === x.expr ? x.key : `${x.key}: ${x.expr}`)).join(', ');
        place(node, `tx(${q(text)}, { ${v} })`, 'templates');
        return; // inner literals belong to the new call
      }
    }
    node.forEachChild(visit);
  };
  visit(sf);
  if (!edits.length) continue;
  // nested edits (a literal inside a template that was replaced): keep the outer one
  edits.sort((a, b) => a.start - b.start || b.end - a.end);
  const flat = [];
  for (const e of edits) if (!flat.some((f) => e.start >= f.start && e.end <= f.end)) flat.push(e);
  for (const [comp, kind] of hooks) {
    if (/\bconst (\{ )?tx\b|\{ tx[ ,}]|\btx = /.test(comp.body.getText())) continue;
    const at = comp.body.getStart(sf) + 1;
    flat.push({ start: at, end: at, text: kind === 'client' ? "\n  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)" : "\n  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)" });
  }
  flat.sort((a, b) => b.start - a.start);
  let out = src;
  for (const e of flat) out = out.slice(0, e.start) + e.text + out.slice(e.end);
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
console.log(JSON.stringify({ files: report.files, literals: report.literals, templates: report.templates, left: report.left.length }, null, 1));
fs.writeFileSync(path.join(process.env.TEMP ?? '.', 'i18n-general-left.txt'), report.left.join('\n'));

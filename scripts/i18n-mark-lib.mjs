// node scripts/i18n-mark-lib.mjs <file> <Name>[,<Name>...] [--dry]
// i18n phase 2: marks the English words of shared lists in lib/ (labels, step texts, FAQ answers) with tx('…'), which in lib is the plain
// English marker (lib/i18n/tx.ts): the value stays English, the extractor lists it, and the screen that shows it translates it with
// translate() on the server or useWord() in a client component. Only text values of the named declarations are marked: never object keys,
// ids, codes, or tuple keys in the first position.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ts = createRequire(path.join(process.cwd(), 'package.json'))('typescript');
const [file, names, flag] = process.argv.slice(2);
const dry = flag === '--dry';
const wanted = new Set(names.split(','));
const src = fs.readFileSync(file, 'utf8');
const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
const text = (t) => /[A-Za-z]{2,}/.test(t) && /^[A-Z]/.test(t.trim()) && !/^[A-Z0-9_]+$/.test(t) && !/^https?:|^\//.test(t);
const KEYS = new Set(['id', 'key', 'slug', 'href', 'kind', 'code', 'tone', 'icon', 'value', 'state', 'status', 'mode', 'type', 'path', 'url']);
const edits = [];
const visitValue = (n) => {
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
    const p = n.parent;
    if (ts.isPropertyAssignment(p) && (p.name === n || KEYS.has(p.name.getText().replace(/['"]/g, '')))) return;
    if (ts.isArrayLiteralExpression(p) && p.elements.indexOf(n) === 0 && p.elements.length > 1 && /^[a-z0-9_-]+$/.test(n.text)) return; // [key, label]
    if (ts.isCallExpression(p) || ts.isElementAccessExpression(p) || ts.isBinaryExpression(p) || ts.isCaseClause(p)) return;
    if (text(n.text)) edits.push({ start: n.getStart(sf), end: n.getEnd(), text: `tx(${q(n.text)})` });
    return;
  }
  if (ts.isCallExpression(n) && /^(tx|t)$/.test(n.expression.getText())) return;
  n.forEachChild(visitValue);
};
for (const st of sf.statements) {
  if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && wanted.has(d.name.text) && d.initializer) visitValue(d.initializer);
  if (ts.isFunctionDeclaration(st) && st.name && wanted.has(st.name.text) && st.body) visitValue(st.body);
}
edits.sort((a, b) => b.start - a.start);
let out = src;
for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
if (edits.length && !/import \{[^}]*\btx\b[^}]*\} from '[^']*i18n\/tx'/.test(out)) {
  let rel = path.relative(path.dirname(file), 'lib/i18n/tx').split(path.sep).join('/');
  if (!rel.startsWith('.')) rel = './' + rel;
  const imp = `import { tx } from '${rel}'; // marks English words; the screen translates them\n`;
  const first = out.search(/^import /m);
  out = first >= 0 ? out.slice(0, first) + imp + out.slice(first) : imp + out;
}
console.log(`${file}: ${edits.length} words marked`);
if (!dry) fs.writeFileSync(file, out);

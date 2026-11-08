/*
 * Prints the <body> of a design-reference file as JSX: same elements, same order, same classes and text (owner, 2026-11-09: port, do not
 * re-create). Only the syntax changes: class -> className, style strings -> objects, SVG attributes in camelCase, inline handlers dropped
 * (they are wired to the real handlers by hand). Run: node scripts/design-jsx.mjs admin.html [selector-class] > out.tsx
 */
import fs from 'node:fs';
import { parseDocument } from 'htmlparser2';

const file = process.argv[2];
const only = process.argv[3]; // optional: print only elements with this class (first match)
const doc = parseDocument(fs.readFileSync(`design-reference/${file}`, 'utf8'), { lowerCaseAttributeNames: false, recognizeSelfClosing: true });

const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
  'path',
  'circle',
  'line',
  'polyline',
  'rect',
  'polygon',
  'ellipse',
  'stop',
]);
const RENAME = {
  class: 'className',
  for: 'htmlFor',
  tabindex: 'tabIndex',
  viewbox: 'viewBox',
  readonly: 'readOnly',
  maxlength: 'maxLength',
  autocomplete: 'autoComplete',
  autofocus: 'autoFocus',
  inputmode: 'inputMode',
  enterkeyhint: 'enterKeyHint',
  colspan: 'colSpan',
  rowspan: 'rowSpan',
  srcset: 'srcSet',
  crossorigin: 'crossOrigin',
  'xlink:href': 'xlinkHref',
  'xml:space': 'xmlSpace',
};
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const BOOL = new Set(['checked', 'disabled', 'selected', 'required', 'hidden', 'open', 'multiple', 'readonly', 'autofocus', 'novalidate']);

function styleObj(css) {
  const parts = css
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const i = d.indexOf(':');
      const prop = d.slice(0, i).trim();
      const val = d.slice(i + 1).trim();
      const key = prop.startsWith('--') ? `'${prop}'` : camel(prop.replace(/^-webkit-/, 'Webkit-').replace(/^Webkit-/, 'Webkit-'));
      const num = /^-?\d*\.?\d+$/.test(val) && !/^(zIndex|opacity|flex|fontWeight|lineHeight|order|flexGrow|flexShrink)$/.test(key) ? `'${val}'` : JSON.stringify(val);
      return `${key.startsWith("'") ? key : key.replace(/^WebkitBackdropFilter$/, 'WebkitBackdropFilter')}: ${num}`;
    });
  return `{{ ${parts.join(', ')} }}`;
}
function attrs(el) {
  return Object.entries(el.attribs)
    .filter(([k]) => !/^on/i.test(k))
    .map(([k, v]) => {
      if (k === 'style') return `style=${styleObj(v)}`;
      const name = RENAME[k] ?? (k.startsWith('aria-') || k.startsWith('data-') ? k : camel(k));
      if (BOOL.has(k) && (v === '' || v === k)) return k === 'checked' ? 'defaultChecked' : k === 'selected' ? '' : name;
      if (k === 'value' && el.name !== 'option' && el.name !== 'button') return `defaultValue=${JSON.stringify(v)}`;
      return `${name}=${JSON.stringify(v)}`;
    })
    .filter(Boolean)
    .join(' ');
}
const text = (t) => t.replace(/[{}]/g, (c) => `{'${c}'}`);
function jsx(node, ind = '') {
  if (node.type === 'text') {
    const t = node.data.replace(/\s+/g, ' ');
    const block = /^(div|section|aside|header|footer|main|nav|p|h[1-6]|ul|ol|li|table|thead|tbody|tr|td|th|form|article|fieldset|details|summary|figure|select|textarea|svg)$/;
    const inline = (n) => !!n && (n.type === 'text' || (n.type === 'tag' && !block.test(n.name)));
    if (!t.trim()) return inline(node.prev) && inline(node.next) ? ind + "{' '}" : '';
    const lead = /^\s/.test(t) && inline(node.prev) ? "{' '}" : '';
    const trail = /\s$/.test(t) && inline(node.next) ? "{' '}" : '';
    return ind + lead + text(t.trim()) + trail;
  }
  if (node.type !== 'tag' && node.type !== 'script' && node.type !== 'style') return '';
  if (node.name === 'script' || node.name === 'style') return '';
  const a = attrs(node);
  const open = `<${node.name}${a ? ' ' + a : ''}`;
  const kids = node.children.map((c) => jsx(c, ind + '  ')).filter(Boolean);
  if (!kids.length) return `${ind}${open}${VOID.has(node.name) || !kids.length ? ' />' : '>'}`;
  return `${ind}${open}>\n${kids.join('\n')}\n${ind}</${node.name}>`;
}
function find(node, cls) {
  if (node.attribs?.class?.split(/\s+/).includes(cls)) return node;
  for (const c of node.children ?? []) {
    const f = find(c, cls);
    if (f) return f;
  }
  return null;
}
const body = find(doc, null) ?? doc;
const root = only ? find(doc, only) : (doc.children.find((n) => n.name === 'html')?.children.find((n) => n.name === 'body') ?? doc);
if (!root) throw new Error('not found');
console.log(
  (only ? [root] : root.children)
    .map((c) => jsx(c))
    .filter(Boolean)
    .join('\n'),
);
void body;

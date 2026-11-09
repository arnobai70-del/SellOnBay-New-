/*
 * One-off (owner, 2026-11-09: the old UI must be gone): the few old class families that still carry a working feature (order page, pay page,
 * order chat, system, SEO and page editors, the full-page preview...) are renamed to sob-* and their rules rewritten with the design's tokens
 * into app/sob-parts.css; the class names in the source are renamed in the same pass. Old keyframes are not carried over.
 * Run: node scripts/port-old-css.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';

const FAMILY =
  /^(ord(-[\w-]+)?|pay-[\w-]+|chat2(-[\w-]+)?|sys-[\w-]+|pe(-[\w-]+)?|pw-[\w-]+|req-[\w-]+|q-(edit|lines)|an-(h|range|bar|up|down)|hv(-[\w-]+)?|hiw(-[\w-]+)?|g-(?!ui\b)[\w-]+|seo-(row|pages)|mm-[\w-]+|post-(img|video|video-file|hr)|cat-(card|tag)|tl2|faq-page|notifs|empty-note|page-body|page-head|ps(-[\w-]+)?|tp(-[\w-]+)?|act-row|phone-bar|center-page|toast|skip|turnstile|bars|spark|dp|lst)$/;
const rename = (c) => 'sob-' + c.replace(/^g-/, '');
const DROP_SEL = /\.(night|dash|light|cine|mk-[\w-]+|g-ui)\b|\[data-theme|^\s*(html|body|:root)\b/;
const TOKENS = {
  '--ink': 'var(--g-text)',
  '--ink-2': 'var(--g-text-2)',
  '--mute': 'var(--g-muted)',
  '--line': 'var(--g-line)',
  '--line-dark': 'var(--g-line)',
  '--fog': '#f1f6f8',
  '--paper': '#fff',
  '--cobalt': 'var(--g-mint-tx)',
  '--cobalt-d': 'var(--g-mint-tx-hover)',
  '--cobalt-fill': 'var(--g-mint-tx)',
  '--ink-fill': 'var(--g-mint-tx)',
  '--link-on-dark': 'var(--g-mint-tx)',
  '--sky': 'var(--g-info-bg)',
  '--blue-bg': 'var(--g-info-bg)',
  '--blue-tx': 'var(--g-info-tx)',
  '--mint': 'var(--g-accent)',
  '--mint-bg': 'var(--g-ok-bg)',
  '--mint-tx': 'var(--g-ok-tx)',
  '--rose': 'var(--g-bad-tx)',
  '--rose-bg': 'var(--g-bad-bg)',
  '--amber': 'var(--g-wait-tx)',
  '--amber-bg': 'var(--g-wait-bg)',
  '--amber-tx': 'var(--g-wait-tx)',
  '--gold': '#e0b44b',
  '--gold-d': '#c99a2e',
  '--on-light': 'var(--g-text)',
  '--night': 'var(--g-text)',
  '--night-card': '#fff',
  '--night-thumb': '#f1f6f8',
  '--night-tx': 'var(--g-text)',
  '--night-mute': 'var(--g-muted)',
  '--display': 'var(--font-inter),system-ui,sans-serif',
  '--body': 'var(--font-inter),system-ui,sans-serif',
  '--r-s': '8px',
  '--r-m': '14px',
  '--r-l': '22px',
  '--cat': 'var(--g-accent)',
  '--cat-line': 'var(--g-line)',
  '--cat-badge': 'var(--g-ok-bg)',
  '--cat-badge-tx': 'var(--g-ok-tx)',
};
const KEYFRAMES = { ordp: 'sob-pulse', itspin: 'sob-ring', hsspin: 'sob-ring' };
const swapVars = (v) =>
  v.replace(
    /var\((--[\w-]+)(?:,([^()]*(?:\([^()]*\))?[^()]*))?\)/g,
    (m, name, fb) => TOKENS[name] ?? (name.startsWith('--g-') || name.startsWith('--font') || /^--[a-z]$|^--[pfkqr]$/.test(name) ? m : (fb?.trim() ?? m)),
  );

const out = postcss.root();
const unknownVars = new Set();
for (const file of ['app/globals.css', 'app/glass.css']) {
  const root = postcss.parse(fs.readFileSync(file, 'utf8'));
  root.walkRules((r) => {
    if (r.parent?.type === 'atrule' && /keyframes/.test(r.parent.name)) return;
    const take = [],
      keep = [];
    for (const sel of r.selectors) {
      const cls = [...sel.matchAll(/\.((?:\\.|[\w-])+)/g)].map((m) => m[1]);
      if (cls.some((c) => FAMILY.test(c))) {
        if (!DROP_SEL.test(sel)) take.push(':is(.sob-p,.sob-d) ' + sel.replace(/\.((?:\\.|[\w-])+)/g, (m, c) => (FAMILY.test(c) ? '.' + rename(c) : m)));
      } else keep.push(sel);
    }
    if (take.length) {
      const copy = r.clone({ selectors: take });
      copy.walkDecls((d) => {
        if (/^animation(-name)?$/.test(d.prop)) {
          const names = d.value.split(/[\s,]+/);
          const kf = names.find((n) => KEYFRAMES[n] || (/^[a-z][\w-]*$/.test(n) && root.toString().includes('@keyframes ' + n)));
          if (kf && KEYFRAMES[kf]) d.value = d.value.replace(kf, KEYFRAMES[kf]);
          else if (kf && !kf.startsWith('sob-')) d.remove();
        } else d.value = swapVars(d.value);
        for (const m of (d.value || '').matchAll(/var\((--[\w-]+)/g)) if (!m[1].startsWith('--g-') && !m[1].startsWith('--font')) unknownVars.add(m[1]);
      });
      // keep the @media / @supports wrapper
      let node = copy;
      for (let p = r.parent; p && p.type === 'atrule'; p = p.parent) node = postcss.atRule({ name: p.name, params: p.params, nodes: [node] });
      out.append(node);
    }
    if (!keep.length) r.remove();
    else r.selectors = keep;
  });
  fs.writeFileSync(file, root.toString());
}
fs.writeFileSync(
  'app/sob-parts.css',
  "/* Working parts the design files do not draw (order page, pay page, order chat, system, SEO and page editors, the full-page preview), in the\n   design's tokens. Made from the old rules by scripts/port-old-css.mjs on 2026-11-09; edit by hand from now on. */\n" +
    out.toString() +
    '\n',
);
console.log('vars left:', [...unknownVars].join(' ') || 'none');

// rename the classes in the source, only inside className="..." / className={...}
const BTN = {
  'btn-blue': '',
  'btn-gold': '',
  'btn-lg': '',
  'btn-line': 'ghost',
  'btn-sm': 'sm',
  'btn-dark': 'warn',
  panel: 'glass card',
  'form-err': 'sob-err',
  err: 'sob-err',
  prose: 'sob-prose',
  stack: 'sob-stack',
  grow: 'sob-grow',
  list: 'sob-list',
  'facts-list': 'sob-list',
  lead: 'muted',
  kv: 'sob-kv',
  checks: 'sob-checks',
  tot: 'sob-tot',
  'link-u': 'sob-link',
};
const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (!['node_modules', '.next', '.git'].includes(e.name)) walk(p);
    } else if (/\.tsx?$/.test(e.name)) files.push(p);
  }
};
['app', 'components', 'lib'].forEach(walk);
const grab = (s, i) => {
  if (s[i] === '"' || s[i] === "'") return [i, s.indexOf(s[i], i + 1) + 1];
  if (s[i] !== '{') return null;
  let d = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '{') d++;
    else if (s[j] === '}' && --d === 0) return [i, j + 1];
  }
  return null;
};
const fixLit = (lit) =>
  lit.replace(/(['"`])((?:\\.|(?!\1)[^\\])*?)\1/g, (m, q, body) => {
    const parts = body.split(/(\s+|\$\{[^}]*\})/);
    const next = parts.map((w) => (/^[A-Za-z_][\w-]*$/.test(w) ? (FAMILY.test(w) ? rename(w) : w in BTN ? BTN[w] : w) : w)).join('');
    const tidy = next
      .replace(/ {2,}/g, ' ')
      .replace(/^ (?=\S)/, body.startsWith(' ') ? ' ' : '')
      .replace(/(?<=\S) $/, body.endsWith(' ') ? ' ' : '');
    return q + tidy + q;
  });
let changed = 0;
for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  let o = '',
    last = 0;
  for (const m of s.matchAll(/className=/g)) {
    const g = grab(s, m.index + m[0].length);
    if (!g || g[0] < last) continue;
    o += s.slice(last, g[0]) + fixLit(s.slice(g[0], g[1]));
    last = g[1];
  }
  o += s.slice(last);
  if (o !== s) {
    fs.writeFileSync(f, o);
    changed++;
  }
}
console.log('source files changed:', changed);

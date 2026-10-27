/*
 * CMS history (SellOnBay 2.0, placeholder P04). Pure, tested.
 * Every save of a site-builder or SEO setting becomes a numbered revision of its app_settings key; a rollback saves an older revision again,
 * through the same setter (so the same checks run), and is itself a new revision. History is never rewritten or deleted.
 */
export type TrackedKind = 'menu' | 'footer' | 'social' | 'sections' | 'blocks' | 'seo_page' | 'seo_controls' | 'page_words' | 'nav' | 'robots';
export type Tracked = { kind: TrackedKind; path?: string; label: string };

const PREFIXES: [string, TrackedKind, string][] = [
  ['site:blocks:', 'blocks', 'Page blocks'],
  ['site:sections:', 'sections', 'Home sections'],
  ['seo:page:', 'seo_page', 'Search words'],
  ['seo:ctl:', 'seo_controls', 'Page controls'],
  ['page:words:', 'page_words', 'Heading and text'],
];
const EXACT: Record<string, [TrackedKind, string]> = {
  'site:menu': ['menu', 'Top menu'],
  'site:footer': ['footer', 'Footer'],
  'site:social': ['social', 'Social media links'],
  'seo:nav': ['nav', 'Category bar'],
  'seo:robots': ['robots', 'robots.txt'],
};

/* Which setting a key is, or null when it is not kept in the history (redirects and category allocation have their own logs). */
export function trackedKey(key: string): Tracked | null {
  if (key.length > 300) return null;
  const e = EXACT[key];
  if (e) return { kind: e[0], label: e[1] };
  for (const [p, kind, label] of PREFIXES) {
    if (!key.startsWith(p)) continue;
    const path = key.slice(p.length);
    if (!path.startsWith('/') || path.length > 200) return null;
    return { kind, path, label: `${label} · ${path}` };
  }
  return null;
}

export type Revision = { id: string; key: string; version: number; value: unknown; action: 'save' | 'rollback'; fromVersion: number | null; changedBy: string | null; at: number };

/* The next revision of a key. A rollback must name an earlier revision of the same key that is not the current one. */
export function nextRevision(
  history: Revision[],
  input: { key: string; value: unknown; action: 'save' | 'rollback'; fromVersion?: number },
): { ok: true; version: number } | { ok: false; error: string } {
  if (!trackedKey(input.key)) return { ok: false, error: 'This setting has no history.' };
  const latest = history.reduce((m, r) => (r.key === input.key ? Math.max(m, r.version) : m), 0);
  if (input.action === 'rollback') {
    if (!input.fromVersion || !history.some((r) => r.key === input.key && r.version === input.fromVersion)) return { ok: false, error: 'That revision does not exist.' };
    if (input.fromVersion === latest) return { ok: false, error: 'That revision is already the current one.' };
  }
  return { ok: true, version: latest + 1 };
}

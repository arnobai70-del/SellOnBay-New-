/*
 * Admin permissions (owner decision D-H). An admin holds one or more scopes; Super Admin holds every power. Pure, so it is tested; the server
 * reads the scopes from profiles.admin_scopes (migration 0055) in lib/admin/guard.ts and lib/supabase/viewer.ts.
 *
 *  super     everything, incl. settings, maintenance, accounts, scopes, price overrides (O-8); may act as Finance and Delivery (F-12)
 *  finance   payments and reconciliation, refunds (F-5), payouts, plans and subscriptions, sales reports
 *  catalog   listings, versions, file review, quotations, revision terms
 *  support   purchase requests, messages, disputes triage, abuse reports, support tickets
 *  content   CMS, site builder, SEO, blog, visitor analytics
 *  delivery  release approval, entitlements, repository access, work authorisation
 *  dev       Server health and the read-only system page (owner, 2026-11-08; migration 0080)
 *
 * "negotiator" is reserved for a later role (R-6) and grants nothing until the owner enables it.
 */
export const SCOPES = ['super', 'finance', 'catalog', 'support', 'content', 'delivery', 'dev'] as const;
export type AdminScope = (typeof SCOPES)[number];
export const RESERVED_SCOPES = ['negotiator'] as const;

export const SCOPE_LABEL: Record<AdminScope, string> = {
  super: 'Super Admin',
  finance: 'Finance',
  catalog: 'Catalog',
  support: 'Support',
  content: 'Content',
  delivery: 'Delivery',
  dev: 'Developer',
};

const isScope = (s: unknown): s is AdminScope => typeof s === 'string' && (SCOPES as readonly string[]).includes(s);

/*
 * The scopes an admin really has. A null column is an admin from before scopes existed: Super Admin, so nobody loses access on the day this ships.
 * Unknown and reserved values grant nothing.
 */
export function effectiveScopes(raw: readonly string[] | null | undefined): AdminScope[] {
  if (raw === null || raw === undefined) return ['super'];
  return [...new Set(raw.filter(isScope))];
}

/* Does an admin with these scopes have this permission? Super Admin has every one. Several needs mean any one of them is enough. */
export function hasScope(scopes: readonly AdminScope[], need: AdminScope | readonly AdminScope[]): boolean {
  if (scopes.includes('super')) return true;
  const list = typeof need === 'string' ? [need] : need;
  return list.some((n) => scopes.includes(n));
}

/* Checks a set of scopes a Super Admin wants to give someone. Returns the cleaned list, or a problem in plain words. */
export function checkScopeChange(next: readonly string[]): { ok: true; scopes: AdminScope[] } | { ok: false; error: string } {
  if (next.some((s) => (RESERVED_SCOPES as readonly string[]).includes(s))) return { ok: false, error: 'The Negotiator role is not available yet.' };
  if (next.some((s) => !isScope(s))) return { ok: false, error: 'Unknown permission.' };
  const scopes = [...new Set(next)] as AdminScope[];
  if (!scopes.length) return { ok: false, error: 'Give at least one permission, or change the account back to a buyer.' };
  return { ok: true, scopes };
}

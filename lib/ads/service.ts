import 'server-only';
import { audit, auditStrict } from '../admin/audit';
import { isFlagOn } from '../featureFlags';
import { FLAGS } from '../featureFlagRegistry';
import { notify, notifyAdmins } from '../notify';
import { requestableProduct } from '../requests/products';
import { adapterFor } from './adapter';
import { AD_PLATFORMS, canMovePromo, checkPromo, type AdPlatform, type PromoInput, type PromoState } from './rules';

/*
 * Seller promotions (Blueprint 9, model A). The promotion record is kept in memory only: the Addendum keeps its table (placeholder P22,
 * supabase/proposed/P22_ad_integrations.sql) as a proposal until Meta and Google confirm access (B-9). Both flags are locked, so in a real
 * deployment every call here answers "not available"; the review flow, checks and audit are built and tested so the adapter can be added
 * later without changing them. Nothing here calls an advertising API, charges money, or uses buyer data.
 */
export type Promotion = PromoInput & {
  id: string;
  sellerId: string;
  productId: string;
  productName: string;
  status: PromoState;
  reviewNote: string;
  reviewedBy: string | null;
  createdAt: number;
  updatedAt: number;
};
type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });
const mem: Map<string, Promotion> = ((globalThis as { __promoMem?: Map<string, Promotion> }).__promoMem ??= new Map());

/* Only the unit tests may open the locked flags, to exercise the review flow. Never in a running site. */
let testOpen = false;
export const __openAdsForTests = (on: boolean) => {
  if (process.env.VITEST !== 'true') throw new Error('Test hook used outside the tests.');
  testOpen = on;
};
export async function platformOpen(p: AdPlatform): Promise<boolean> {
  if (testOpen && process.env.VITEST === 'true') return true;
  const def = FLAGS[AD_PLATFORMS[p].flag] as { locked?: string };
  if (def.locked) return false;
  return isFlagOn(AD_PLATFORMS[p].flag);
}
const NOT_YET = 'Promotions are not available yet: they wait for Meta and Google to confirm access, and for a legal review.';

export async function promotionsOf(sellerId: string): Promise<Promotion[]> {
  return [...mem.values()].filter((p) => p.sellerId === sellerId).sort((a, b) => b.createdAt - a.createdAt);
}
export async function promotionsToReview(): Promise<Promotion[]> {
  return [...mem.values()].filter((p) => p.status === 'in_review').sort((a, b) => a.updatedAt - b.updatedAt);
}

export async function draftPromotion(sellerId: string, raw: Record<string, unknown>, now = Date.now()): Promise<Result<Promotion>> {
  const c = checkPromo(raw);
  if (!c.ok) return fail(400, c.error);
  if (!(await platformOpen(c.value.platform))) return fail(409, NOT_YET);
  const product = await requestableProduct(c.value.productSlug);
  if (!product || product.sellerId !== sellerId || product.status !== 'live') return fail(404, 'Choose one of your live listings.'); // approved, live listings only
  const p: Promotion = {
    ...c.value,
    id: crypto.randomUUID(),
    sellerId,
    productId: product.id,
    productName: product.name,
    status: 'draft',
    reviewNote: '',
    reviewedBy: null,
    createdAt: now,
    updatedAt: now,
  };
  mem.set(p.id, p);
  return { ok: true, value: p };
}

async function move(p: Promotion, to: PromoState, patch: Partial<Promotion>, now: number): Promise<Result<Promotion>> {
  if (!canMovePromo(p.status, to)) return fail(409, `A promotion that is ${p.status.replace('_', ' ')} cannot become ${to.replace('_', ' ')}.`);
  const next = { ...p, ...patch, status: to, updatedAt: now };
  mem.set(p.id, next);
  return { ok: true, value: next };
}

export async function sellerPromotionAction(sellerId: string, id: string, action: 'submit' | 'end' | 'edit', now = Date.now()): Promise<Result<Promotion>> {
  const p = mem.get(id);
  if (!p || p.sellerId !== sellerId) return fail(404, 'Promotion not found.');
  if (!(await platformOpen(p.platform))) return fail(409, NOT_YET);
  if (action === 'submit') {
    const r = await move(p, 'in_review', {}, now);
    if (r.ok) await notifyAdmins('request_update', { title: p.productName, note: 'A seller sent a promotion for review.' });
    return r;
  }
  if (action === 'edit') return move(p, 'draft', { reviewNote: '' }, now);
  await audit(sellerId, 'promotion_ended', 'promotion', p.id, { platform: p.platform });
  return move(p, 'ended', {}, now);
}

/* Catalog approves or rejects the ad's words before anything could be submitted; the platform's own review would still apply after B-9. */
export async function reviewPromotion(adminId: string | null, id: string, decision: 'approve' | 'reject', note: string, now = Date.now()): Promise<Result<Promotion>> {
  const p = mem.get(id);
  if (!p) return fail(404, 'Promotion not found.');
  if (!(await platformOpen(p.platform))) return fail(409, NOT_YET);
  const why = note.replace(/\s+/g, ' ').trim();
  if (decision === 'reject' && why.length < 5) return fail(400, 'Say what the seller should change.');
  const product = await requestableProduct(p.productId);
  if (decision === 'approve' && (!product || product.status !== 'live')) return fail(409, 'The listing is no longer live.');
  await auditStrict(adminId, `promotion_${decision}d`, 'promotion', p.id, { platform: p.platform, product: p.productId, budget: p.dailyBudgetCents * p.days, note: why });
  const r = await move(p, decision === 'approve' ? 'approved' : 'rejected', { reviewNote: why.slice(0, 500), reviewedBy: adminId }, now);
  if (r.ok) await notify(p.sellerId, 'request_update', { title: p.productName, note: decision === 'approve' ? 'Your promotion was approved.' : `Your promotion needs changes: ${why}` });
  return r;
}

/* Going live needs the platform adapter, which does not exist before B-9: this always refuses, and says so. */
export async function startPromotion(sellerId: string, id: string): Promise<Result<Promotion>> {
  const p = mem.get(id);
  if (!p || p.sellerId !== sellerId) return fail(404, 'Promotion not found.');
  if (p.status !== 'approved') return fail(409, 'Only an approved promotion can start.');
  if (!adapterFor(p.platform)) return fail(409, 'No connection to this ad platform exists yet. Nothing was sent and nothing was charged.');
  return fail(501, 'Not built.');
}

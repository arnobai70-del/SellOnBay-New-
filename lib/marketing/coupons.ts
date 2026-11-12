import { tx } from '../i18n/tx';
import { CONFIG } from '../config';

/*
 * Coupons (owner, 2026-11-07): the platform pays the discount, so the seller always gets their share of the LIST price and the platform's share
 * shrinks (it may go below zero on a big discount: that is the platform paying). Pure, tested. Kept in app_settings ("marketing:coupons"); they take
 * effect at checkout only once live payments start (in the free beta nothing is charged).
 */
export type Coupon = { code: string; percentOff: number; endsOn: string | null; maxUses: number | null; active: boolean };
export const COUPON_LIMIT = 50;

export function checkCoupon(raw: unknown): { ok: true; value: Coupon } | { ok: false; error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const code = String(r.code ?? '')
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{2,23}$/.test(code)) return { ok: false, error: tx('Use 3 to 24 letters, numbers and dashes for the code.') };
  const percentOff = Number(r.percentOff);
  if (!Number.isInteger(percentOff) || percentOff < 1 || percentOff > 90) return { ok: false, error: tx('The discount is a whole percent from 1 to 90.') };
  const endsOn = r.endsOn ? String(r.endsOn) : null;
  if (endsOn && !/^\d{4}-\d{2}-\d{2}$/.test(endsOn)) return { ok: false, error: tx('Write the end date as YYYY-MM-DD.') };
  const maxUses = r.maxUses === null || r.maxUses === undefined || r.maxUses === '' ? null : Number(r.maxUses);
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100_000)) return { ok: false, error: tx('Uses is a whole number, or empty for no limit.') };
  return { ok: true, value: { code, percentOff, endsOn, maxUses, active: r.active !== false } };
}

export function cleanCoupons(raw: unknown): Coupon[] {
  const out: Coupon[] = [];
  for (const c of Array.isArray(raw) ? raw : []) {
    const v = checkCoupon(c);
    if (v.ok && !out.some((o) => o.code === v.value.code)) out.push(v.value);
  }
  return out.slice(0, COUPON_LIMIT);
}

export const couponLive = (c: Coupon, today: string) => c.active && (!c.endsOn || c.endsOn >= today);

/* Who gets what on one sale with a coupon. Cents, rounded down for the discount so the buyer never pays less than shown. */
export function couponSplit(listCents: number, percentOff: number, sellerKeepBps = 10_000 - CONFIG.flatPlan.commissionBps) {
  const discount = Math.floor((listCents * percentOff) / 100);
  const seller = listCents - Math.round((listCents * (10_000 - sellerKeepBps)) / 10_000); // the same rounding as planNetCents
  return { buyerPays: listCents - discount, seller, platform: listCents - discount - seller, discount };
}

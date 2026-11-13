import { tx } from '../i18n/tx'; // marks English words; the screen translates them
import 'server-only';
import { supabaseConfigured } from '../supabase/env';
import { createAdminClient } from '../supabase/server';
import type { LogEvent, PurchaseRequest, Quotation } from './store';

/* Plain words and small lookups for the request and quotation pages (buyer and admin). */
export const REQUEST_WORDS: Record<string, [string, string]> = {
  submitted: [tx('Sent'), 'status st-info'],
  under_review: [tx('Being reviewed'), 'status st-wait'],
  needs_info: [tx('SellOnBay asked a question'), 'status st-wait'],
  requirements_verified: [tx('Requirements confirmed'), 'status st-wait'],
  quoted: [tx('Quotation ready'), 'status st-ok'],
  converted: [tx('Ordered'), 'status st-ok'],
  declined: [tx('Declined'), 'status st-bad'],
  withdrawn: [tx('Withdrawn'), 'status st-draft'],
  expired: [tx('Expired'), 'status st-draft'],
};
export const QUOTE_WORDS: Record<string, string> = {
  draft: tx('Draft'),
  pending_super: tx('Waiting for Super Admin'),
  issued: tx('Sent to the buyer'),
  accepted: tx('Accepted'),
  rejected: tx('Declined by the buyer'),
  superseded: tx('Replaced'),
  expired: tx('Expired'),
  withdrawn: tx('Withdrawn'),
  discarded: tx('Discarded'),
};
/* What the buyer may see of the request log: their own steps and SellOnBay's messages to them. Internal admin steps say only what happened. */
const BUYER_EVENT: Record<string, string> = {
  submitted: tx('You sent the request'),
  review: tx('SellOnBay started reviewing it'),
  ask: tx('SellOnBay asked'),
  answer: tx('You answered'),
  decline: tx('SellOnBay declined it'),
  withdraw: tx('You withdrew it'),
  requirements_proposed: tx('SellOnBay wrote down your requirements'),
  confirm_requirements: tx('You confirmed the requirements'),
  quoted: tx('A quotation was sent'),
  quotation_rejected: tx('You declined the quotation'),
  quotation_withdrawn: tx('SellOnBay withdrew the quotation'),
  quotation_expired: tx('The quotation expired'),
  converted: tx('You accepted the quotation; your order was created'),
  expired: tx('The request expired'),
};
export const buyerTimeline = (events: LogEvent[]) =>
  events
    .filter((e) => BUYER_EVENT[e.event])
    .map((e) => ({ at: e.at, text: BUYER_EVENT[e.event], note: ['ask', 'answer', 'decline', 'requirements_proposed'].includes(e.event) ? (e.note ?? null) : null }));

export const usd = (c: number) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* The quotation the buyer should see now: the newest one that reached them. */
export const buyerQuote = (quotes: Quotation[]) => quotes.find((q) => ['issued', 'accepted', 'rejected', 'expired', 'withdrawn'].includes(q.status)) ?? null;

export async function productNames(ids: (string | null)[]): Promise<Map<string, { name: string; slug: string }>> {
  const out = new Map<string, { name: string; slug: string }>();
  const list = [...new Set(ids.filter(Boolean))] as string[];
  if (!supabaseConfigured || !list.length) return out;
  const { data } = await createAdminClient().from('products').select('id, name, slug').in('id', list);
  for (const p of data ?? []) out.set(p.id, { name: p.name, slug: p.slug });
  return out;
}
export async function personNames(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const list = [...new Set(ids.filter(Boolean))];
  if (!supabaseConfigured || !list.length) return out;
  const { data } = await createAdminClient().from('profiles').select('id, full_name').in('id', list);
  for (const p of data ?? []) out.set(p.id, p.full_name || 'Buyer');
  return out;
}
export const requestTitle = (r: PurchaseRequest, products: Map<string, { name: string }>) =>
  r.kind === 'custom_dev' ? tx('Custom development') : (products.get(r.productId ?? '')?.name ?? 'Product');

import 'server-only';
import { audit } from './admin/audit';
import { blockEmail } from './guard';
import { deleteReportsBy } from './abuse';
import { orderStore } from './orders/store';
import { deleteReview, deleteReviewsBy } from './reviews';
import { createAdminClient } from './supabase/server';

/*
 * One-click clean-up after fake accounts. Removing an account bans it for good (sign-in and every session refused), and deletes the reviews and abuse
 * reports it wrote, so ratings and the auto-pause count are not poisoned. It never deletes orders, payments, disputes, chat, downloads or the security
 * trail: those are the evidence. An account with a paid order is refused here; use a dispute or a refund for it.
 */
export type Result = { ok: true; removed: { reviews: number; reports: number } } | { ok: false; status: number; error: string };
const fail = (status: number, error: string): Result => ({ ok: false, status, error });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function removeFakeAccount(adminId: string | null, userId: string, note: string): Promise<Result> {
  const why = note.trim();
  if (why.length < 5) return fail(400, 'Write why (at least 5 characters). It goes in the audit log.');
  if (why.length > 500) return fail(400, 'Keep the reason under 500 characters.');
  if (!UUID.test(userId)) return fail(400, 'That is not an account id.');
  if (userId === adminId) return fail(400, 'You cannot do this to your own account.');
  const store = await orderStore();
  if (store.kind !== 'postgres') return fail(404, 'There are no accounts in demo mode.');
  const db = createAdminClient();
  const { data: p } = await db.from('profiles').select('id, role').eq('id', userId).maybeSingle();
  if (!p) return fail(404, 'Account not found.');
  if (p.role === 'admin') return fail(400, 'Remove the admin role first.');
  if ((await store.forUser(userId)).some((o) => !!o.fundedAt)) return fail(409, 'This account has paid orders. Use a dispute or a refund, not the clean-up.');
  if ((await db.from('profiles').update({ banned: true }).eq('id', userId)).error) return fail(500, 'Could not ban the account. Nothing was removed.');
  const locked = await db.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
  if (locked.error) console.error('clean-up: could not lock sign-in', locked.error.message);
  // The same mailbox cannot come back with a new account.
  const email = (await db.auth.admin.getUserById(userId)).data.user?.email;
  if (email) await blockEmail(adminId, email, `Fake account removed: ${why}`);
  const removed = { reviews: await deleteReviewsBy(userId), reports: await deleteReportsBy(userId) };
  await audit(adminId, 'account_removed', 'profile', userId, { note: why, ...removed });
  return { ok: true, removed };
}

/*
 * Removes every review and abuse report one account wrote, without banning it. For an account with paid orders (which the full removal refuses):
 * a seller who bought their own listing through a second account to post "verified" reviews, for example. The orders stay as they are.
 */
export async function removeReviewsBy(adminId: string | null, userId: string, note: string): Promise<Result> {
  const why = note.trim();
  if (why.length < 5) return fail(400, 'Write why (at least 5 characters). It goes in the audit log.');
  if (why.length > 500) return fail(400, 'Keep the reason under 500 characters.');
  if ((await orderStore()).kind === 'postgres' && !UUID.test(userId)) return fail(400, 'That is not an account id.');
  const removed = { reviews: await deleteReviewsBy(userId), reports: await deleteReportsBy(userId) };
  if (!removed.reviews && !removed.reports) return fail(404, 'This account has no reviews or abuse reports.');
  await audit(adminId, 'reviews_removed', 'profile', userId, { note: why, ...removed });
  return { ok: true, removed };
}

export async function removeFakeReview(adminId: string | null, orderId: string, note: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const why = note.trim();
  if (why.length < 5) return { ok: false, status: 400, error: 'Write why (at least 5 characters). It goes in the audit log.' };
  if (!UUID.test(orderId)) return { ok: false, status: 400, error: 'That is not an order id.' };
  if (!(await deleteReview(orderId))) return { ok: false, status: 404, error: 'No review for that order.' };
  await audit(adminId, 'review_removed', 'order', orderId, { note: why });
  return { ok: true };
}

/*
 * A buyer whose chargeback was lost is banned for good: the account is banned and cannot sign in, the email address is blocked so the same mailbox cannot
 * come back, and `ban_reason = 'chargeback'` stops anybody lifting it from the Accounts page. Never touches an admin. Returns 'skipped' when there is no account to ban
 * (a signed-out demo buyer, or no database); the caller still writes the audit entry and alerts the admins.
 */
export async function banForChargeback(adminId: string | null, userId: string, orderId: string): Promise<'banned' | 'skipped'> {
  if (!UUID.test(userId) || (await orderStore()).kind !== 'postgres') return 'skipped';
  const db = createAdminClient();
  const { data: p } = await db.from('profiles').select('id, role').eq('id', userId).maybeSingle();
  if (!p || p.role === 'admin') return 'skipped';
  await db.from('profiles').update({ banned: true }).eq('id', userId);
  await db.from('profiles').update({ ban_reason: 'chargeback' }).eq('id', userId); // the column comes with migration 0035
  await db.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
  const email = (await db.auth.admin.getUserById(userId)).data.user?.email;
  if (email) await blockEmail(adminId, email, `Lost chargeback on order ${orderId}`);
  await audit(adminId, 'chargeback_buyer_banned', 'profile', userId, { orderId });
  return 'banned';
}

import { NextResponse } from 'next/server';
import { verifyTurnstile } from '@/lib/bot/turnstile';
import { BLOCKED_MESSAGE, checkMessage } from '@/lib/chatFilter';
import { clientIp } from '@/lib/delivery/service';
import { findAny } from '@/lib/apps';
import { showExamples } from '@/lib/examples';
import { LIMITS, burstLimit, dailyCounts, saveBlocked, saveQuestion } from '@/lib/presale/service';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { presaleSchema } from '@/lib/schemas';
import { readJson } from '@/lib/validate';
import { BUYERS_ONLY, cannotAct, mayBuy } from '@/lib/accounts';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const fail = (error: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status, headers: { 'cache-control': 'no-store' } });

/*
 * A buyer asks a seller a question before buying. Order of checks, cheapest first:
 * bot traps (hidden field, too fast), signed in, bot check (Turnstile), rate limits per person and per address, the listing exists,
 * a daily cap per buyer per seller, then the same chat filter as order chat. Blocked attempts are stored for admins, with the reason.
 */
export async function POST(req: Request) {
  const closed = await maintenanceFor('messaging'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const ip = clientIp(req);
  const parsed = await readJson(req, presaleSchema);
  if (!parsed.ok) return parsed.res;
  const b = parsed.data;

  // Bot traps: a hidden field real people never fill in, and a form that was sent faster than a person can type.
  if (b.hp) return NextResponse.json({ ok: true }); // pretend it worked
  const age = Date.now() - Number(b.startedAt ?? 0);
  if (!(age > 1500 && age < 6 * 3600_000)) return fail('Please wait a moment and send it again.', 400);

  let userId = `demo:${ip}`;
  let banned = false;
  if (supabaseConfigured) {
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return fail('Sign in to ask a question.', 401);
    userId = user.id;
    const { data: me } = await sb.from('profiles').select('banned, suspended_until, role').eq('id', user.id).single();
    banned = cannotAct(me);
    if (!banned && !mayBuy(me?.role)) return fail(BUYERS_ONLY, 403);
  }
  if (banned) return fail('This account cannot send messages.', 403);

  if (!(await verifyTurnstile(b.token, ip))) return fail('The bot check did not pass. Reload the page and try again.', 400);
  const limited = await burstLimit(userId, ip);
  if (limited && !limited.ok) return fail(limited.error, limited.status);

  const productKey = String(b.productKey ?? '').slice(0, 80);
  let sellerId: string | null = null;
  const starter = (await showExamples()) ? findAny(productKey) : undefined;
  if (!starter) {
    if (!supabaseConfigured) return fail('That listing was not found.', 404);
    const { data: p } = await createAdminClient().from('products').select('seller_id, status').eq('slug', productKey).maybeSingle();
    if (!p || p.status !== 'live') return fail('That listing was not found.', 404);
    sellerId = p.seller_id as string;
    if (sellerId === userId) return fail('This is your own listing.', 400);
  }

  const body = String(b.body ?? '').trim();
  if (body.length < 5) return fail('Write a little more so the seller can help.', 400);
  if (body.length > 500) return fail('Keep it under 500 characters.', 400);

  const counts = await dailyCounts(userId, sellerId ?? productKey);
  if (counts.pair >= LIMITS.perPairPerDay) return fail(`You can send ${LIMITS.perPairPerDay} questions a day to one seller. Try again tomorrow.`, 429);
  if (counts.total >= LIMITS.perBuyerPerDay) return fail('You reached the daily limit for questions. Try again tomorrow.', 429);

  const verdict = checkMessage(body);
  if (!verdict.ok) {
    await saveBlocked({ senderId: userId, sellerId, productKey, body, reason: verdict.reason, ip });
    return fail(BLOCKED_MESSAGE, 422, { blocked: true });
  }
  const id = await saveQuestion({ buyerId: userId, sellerId, productKey, body, ip });
  return NextResponse.json({ ok: true, id }, { headers: { 'cache-control': 'no-store' } });
}

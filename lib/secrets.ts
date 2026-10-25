import { createHmac } from 'node:crypto';

/*
 * Keys the server needs but nobody should have to invent and paste into the host one by one (owner, 2026-10-24: fewer critical variables on Hostinger).
 * Each one is the variable of its own name when that is set (so an existing setup keeps working); otherwise APP_SECRET; otherwise it is made from
 * the Supabase service key, which is already a long secret that only the server has. Every purpose gets its own key (HMAC with the purpose as label),
 * so one leaked key says nothing about another. Changing the source later changes these keys: block lists are forgotten, they never lock anyone out.
 */
export function derivedSecret(name: 'GUARD_SALT' | 'ANALYTICS_SALT' | 'PAYMENT_WEBHOOK_SECRET', env: Record<string, string | undefined> = process.env): string | null {
  const own = env[name];
  if (own) return own;
  const root = env.APP_SECRET && env.APP_SECRET.length >= 32 ? env.APP_SECRET : env.SUPABASE_SERVICE_ROLE_KEY;
  if (!root) return null;
  return createHmac('sha256', root).update(`sellonbay:${name}`).digest('hex');
}

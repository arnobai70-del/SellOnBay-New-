import { createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { recordClick, REF_COOKIE } from '@/lib/affiliates/service';
import { isBot } from '@/lib/analyticsCore';
import { clientAddress } from '@/lib/clientIp';
import { maintenanceFor } from '@/lib/maintenance/service';
import { limit } from '@/lib/rateLimit';
import { derivedSecret } from '@/lib/secrets';
import { readJson } from '@/lib/validate';

export const runtime = 'nodejs';
const schema = z.object({ code: z.string().max(16), product: z.string().max(200).default(''), consent: z.boolean().default(false) });

/*
 * A visit through a referral link (components/glass/RefTracker.tsx). The click is counted once per visitor, link and day, from a keyed hash of
 * the address and browser (nothing else is kept). The signed referral cookie is set only when the visitor accepted analytics cookies; without
 * that consent nothing is remembered and no later purchase is attributed. Bots are ignored.
 */
export async function POST(req: Request) {
  const closed = await maintenanceFor('payouts');
  if (closed) return closed;
  const ua = req.headers.get('user-agent');
  if (isBot(ua)) return NextResponse.json({ ok: true });
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const ip = clientAddress(req.headers);
  if (!(await limit(`aff-click:${ip}`, 60, 3_600_000))) return NextResponse.json({ ok: true });
  const salt = derivedSecret('AFFILIATE_SECRET') ?? 'sellonbay-dev-salt'; // its own key: the analytics and guard salts stay in their modules
  const visitor = createHmac('sha256', salt)
    .update(`aff:${ip}|${ua ?? ''}`)
    .digest('hex')
    .slice(0, 32);
  const r = await recordClick(body.data.code.toUpperCase(), body.data.product, visitor);
  const res = NextResponse.json({ ok: true });
  if (r.ok && body.data.consent)
    res.cookies.set(REF_COOKIE, r.value.cookie, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: r.value.days * 86_400 });
  return res;
}

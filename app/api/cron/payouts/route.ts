import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { checkPaypalPayout, listPayouts, planPayouts } from '@/lib/payouts';
import { beat } from '@/lib/heartbeat';
import { recordRun } from '@/lib/cronRuns';
import { jsonT } from '@/lib/i18n/jsonT';
import { tx } from '@/lib/i18n/tx';

export const runtime = 'nodejs';

/* The Thursday job (UTC): make the week's payout batch. Needs CRON_SECRET in the Authorization header. An admin then downloads the CSV and pays by hand. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET ?? '';
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  const a = Buffer.from(given),
    b = Buffer.from(secret);
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) return jsonT({ error: tx('Not allowed.') }, { status: 401 });
  // Each run is recorded for the admin system page (lib/cronRuns.ts); a failure is recorded and thrown on as before.
  const { r, checked } = await recordRun('payouts', async () => {
    const r = await planPayouts(Date.now(), null);
    // Payouts already sent through PayPal: ask PayPal where they are, so they are marked paid (or failed) without anyone clicking.
    let checked = 0;
    for (const p of await listPayouts({ status: ['exported'] })) {
      if (!p.reference?.startsWith('paypal:')) continue;
      await checkPaypalPayout(p.id, null).catch(() => null);
      checked++;
    }
    return { r, checked };
  });
  await beat('payouts');
  return NextResponse.json({ weekStart: r.weekStart, created: r.created.length, skipped: r.skipped.length, paypalChecked: checked });
}

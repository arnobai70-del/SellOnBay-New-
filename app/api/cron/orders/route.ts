import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { domainReminders } from '@/lib/orders/domains';
import { purgeSecurityEvents } from '@/lib/guard';
import { runDueJobs } from '@/lib/orders/service';
import { checkAnomalies } from '@/lib/metrics';
import { releaseDueReserves } from '@/lib/reserve';
import { beat } from '@/lib/heartbeat';
import { sendQueued } from '@/lib/emailQueue';
import { dailyReport } from '@/lib/analytics';

export const runtime = 'nodejs';

/* Scheduled every few minutes (Vercel cron or Supabase cron calling this address). Needs CRON_SECRET in the Authorization header. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET ?? '';
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  const a = Buffer.from(given),
    b = Buffer.from(secret);
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: 'Not allowed.' }, { status: 401 });
  const done = {
    moved: await runDueJobs(),
    domainReminders: await domainReminders(),
    purgedEvents: await purgeSecurityEvents(),
    anomalies: (await checkAnomalies()).length,
    reservesReleased: await releaseDueReserves(),
    dailyReport: await dailyReport(),
    emails: await sendQueued(),
  };
  await beat('orders');
  return NextResponse.json(done);
}

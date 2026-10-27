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
import { fileJobs } from '@/lib/files/service';
import { expireDue } from '@/lib/requests/service';
import { releaseJobs } from '@/lib/release/service';
import { purgeReports } from '@/lib/reports/service';
import { adminIdentityCheck } from '@/lib/auth/socialService';

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
    files: await fileJobs(), // source-file checks waiting, and deleting expired rejected uploads (lib/files)
    requests: await expireDue(), // quotations after 7 days, requests after the expiry an admin set (lib/requests)
    releases: await releaseJobs(), // reminders and 12-hour target alerts; never releases anything (lib/release)
    reports: await purgeReports(), // generated sales PDFs and receipts deleted after 24 hours; their log entries stay (lib/reports)
    adminSocial: await adminIdentityCheck(), // alerts if an admin account holds a social sign-in (O-7); never changes accounts
  };
  await beat('orders');
  return NextResponse.json(done);
}

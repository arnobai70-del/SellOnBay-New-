import { NextResponse } from 'next/server';
import { adminOnly } from '@/lib/admin/guard';
import { audit } from '@/lib/admin/audit';
import { senderFrom } from '@/lib/emailRouting';
import { maintenanceFor } from '@/lib/maintenance/service';
import { emailProvider } from '@/lib/providers/email';
import { limit } from '@/lib/rateLimit';
import { contactRoutes } from '@/lib/site/contentStore';

export const runtime = 'nodejs';

/* Development only (owner, 2026-11-07): sends one test email to dev@ through the configured provider (the console in development). A 404 elsewhere. */
export async function POST() {
  if (process.env.NODE_ENV !== 'development') return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const closed = await maintenanceFor('admin');
  if (closed) return closed;
  const a = await adminOnly('super');
  if (!a.ok) return a.res;
  if (!(await limit(`test-email:${a.id}`, 5, 3_600_000))) return NextResponse.json({ error: 'Five test emails an hour.' }, { status: 429 });
  const routes = await contactRoutes();
  try {
    await emailProvider().send({ to: routes.dev, from: senderFrom(routes.support), subject: '[SellOnBay] Test email', text: 'This is a test email sent from Admin › Settings.' });
  } catch (e) {
    return NextResponse.json({ error: `Not sent: ${(e as Error).message.slice(0, 120)}` }, { status: 502 });
  }
  await audit(a.id, 'test_email_sent', 'settings', 'email', { to: routes.dev });
  return NextResponse.json({ ok: true });
}

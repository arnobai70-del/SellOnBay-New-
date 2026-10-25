import { NextResponse } from 'next/server';
import { adminOnly } from '@/lib/admin/guard';
import { planPayouts } from '@/lib/payouts';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';

/* Make this week's payout batch now (the Sunday job does the same). Shows who was left out and why. */
export async function POST() {
  const closed = await maintenanceFor('admin'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly();
  if (!a.ok) return a.res;
  const r = await planPayouts(Date.now(), a.id);
  return NextResponse.json({ weekStart: r.weekStart, created: r.created.length, skipped: r.skipped });
}

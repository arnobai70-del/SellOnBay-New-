import { NextResponse } from 'next/server';
import { adminOnly } from '@/lib/admin/guard';
import { systemSnapshot } from '@/lib/admin/system';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* The "Server and system" figures for the page's 30-second refresh. Read only: Super Admin with the authenticator code; no key or value leaves. */
export async function GET() {
  const closed = await maintenanceFor('admin'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly('super');
  if (!a.ok) return a.res;
  return NextResponse.json(await systemSnapshot(), { headers: { 'cache-control': 'no-store' } });
}

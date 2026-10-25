import { NextResponse } from 'next/server';
import { limit } from '@/lib/rateLimit';
import { exportData, logExport } from '@/lib/privacy';
import { getViewerId, staffNeedsCode } from '@/lib/supabase/viewer';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';

/* A copy of the signed-in person's own data, as a JSON file. Three a day at most. */
export async function GET() {
  const closed = await maintenanceFor('auth'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const id = await getViewerId();
  if (!id) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  if (await staffNeedsCode()) return NextResponse.json({ error: 'Enter your authenticator code first.' }, { status: 403 });
  if (!(await limit(`export:${id}`, 3, 24 * 3_600_000))) return NextResponse.json({ error: 'You already downloaded your data a few times today. Try again tomorrow.' }, { status: 429 });
  const data = await exportData(id);
  await logExport(id);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': 'attachment; filename="my-data.json"',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

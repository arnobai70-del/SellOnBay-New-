import { NextResponse } from 'next/server';
import { z } from 'zod';
import { markRead, unreadCount } from '@/lib/notify';
import { getViewerId } from '@/lib/supabase/viewer';
import { parseWith } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({ id: z.union([z.literal('all'), z.string().uuid()]) });

/* How many unread notifications the signed-in person has. */
export async function GET() {
  const closed = await maintenanceFor('messaging'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const id = await getViewerId();
  return NextResponse.json({ unread: id ? await unreadCount(id) : 0 }, { headers: { 'cache-control': 'no-store' } });
}

/* Mark one notification (or all of them) as read. Only your own. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('messaging'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const id = await getViewerId();
  if (!id) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const p = parseWith(schema, await req.json().catch(() => null));
  if (!p.ok) return p.res;
  await markRead(id, p.data.id);
  return NextResponse.json({ ok: true });
}

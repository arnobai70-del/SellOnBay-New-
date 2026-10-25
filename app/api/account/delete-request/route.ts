import { NextResponse } from 'next/server';
import { z } from 'zod';
import { limit } from '@/lib/rateLimit';
import { requestDeletion } from '@/lib/privacy';
import { getViewerId, staffNeedsCode } from '@/lib/supabase/viewer';
import { readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({ confirm: z.literal('DELETE') });

/* The signed-in person asks for their account to be deleted. Refused while orders, disputes or payouts are open. An admin then processes it. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('auth'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const id = await getViewerId();
  if (!id) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  if (await staffNeedsCode()) return NextResponse.json({ error: 'Enter your authenticator code first.' }, { status: 403 });
  const body = await readJson(req, schema);
  if (!body.ok) return NextResponse.json({ error: 'Type DELETE to confirm.' }, { status: 400 });
  if (!(await limit(`delete-req:${id}`, 3, 24 * 3_600_000))) return NextResponse.json({ error: 'Too many tries today.' }, { status: 429 });
  const r = await requestDeletion(id);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}

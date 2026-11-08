import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { setAllowIps } from '@/lib/maintenance/service';
import { readJson } from '@/lib/validate';

export const runtime = 'nodejs';
const schema = z.object({ ips: z.string().max(1200) });

/* Tester addresses that may use a closed area (one per line or comma separated). Super Admin; audited. Never closed itself. */
export async function POST(req: Request) {
  const a = await adminOnly('super');
  if (!a.ok) return a.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const r = await setAllowIps(a.id, body.data.ips.split(/[\s,]+/));
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}

import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { clientIp } from '@/lib/delivery/service';
import { runSiteIdeas } from '@/lib/tools/run';
import { readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({ idea: z.string().max(400), token: z.string().max(2048).optional() });
const COOKIE = 'lb-visitor';

/* The free site-ideas tool. A visitor is told apart by a random cookie AND by their address; both count toward the 5 daily runs. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('ai'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const existing = /(?:^|;\s*)lb-visitor=([0-9a-f-]{36})/.exec(req.headers.get('cookie') ?? '')?.[1];
  const cookieId = existing ?? randomUUID();
  const r = await runSiteIdeas({ idea: body.data.idea, cookieId, ip: clientIp(req), token: body.data.token });
  const res = r.ok ? NextResponse.json(r.data) : NextResponse.json({ error: r.error }, { status: r.status });
  res.headers.set('cache-control', 'no-store');
  if (!existing) res.cookies.set(COOKIE, cookieId, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 365 });
  return res;
}

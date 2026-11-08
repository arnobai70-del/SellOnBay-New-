import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { maintenanceFor } from '@/lib/maintenance/service';
import { saveContact, saveSite } from '@/lib/site/contentStore';
import { checkSocialUrl } from '@/lib/site/social';
import { readJson } from '@/lib/validate';

export const runtime = 'nodejs';
const schema = z.object({
  contact: z.record(z.string(), z.string().max(120)).optional(),
  social: z
    .array(z.object({ network: z.string().max(20), url: z.string().max(400), enabled: z.boolean() }))
    .max(14)
    .optional(),
});

/*
 * Admin › Settings › Contact & social (owner, 2026-11-08). Super Admin only; every change goes into the audit log (lib/site/contentStore.ts write()).
 * Addresses must be on our own domain; each social link must be https on that network's own domain, one per network, in the order sent.
 */
export async function POST(req: Request) {
  const closed = await maintenanceFor('admin');
  if (closed) return closed;
  const a = await adminOnly('super');
  if (!a.ok) return a.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const { contact, social } = body.data;
  if (!contact && !social) return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });
  if (social) {
    const seen = new Set<string>();
    for (const s of social) {
      if (seen.has(s.network)) return NextResponse.json({ error: 'Each network can be added once.' }, { status: 400 });
      seen.add(s.network);
      const c = checkSocialUrl(s.network, s.url);
      if (!c.ok) return NextResponse.json({ error: c.error }, { status: 400 });
    }
  }
  const results = [];
  if (contact) results.push(await saveContact(a.id, contact));
  if (social) results.push(await saveSite(a.id, 'social', social));
  const bad = results.find((r) => !r.ok && r.status !== 409);
  if (bad && !bad.ok) return NextResponse.json({ error: bad.error }, { status: bad.status });
  if (results.every((r) => !r.ok)) return NextResponse.json({ error: 'Nothing changed.' }, { status: 409 });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { blockEmail, blockKey } from '@/lib/guard';
import { readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z
  .object({
    kind: z.enum(['ip', 'device', 'email']),
    key: z
      .string()
      .regex(/^[0-9a-f]{24}$/)
      .optional(),
    email: z.string().trim().max(200).optional(),
    reason: z.string().max(500).default(''),
  })
  .refine((b) => (b.kind === 'email' ? !!b.email : !!b.key), { message: 'Say what to block.' });

/* Blocks a connection or a device (by its hash) or an email address (the address is hashed here). A reason is required and goes in the audit log. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('admin'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly();
  if (!a.ok) return a.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const { kind, key, email, reason } = body.data;
  const r = kind === 'email' ? await blockEmail(a.id, email!, reason) : await blockKey(a.id, kind, key!, reason);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}

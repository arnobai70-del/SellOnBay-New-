import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { setSettings } from '@/lib/settings';
import { readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const dollars = z.coerce
  .number()
  .refine((n) => Number.isFinite(n), 'Enter a number')
  .transform((n) => Math.round(n * 100));
const schema = z.object({
  priceMinCents: dollars.optional(),
  priceMaxCents: dollars.optional(),
  holdNewBuyerMinCents: dollars.optional(),
  earlyAccessOn: z.union([z.boolean(), z.enum(['on', 'off']).transform((v) => v === 'on')]).optional(),
  earlyAccessText: z.string().max(200).optional(),
  showExamples: z.union([z.boolean(), z.enum(['on', 'off']).transform((v) => v === 'on')]).optional(),
  reason: z.string().max(500).default(''),
});

/* Changes the shop's settings (price range, safety-check size, early access bar, example listings). A reason is required and goes in the audit log. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('admin'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly();
  if (!a.ok) return a.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const { reason, ...patch } = body.data;
  const r = await setSettings(a.id, patch, reason);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}

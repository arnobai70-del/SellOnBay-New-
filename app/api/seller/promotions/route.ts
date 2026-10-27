import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sellerOnly } from '@/lib/auth/guards';
import { draftPromotion, sellerPromotionAction, startPromotion } from '@/lib/ads/service';
import { readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('draft'),
    platform: z.string().max(10),
    productSlug: z.string().max(80),
    headline: z.string().max(200),
    text: z.string().max(400),
    dailyBudget: z.coerce.number(),
    days: z.coerce.number(),
  }),
  z.object({ action: z.enum(['submit', 'end', 'edit', 'start']), id: z.uuid() }),
]);

/* A seller drafts and sends a promotion of a live listing for review (lib/ads). Locked until B-9 and B-10: every call answers "not available". */
export async function POST(req: Request) {
  const closed = await maintenanceFor('seller'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const who = await sellerOnly();
  if (!who.ok) return who.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const d = body.data;
  const r =
    d.action === 'draft'
      ? await draftPromotion(who.id, { ...d, dailyBudgetCents: Math.round(d.dailyBudget) })
      : d.action === 'start'
        ? await startPromotion(who.id, d.id)
        : await sellerPromotionAction(who.id, d.id, d.action);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}

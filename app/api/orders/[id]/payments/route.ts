import { NextResponse } from 'next/server';
import { buyerOnly } from '@/lib/auth/guards';
import { limit } from '@/lib/rateLimit';
import { submitManualPayment } from '@/lib/payments/service';
import { PROOF_MAX_BYTES } from '@/lib/payments/rules';
import { idOf } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';

/* A buyer reports a manual payment (method, reference, amount, date, optional proof). It funds nothing until Finance reconciles it. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('checkout'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const who = await buyerOnly();
  if (!who.ok) return who.res;
  if (!(await limit(`pay-report:${who.id}`, 10, 3_600_000))) return NextResponse.json({ error: 'Too many payment reports this hour. Try again later.' }, { status: 429 });
  const id = await idOf(params);
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Send the payment details as a form.' }, { status: 400 });
  const text = (k: string) => String(form.get(k) ?? '').trim();
  const file = form.get('proof');
  let proof: { bytes: Uint8Array } | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > PROOF_MAX_BYTES) return NextResponse.json({ error: 'The proof can be at most 5 MB.' }, { status: 413 });
    proof = { bytes: new Uint8Array(await file.arrayBuffer()) };
  }
  const r = await submitManualPayment(who.id, id, { methodId: text('methodId'), reference: text('reference'), amountCents: Number(text('amountCents')), paidOn: text('paidOn') }, proof);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}

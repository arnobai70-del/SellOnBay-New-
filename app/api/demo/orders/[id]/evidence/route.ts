import { NextResponse } from 'next/server';
import { orderFor } from '@/lib/commerce/access';
import { buildEvidencePdf } from '@/lib/evidence';
import { idOf } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';

/* The evidence file of an order (timeline, deliveries, chat, certificate, acceptance, dispute) for the buyer of that order. */
export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('disputes'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const o = await orderFor(await idOf(params));
  if (!o) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  if (!o.fundedAt) return NextResponse.json({ error: 'There is nothing to show before the order is paid.' }, { status: 409 });
  return new NextResponse(new Uint8Array(await buildEvidencePdf(o, 'party')), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="evidence-${o.id.slice(0, 8)}.pdf"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

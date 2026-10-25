import { NextResponse } from 'next/server';
import { orderFor } from '@/lib/commerce/access';
import { getCertificate } from '@/lib/orders/certificate';
import { idOf } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';

/* The handover certificate of an accepted order, for the buyer of that order. */
export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('orders'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const o = await orderFor(await idOf(params));
  if (!o) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  const c = o.acceptedAt ? await getCertificate(o.id) : null;
  if (!c) return NextResponse.json({ error: 'The certificate is made once the order is accepted.' }, { status: 404 });
  return new NextResponse(new Uint8Array(c.bytes), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="handover-certificate-${o.id.slice(0, 8)}.pdf"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

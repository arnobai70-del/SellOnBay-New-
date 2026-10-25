import { NextResponse } from 'next/server';
import { orderFor } from '@/lib/commerce/access';
import { publicView } from '@/lib/commerce/types';
import { viewExtras } from '@/lib/commerce/viewExtras';
import { extrasOf } from '@/lib/orders/extra';
import { orderEvents } from '@/lib/orders/service';
import { idOf } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';

export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('orders'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const o = await orderFor(await idOf(params));
  if (!o) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  return NextResponse.json(publicView(o, await orderEvents(o.id), await extrasOf(o.id), await viewExtras(o)), {
    headers: { 'cache-control': 'no-store' },
  });
}

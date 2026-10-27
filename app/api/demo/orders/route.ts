import { NextResponse } from 'next/server';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';

/*
 * Instant checkout is closed for every new purchase (owner decision D-E, implementation brief rule 2). A purchase now starts with a request
 * (POST /api/requests), an admin quotation, and the buyer's acceptance, which creates the order (lib/requests/service.ts acceptQuote).
 * The old instant-order code is in git history before SellOnBay 2.0; existing orders made with it keep working through /api/demo/orders/[id].
 */
export async function POST() {
  const closed = await maintenanceFor('checkout'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  return NextResponse.json({ error: 'Purchases now start with a request. Open the product and choose "Request to buy"; SellOnBay will send you a quotation.' }, { status: 410 });
}

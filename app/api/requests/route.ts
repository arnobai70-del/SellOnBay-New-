import { NextResponse } from 'next/server';
import { buyerOnly } from '@/lib/auth/guards';
import { guard } from '@/lib/guard';
import { submitRequest } from '@/lib/requests/service';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';

/* A buyer sends a purchase request (owner decision D-E). No price is accepted from the browser; SellOnBay answers with a quotation. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('checkout'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const who = await buyerOnly();
  if (!who.ok) return who.res;
  const g = await guard('order', who.id);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Send the request as JSON.' }, { status: 400 });
  const r = await submitRequest(who.id, {
    product: typeof body.product === 'string' ? body.product.slice(0, 80) : undefined,
    kind: body.kind === 'custom_dev' ? 'custom_dev' : 'product',
    licenceTier: body.licenceTier,
    package: body.package,
    intendedUse: body.intendedUse,
    requirements: body.requirements,
    express: body.express,
    hosting: body.hosting,
    delivery: (body.delivery as object) ?? {},
    business: (body.business as object) ?? {},
    consent: body.consent,
  });
  return r.ok ? NextResponse.json({ ok: true, id: r.value.id }) : NextResponse.json({ error: r.error }, { status: r.status });
}

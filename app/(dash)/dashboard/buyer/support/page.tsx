import type { Metadata } from 'next';
import { BuyerShell } from '@/components/glass/BuyerShell';
import { SupportPage } from '@/components/SupportPage';
import { ticketsOf } from '@/lib/messaging/service';
import { orderStore } from '@/lib/orders/store';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Support', robots: { index: false } };
export const dynamic = 'force-dynamic';

/* The buyer's support tickets with SellOnBay (admin-mediated, D-B). */
export default async function BuyerSupport({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const viewer = await requireViewer({ path: '/dashboard/buyer/support', roles: ['buyer', 'seller'] });
  const { t } = await searchParams;
  const tickets = viewer ? await ticketsOf({ id: viewer.id, role: 'buyer' }) : [];
  const open = tickets.find((x) => x.id === t) ?? null;
  const orders = viewer ? (await (await orderStore()).forUser(viewer.id)).filter((o) => o.buyerId === viewer.id).slice(0, 30) : [];
  return (
    <BuyerShell viewer={viewer} active="support" title="Support & disputes" subtitle="Talk to SellOnBay. Your money stays in escrow while a problem is open.">
      {!viewer ? (
        <p className="muted">Support needs an account. There are no accounts in demo mode.</p>
      ) : (
        <SupportPage me="buyer" base="/dashboard/buyer/support" tickets={tickets} open={open} orders={orders.map((o) => ({ id: o.id, title: o.title }))} />
      )}
    </BuyerShell>
  );
}

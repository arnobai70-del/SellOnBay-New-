import type { Metadata } from 'next';
import { SellerShell } from '@/components/glass/SellerShell';
import { SupportPage } from '@/components/SupportPage';
import { ticketsOf } from '@/lib/messaging/service';
import { orderStore } from '@/lib/orders/store';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Support', robots: { index: false } };
export const dynamic = 'force-dynamic';

/* The seller's support tickets and disputes with SellOnBay (admin-mediated, D-B). Order chats stay at /messages. */
export default async function SellerSupport({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const viewer = await requireViewer({ path: '/dashboard/seller/support', roles: ['seller'] });
  const { t } = await searchParams;
  const tickets = viewer ? await ticketsOf({ id: viewer.id, role: 'seller' }) : [];
  const open = tickets.find((x) => x.id === t) ?? null;
  const orders = viewer ? (await (await orderStore()).forUser(viewer.id)).filter((o) => o.sellerId === viewer.id).slice(0, 30) : [];
  return (
    <SellerShell viewer={viewer} active="support" title="Disputes & messages" subtitle="Talk to SellOnBay about an order or a dispute. Chats with buyers are inside each order.">
      <SupportPage me="seller" base="/dashboard/seller/support" tickets={tickets} open={open} orders={orders.map((o) => ({ id: o.id, title: o.title }))} />
    </SellerShell>
  );
}

import type { Metadata } from 'next';
import { DashShell } from '@/components/DashShell';
import { SupportPage } from '@/components/SupportPage';
import { ticketsOf } from '@/lib/messaging/service';
import { orderStore } from '@/lib/orders/store';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Support', robots: { index: false } };
export const dynamic = 'force-dynamic';

/* The seller's support tickets with SellOnBay (admin-mediated, D-B). */
export default async function SellerSupport({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const viewer = await requireViewer({ path: '/dashboard/seller/support', roles: ['seller'] });
  const { t } = await searchParams;
  const tickets = viewer ? await ticketsOf({ id: viewer.id, role: 'seller' }) : [];
  const open = tickets.find((x) => x.id === t) ?? null;
  const orders = viewer ? (await (await orderStore()).forUser(viewer.id)).filter((o) => o.sellerId === viewer.id).slice(0, 30) : [];
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="seller" active="seller-support" title="Support">
      {!viewer ? (
        <p className="muted">Support needs an account. There are no accounts in demo mode.</p>
      ) : (
        <SupportPage me="seller" base="/dashboard/seller/support" tickets={tickets} open={open} orders={orders.map((o) => ({ id: o.id, title: o.title }))} />
      )}
    </DashShell>
  );
}

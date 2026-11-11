import type { Metadata } from 'next';
import Link from 'next/link';
import { BuyerShell } from '@/components/glass/BuyerShell';
import { SupportPage } from '@/components/SupportPage';
import { plainWords } from '@/lib/glass/words';
import { ticketsOf } from '@/lib/messaging/service';
import { orderStore } from '@/lib/orders/store';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Support', robots: { index: false } };
export const dynamic = 'force-dynamic';

/* design-reference/buyer-support.html: the buyer's tickets with SellOnBay (admin-mediated, D-B). ?new=1 opens a new ticket. */
export default async function BuyerSupport({ searchParams }: { searchParams: Promise<{ t?: string; new?: string }> }) {
  const viewer = await requireViewer({ path: '/dashboard/buyer/support', roles: ['buyer', 'seller', 'admin'] });
  const sp = await searchParams;
  const tickets = viewer ? await ticketsOf({ id: viewer.id, role: 'buyer' }) : [];
  const open = tickets.find((x) => x.id === sp.t) ?? null;
  const orders = viewer ? (await (await orderStore()).forUser(viewer.id)).filter((o) => o.buyerId === viewer.id).slice(0, 30) : [];
  return (
    <BuyerShell viewer={viewer} active="support" file="buyer-support" title="Support & disputes" head={false}>
      <div className="row">
        <div>
          <h1>Support &amp; disputes</h1>
          <div className="tag">Talk to SellOnBay. Your money stays in escrow while a problem is open.</div>
        </div>
        <Link className="btn" href="/dashboard/buyer/support?new=1" prefetch={false}>
          + New ticket
        </Link>
      </div>
      {!viewer ? (
        <p className="muted">Support needs an account. There are no accounts in demo mode.</p>
      ) : (
        <SupportPage
          me="buyer"
          base="/dashboard/buyer/support"
          tickets={tickets}
          open={open}
          newTicket={sp.new === '1'}
          now={Date.now()}
          orders={orders.map((o) => ({ id: o.id, title: plainWords(o.title) }))}
        />
      )}
    </BuyerShell>
  );
}

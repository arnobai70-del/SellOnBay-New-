import type { Metadata } from 'next';
import Link from 'next/link';
import { SellerShell } from '@/components/glass/SellerShell';
import { SupportPage } from '@/components/SupportPage';
import { plainWords } from '@/lib/glass/words';
import { ticketsOf } from '@/lib/messaging/service';
import { orderStore } from '@/lib/orders/store';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Support', robots: { index: false } };
export const dynamic = 'force-dynamic';

const TABS = [
  ['all', 'All'],
  ['disputes', 'Disputes'],
  ['questions', 'Questions'],
] as const;

/*
 * design-reference/seller-support.html: the seller's tickets and disputes with SellOnBay (admin-mediated, D-B). A ticket about an order counts as a
 * dispute here; the others are questions. Chats with buyers stay inside each order. ?new=1 opens a new ticket.
 */
export default async function SellerSupport({ searchParams }: { searchParams: Promise<{ t?: string; tab?: string; new?: string }> }) {
  const viewer = await requireViewer({ path: '/dashboard/seller/support', roles: ['seller'] });
  const sp = await searchParams;
  const tab = TABS.find(([k]) => k === sp.tab)?.[0] ?? 'all';
  const all = viewer ? await ticketsOf({ id: viewer.id, role: 'seller' }) : [];
  const tickets = all.filter((t) => (tab === 'disputes' ? !!t.orderId : tab === 'questions' ? !t.orderId : true));
  const open = all.find((x) => x.id === sp.t) ?? null;
  const orders = viewer ? (await (await orderStore()).forUser(viewer.id)).filter((o) => o.sellerId === viewer.id).slice(0, 30) : [];
  return (
    <SellerShell viewer={viewer} active="support" file="seller-support" title="Disputes & messages" head={false}>
      <div className="row">
        <div>
          <h1>Disputes &amp; messages</h1>
          <div className="tag">Answer fast. A problem pauses payment until it is solved. Chats with buyers are inside each order.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="seg" role="tablist" aria-label="Filter">
            {TABS.map(([k, l]) => (
              <Link
                key={k}
                role="tab"
                className={k === tab ? 'on' : ''}
                aria-selected={k === tab}
                href={k === 'all' ? '/dashboard/seller/support' : `/dashboard/seller/support?tab=${k}`}
                prefetch={false}
              >
                {l}
              </Link>
            ))}
          </div>
          <Link className="btn ghost" href="/dashboard/seller/support?new=1" prefetch={false}>
            + New ticket
          </Link>
        </div>
      </div>
      <SupportPage
        me="seller"
        base="/dashboard/seller/support"
        tickets={tickets}
        open={open}
        newTicket={sp.new === '1'}
        now={Date.now()}
        orders={orders.map((o) => ({ id: o.id, title: plainWords(o.title) }))}
      />
    </SellerShell>
  );
}

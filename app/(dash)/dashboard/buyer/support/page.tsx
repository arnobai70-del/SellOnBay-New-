import type { Metadata } from 'next';
import Link from 'next/link';
import { BuyerShell } from '@/components/glass/BuyerShell';
import { SupportPage } from '@/components/SupportPage';
import { plainWords } from '@/lib/glass/words';
import { ticketsOf } from '@/lib/messaging/service';
import { orderStore } from '@/lib/orders/store';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Support'), robots: { index: false } });
export const dynamic = 'force-dynamic';

/* design-reference/buyer-support.html: the buyer's tickets with SellOnBay (admin-mediated, D-B). ?new=1 opens a new ticket. */
export default async function BuyerSupport({ searchParams }: { searchParams: Promise<{ t?: string; new?: string }> }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/dashboard/buyer/support', roles: ['buyer', 'seller', 'admin'] });
  const sp = await searchParams;
  const tickets = viewer ? await ticketsOf({ id: viewer.id, role: 'buyer' }) : [];
  const open = tickets.find((x) => x.id === sp.t) ?? null;
  const orders = viewer ? (await (await orderStore()).forUser(viewer.id)).filter((o) => o.buyerId === viewer.id).slice(0, 30) : [];
  return (
    <BuyerShell viewer={viewer} active="support" file="buyer-support" title={tx('Support & disputes')} head={false}>
      <div className="row">
        <div>
          <h1>
            <T s={'Support & disputes'} />
          </h1>
          <div className="tag">
            <T s={'Talk to SellOnBay. Your money stays in escrow while a problem is open.'} />
          </div>
        </div>
        <Link className="btn" href="/dashboard/buyer/support?new=1" prefetch={false}>
          <T s={'+ New ticket'} />
        </Link>
      </div>
      {!viewer ? (
        <p className="muted">
          <T s={'Support needs an account. There are no accounts in demo mode.'} />
        </p>
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

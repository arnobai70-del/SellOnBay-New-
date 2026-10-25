import type { Metadata } from 'next';
import Link from 'next/link';
import { DashShell } from '@/components/DashShell';
import { shellRole } from '@/lib/admin/mode';
import { roleIn } from '@/lib/chat';
import { orderStore } from '@/lib/orders/store';
import { supabaseConfigured } from '@/lib/supabase/env';
import { getViewerId, requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Messages', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function Messages({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const viewer = await requireViewer({ path: '/messages' });
  const role = shellRole(viewer?.role, (await searchParams).view, process.env);
  const id = await getViewerId();
  const orders = id ? (await (await orderStore()).forUser(id)).filter((o) => !!o.fundedAt && o.state !== 'cancelled' && o.state !== 'refunded') : [];
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role={role} active="messages" title="Messages">
      <div className="dp">
        <div className="hd">
          <div>
            <h2>Your order chats</h2>
            <p className="sub">Every order has its own chat, open once the payment is held in escrow. Emails, phone numbers, links and outside payments are blocked.</p>
          </div>
        </div>
        {!supabaseConfigured && <p className="muted">In demo mode there are no accounts, so each order has its chat on its own order page, under the timeline.</p>}
        {supabaseConfigured && orders.length === 0 && <p className="muted">No chats yet. Once you buy something, or a buyer pays for your listing, the chat for that order shows up here.</p>}
        <ul className="lst">
          {orders.map((o) => (
            <li key={o.id}>
              <span className="av">{o.title[0]?.toUpperCase()}</span>
              <div className="grow">
                <b>{o.title}</b>
                <small>
                  You are the {roleIn(o, id)} · order {o.id.slice(0, 8).toUpperCase()} · {o.state.replace('_', ' ')}
                </small>
              </div>
              <Link className="btn btn-line btn-sm" href={`/messages/${o.id}?view=${role}`}>
                Open chat
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </DashShell>
  );
}

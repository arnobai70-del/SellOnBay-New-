import type { Metadata } from 'next';
import Link from 'next/link';
import { DashShell } from '@/components/DashShell';
import { shellRole } from '@/lib/admin/mode';
import { roleIn } from '@/lib/chat';
import { orderStore } from '@/lib/orders/store';
import { supabaseConfigured } from '@/lib/supabase/env';
import { getViewerId, requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const metadata: Metadata = { title: 'Messages', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function Messages({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/messages' });
  const role = shellRole(viewer?.role, (await searchParams).view, process.env);
  const id = await getViewerId();
  const orders = id ? (await (await orderStore()).forUser(id)).filter((o) => !!o.fundedAt && o.state !== 'cancelled' && o.state !== 'refunded') : [];
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role={role} active="messages" title={tx('Messages')}>
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Your order chats'} />
            </h2>
            <p className="tag">
              <T s={'Each paid order has its messages with SellOnBay here, and the earlier buyer and seller chat to read. Emails, phone numbers, links and outside payments are blocked.'} />
            </p>
          </div>
        </div>
        {!supabaseConfigured && (
          <p className="muted">
            <T s={'In demo mode there are no accounts, so each order has its chat on its own order page, under the timeline.'} />
          </p>
        )}
        {supabaseConfigured && orders.length === 0 && (
          <p className="muted">
            <T s={'No chats yet. Once you buy something, or a buyer pays for your listing, the chat for that order shows up here.'} />
          </p>
        )}
        <ul className="sob-list">
          {orders.map((o) => (
            <li key={o.id}>
              <span className="av">{o.title[0]?.toUpperCase()}</span>
              <div className="sob-grow">
                <b>{o.title}</b>
                <small>
                  <T s={'You are the {v0} · order {v1} · {v2}'} v={{ v0: roleIn(o, id), v1: o.id.slice(0, 8).toUpperCase(), v2: o.state.replace('_', ' ') }} />
                </small>
              </div>
              <Link className="btn ghost sm" href={`/messages/${o.id}?view=${role}`}>
                <T s={'Open chat'} />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </DashShell>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashShell } from '@/components/DashShell';
import { shellRole } from '@/lib/admin/mode';
import { OrderChat } from '@/components/OrderChat';
import { chatOpen, roleIn } from '@/lib/chat';
import { getOrder } from '@/lib/orders/service';
import { supabaseConfigured } from '@/lib/supabase/env';
import { getViewerId, requireViewer } from '@/lib/supabase/viewer';
import { idParam } from '@/lib/validate';

export const metadata: Metadata = { title: 'Order chat', robots: { index: false } };
export const dynamic = 'force-dynamic';

/* The chat of one order, for the buyer or the seller of that order (anybody else gets a 404). */
export default async function OrderChatPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer({ path: `/messages/${id}` });
  const shell = shellRole(viewer?.role, (await searchParams).view, process.env);
  const ok = idParam.safeParse(id);
  const o = ok.success ? await getOrder(ok.data) : null;
  const me = (await getViewerId()) ?? null;
  const role = o ? roleIn(o, me) : null;
  if (!o || !role) notFound();
  const signedIn = supabaseConfigured && !!me;
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role={shell} active="messages" title="Messages">
      <div className="dp">
        <div className="hd">
          <div>
            <h2>{o.title}</h2>
            <p className="sub">
              You are the {role}. Order {o.id.slice(0, 8).toUpperCase()}. {role === 'buyer' ? <Link href={`/orders/${o.id}`}>Open the order</Link> : null}
            </p>
          </div>
        </div>
        <OrderChat endpoint={signedIn ? `/api/orders/${o.id}/messages` : `/api/demo/orders/${o.id}/messages`} orderId={o.id} me={role} open={chatOpen(o)} live={signedIn} />
      </div>
    </DashShell>
  );
}

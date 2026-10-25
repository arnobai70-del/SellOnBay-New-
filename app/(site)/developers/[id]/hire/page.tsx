import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HireForm } from '@/components/HireForm';
import { getDev } from '@/lib/devsDb';
import { supabaseConfigured } from '@/lib/supabase/env';
import { getViewerId, requireViewer } from '@/lib/supabase/viewer';
import { mayBuy } from '@/lib/accounts';
import { BuyersOnly } from '@/components/BuyersOnly';

export const metadata: Metadata = { title: 'Hire a developer' };
export const dynamic = 'force-dynamic';

export default async function Hire({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pack?: string }> }) {
  const { id } = await params;
  const { pack } = await searchParams;
  const r = await getDev(id, await getViewerId());
  if (!r || r.status !== 'live') notFound();
  const trial = pack === 'Trial';
  const i = trial
    ? 3
    : Math.max(
        0,
        r.dev.packs.findIndex((p) => p.name === pack),
      );
  const viewer = await requireViewer({ path: `/developers/${id}/hire?pack=${trial ? 'Trial' : r.dev.packs[i].name}` });
  if (viewer && !mayBuy(viewer.role)) return <BuyersOnly role={viewer.role} />;
  return <HireForm dev={r.dev} start={i} live={supabaseConfigured} />;
}

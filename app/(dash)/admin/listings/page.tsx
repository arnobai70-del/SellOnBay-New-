import type { Metadata } from 'next';
import { SaleCell } from '@/components/glass/SaleCell';
import { historyOf, openSalesBySlug } from '@/lib/prices/service';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createAdminClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { ListingReviewCard } from '@/components/ListingReviewCard';
import { AdminShell } from '@/components/glass/AdminShell';
import { DataTable } from '@/components/glass/DataTable';
import { GlassCard } from '@/components/glass/GlassCard';
import { Seg } from '@/components/glass/Seg';
import { StatusPill, type PillTone } from '@/components/glass/StatusPill';
import { allListings, listingQueue, type AdminListingRow } from '@/lib/admin/queue';
import { shortDate, usd } from '@/lib/glass/orderStatus';
import { plainWords } from '@/lib/glass/words';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Listing review', robots: { index: false } };
export const dynamic = 'force-dynamic';

const STATUS: Record<string, [string, PillTone]> = { live: ['Live', 'ok'], in_review: ['In review', 'wait'], rejected: ['Rejected', 'bad'], paused: ['Paused', 'draft'] };
const FILTERS = ['', 'in_review', 'live', 'paused', 'rejected'];

/*
 * The review queue (approve, send back with a note, or reject; a digital product needs the sandbox tick) and every listing. No file is scanned:
 * open the files in a sandbox before approving (owner, 2026-10-25). Deeper edits stay at the SEO listing editor.
 */
export default async function AdminListings({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const viewer = await requireViewer({ path: '/admin/listings', roles: ['admin'], scope: 'catalog' });
  const raw = (await searchParams).status ?? '';
  const status = FILTERS.includes(raw) ? raw : '';
  const [queue, rows] = await Promise.all([listingQueue(), allListings(status)]);
  // Each listing's sale and price history (owner, 2026-11-08), so an admin can spot a raised price before a "sale".
  const { data: idRows } = supabaseConfigured
    ? await createAdminClient()
        .from('products')
        .select('id, slug')
        .in(
          'slug',
          rows.map((r) => r.slug),
        )
    : { data: [] };
  const ids = (idRows ?? []) as { id: string; slug: string }[];
  const [sales, history] = await Promise.all([openSalesBySlug(ids), historyOf(ids.map((r) => r.id))]);
  const historyOfSlug = (slug: string) => history.get(ids.find((r) => r.slug === slug)?.id ?? '') ?? [];
  return (
    <AdminShell viewer={viewer} active="listings" title="Listing review" subtitle="Check the live demo, the files, the database schema, the setup guide, the price and that nothing is copied.">
      <GlassCard as="section">
        <h2>Waiting for review ({queue.length})</h2>
        <p className="g-tag">Files are not scanned. Open them in a sandbox before you approve.</p>
        {queue.length ? (
          <div className="g-stack" style={{ marginTop: 10 }}>
            {queue.map((l) => (
              <ListingReviewCard key={l.slug} l={l} />
            ))}
          </div>
        ) : (
          <p className="g-muted" style={{ marginTop: 8 }}>
            Nothing is waiting.
          </p>
        )}
      </GlassCard>
      <GlassCard as="section" pad={false} style={{ padding: '14px 8px 4px' }}>
        <div style={{ padding: '0 14px 6px' }}>
          <h2>All listings</h2>
          <Seg label="Listing status" value={status} items={FILTERS.map((f) => ({ key: f, label: f ? (STATUS[f]?.[0] ?? f) : 'All', href: f ? `/admin/listings?status=${f}` : '/admin/listings' }))} />
        </div>
        <DataTable<AdminListingRow>
          caption="All listings"
          rows={rows}
          rowKey={(l) => l.slug}
          empty="No listings."
          columns={[
            { key: 'name', label: 'Website', cell: (l) => <Link href={`/dashboard/admin/seo/product?slug=${encodeURIComponent(l.slug)}`}>{plainWords(l.name)}</Link> },
            { key: 'seller', label: 'Seller', cell: (l) => l.seller },
            { key: 'price', label: 'Price', cell: (l) => usd(l.priceCents) },
            { key: 'date', label: 'Added', cell: (l) => shortDate(l.createdAt) },
            { key: 'sale', label: 'Sale', cell: (l) => <SaleCell slug={l.slug} sale={sales.get(l.slug) ?? null} endpoint="/api/admin/listings/sale" /> },
            {
              key: 'history',
              label: 'Price history',
              cell: (l) => {
                const h = historyOfSlug(l.slug);
                return h.length ? (
                  <details>
                    <summary>{h.length} prices</summary>
                    {[...h].reverse().map((x) => (
                      <div key={x.from} className="g-tag">
                        {usd(x.priceCents)} from {shortDate(x.from)}
                        {x.to ? ` to ${shortDate(x.to)}` : ' (now)'}
                      </div>
                    ))}
                  </details>
                ) : (
                  '-'
                );
              },
            },
            {
              key: 'status',
              label: 'Status',
              cell: (l) => {
                const [label, tone] = STATUS[l.status] ?? [l.status, 'draft'];
                return <StatusPill tone={tone}>{label}</StatusPill>;
              },
            },
          ]}
        />
      </GlassCard>
    </AdminShell>
  );
}

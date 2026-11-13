import type { Metadata } from 'next';
import Link from 'next/link';
import { DashShell } from '@/components/DashShell';
import { ListingReviewCard } from '@/components/ListingReviewCard';
import { allListings, listingQueue } from '@/lib/admin/queue';
import { allHubViews } from '@/lib/seo/hubStore';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
import type { Tx } from '@/lib/i18n/tx';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Listings'), robots: { index: false } });
export const dynamic = 'force-dynamic';

const money = (c: number) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0 });
const CHIP = (tx: Tx): Record<string, [string, string]> => ({
  live: ['Live', 'status st-ok'],
  in_review: [tx('In review'), 'status st-wait'],
  rejected: ['Rejected', 'status st-bad'],
  paused: ['Paused', 'status st-bad'],
});
const FILTERS = (tx: Tx): [string, string][] => [
  ['', tx('All')],
  ['in_review', tx('In review')],
  ['live', tx('Live')],
  ['rejected', tx('Rejected')],
  ['paused', tx('Paused')],
];

/* Where an admin approves new sites and fixes prices: the review queue first, then every listing with its status, price and an Edit link. */
export default async function AdminListings({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/listings/all', roles: ['admin'], scope: 'catalog' });
  const { status = '' } = await searchParams;
  const [queue, rows, views] = await Promise.all([listingQueue(), allListings(status), allHubViews().catch(() => [])]);
  // Where a live listing shows on the site: the category page it was placed in, or why it is not shown.
  const shownIn = (slug: string) => views.find((v) => v.products.some((p) => p.id === slug))?.hub.name ?? null;
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-listings" title={tx('Listings')}>
      <div className="glass card sob-sec" id="approve">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Waiting for approval ({length})'} v={{ length: queue.length }} />
            </h2>
            <p className="tag">
              <T s={'Open the demo and the files, check the price, then decide. The seller is told your note. Open the files in a sandbox first.'} />
            </p>
          </div>
        </div>
        {queue.length === 0 && (
          <p className="muted">
            <T s={'Nothing is waiting for review.'} />
          </p>
        )}
        {queue.map((l) => (
          <ListingReviewCard key={l.slug} l={l} />
        ))}
      </div>

      <div className="glass card sob-sec" id="all">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'All listings'} />
            </h2>
            <p className="tag">
              <T s={'Change a price, words or pictures with Edit. Orders already placed keep the price they were made at.'} />
            </p>
          </div>
        </div>
        <div className="sob-acts">
          {FILTERS(tx).map(([v, label]) => (
            <Link key={v} className={'btn sm' + (v === status ? '' : ' ghost')} href={v ? `/admin/listings/all?status=${v}` : '/admin/listings/all'}>
              {label}
            </Link>
          ))}
        </div>
        {rows.length === 0 && (
          <p className="muted">
            <T s={'No listings here.'} />
          </p>
        )}
        <ul className="sob-list">
          {rows.map((r) => {
            const [label, cls] = CHIP(tx)[r.status] ?? [r.status, 'status st-draft'];
            return (
              <li key={r.slug}>
                <div className="sob-grow">
                  <b>{r.name}</b>
                  <small>
                    <T s={'by {seller} · {platform} · {v2}'} v={{ seller: r.seller, platform: r.platform, v2: money(r.priceCents) }} />
                  </small>
                  {r.status === 'live' && (
                    <small>
                      {shownIn(r.slug)
                        ? tx('Shown in {shownIn}', { shownIn: shownIn(r.slug) ?? '' })
                        : tx('Not shown on the site: its category is full or hidden. Change it under SEO and blog > Categories.')}
                    </small>
                  )}
                </div>
                <Link className="btn ghost sm" href={`/admin/seo/product?slug=${encodeURIComponent(r.slug)}`}>
                  <T s={'Edit price and details'} />
                </Link>
                <span className={cls}>
                  <i />
                  {label}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </DashShell>
  );
}

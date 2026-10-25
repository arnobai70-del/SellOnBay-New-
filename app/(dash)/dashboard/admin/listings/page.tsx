import type { Metadata } from 'next';
import Link from 'next/link';
import { DashShell } from '@/components/DashShell';
import { ListingReviewCard } from '@/components/ListingReviewCard';
import { allListings, listingQueue } from '@/lib/admin/queue';
import { allHubViews } from '@/lib/seo/hubStore';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Listings', robots: { index: false } };
export const dynamic = 'force-dynamic';

const money = (c: number) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0 });
const CHIP: Record<string, [string, string]> = { live: ['Live', 'chip mint'], in_review: ['In review', 'chip amber'], rejected: ['Rejected', 'chip rose'], paused: ['Paused', 'chip rose'] };
const FILTERS: [string, string][] = [
  ['', 'All'],
  ['in_review', 'In review'],
  ['live', 'Live'],
  ['rejected', 'Rejected'],
  ['paused', 'Paused'],
];

/* Where an admin approves new sites and fixes prices: the review queue first, then every listing with its status, price and an Edit link. */
export default async function AdminListings({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const viewer = await requireViewer({ path: '/dashboard/admin/listings', roles: ['admin'] });
  const { status = '' } = await searchParams;
  const [queue, rows, views] = await Promise.all([listingQueue(), allListings(status), allHubViews().catch(() => [])]);
  // Where a live listing shows on the site: the category page it was placed in, or why it is not shown.
  const shownIn = (slug: string) => views.find((v) => v.products.some((p) => p.id === slug))?.hub.name ?? null;
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-listings" title="Listings">
      <div className="dp" id="approve">
        <div className="hd">
          <div>
            <h2>Waiting for approval ({queue.length})</h2>
            <p className="sub">Open the demo and the files, check the price, then decide. The seller is told your note. Open the files in a sandbox first.</p>
          </div>
        </div>
        {queue.length === 0 && <p className="muted">Nothing is waiting for review.</p>}
        {queue.map((l) => (
          <ListingReviewCard key={l.slug} l={l} />
        ))}
      </div>

      <div className="dp" id="all">
        <div className="hd">
          <div>
            <h2>All listings</h2>
            <p className="sub">Change a price, words or pictures with Edit. Orders already placed keep the price they were made at.</p>
          </div>
        </div>
        <div className="adm-btns">
          {FILTERS.map(([v, label]) => (
            <Link key={v} className={'btn btn-sm ' + (v === status ? 'btn-dark' : 'btn-line')} href={v ? `/dashboard/admin/listings?status=${v}` : '/dashboard/admin/listings'}>
              {label}
            </Link>
          ))}
        </div>
        {rows.length === 0 && <p className="muted">No listings here.</p>}
        <ul className="lst">
          {rows.map((r) => {
            const [label, cls] = CHIP[r.status] ?? [r.status, 'chip'];
            return (
              <li key={r.slug}>
                <div className="grow">
                  <b>{r.name}</b>
                  <small>
                    by {r.seller} · {r.platform} · {money(r.priceCents)}
                  </small>
                  {r.status === 'live' && (
                    <small>{shownIn(r.slug) ? `Shown in ${shownIn(r.slug)}` : 'Not shown on the site: its category is full or hidden. Change it under SEO and blog > Categories.'}</small>
                  )}
                </div>
                <Link className="btn btn-line btn-sm" href={`/dashboard/admin/seo/product?slug=${encodeURIComponent(r.slug)}`}>
                  Edit price and details
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

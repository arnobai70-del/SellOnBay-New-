import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminForm } from '@/components/AdminForm';
import { AdminShell } from '@/components/glass/AdminShell';
import { SaleCell } from '@/components/glass/SaleCell';
import { auditList } from '@/lib/admin/audit';
import { allListings, listingQueue, type QueueListing } from '@/lib/admin/queue';
import { CONFIG, DAY_MS } from '@/lib/config';
import { shortDate, usd } from '@/lib/glass/orderStatus';
import { plainWords } from '@/lib/glass/words';
import { historyOf, openSalesBySlug } from '@/lib/prices/service';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createAdminClient } from '@/lib/supabase/server';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Listing review', robots: { index: false } };
export const dynamic = 'force-dynamic';

const STATUS: Record<string, [string, string]> = { live: ['Live', 'st-ok'], in_review: ['In review', 'st-info'], rejected: ['Changes requested', 'st-bad'], paused: ['Paused', 'st-draft'] };
const TABS = [
  ['waiting', 'Waiting'],
  ['changes', 'Changes requested'],
  ['approved', 'Recently approved'],
] as const;
const FILTERS = ['', 'in_review', 'live', 'paused', 'rejected'];
const ago = (t: number, now: number) => {
  const h = Math.round((now - t) / 3_600_000);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)} days ago`;
};
/* The thumbnail tints of the design file, one per card. */
const TINT = ['#D3EEE4', '#E1E2F6', '#DDEAF6', '#F1E8DD'];

/* What the design's checklist checks, from the listing's own facts. */
function checks(l: QueueListing): [ok: boolean, text: string][] {
  return [
    [!!l.demoUrl, l.demoUrl ? 'Live demo link given' : 'No live demo link'],
    [!!l.codeUrl, l.codeUrl ? 'Files link given' : 'No files link'],
    [l.includes.length >= 4, `${l.includes.length} included items listed`],
    [l.description.trim().length >= 80, 'Clear description'],
    [l.priceCents >= CONFIG.sale.priceMinCents, `Price at least $${CONFIG.sale.priceMinCents / 100}`],
    [!!l.licence, l.licence ? 'Licence type set' : 'No licence type'],
  ];
}

/*
 * design-reference/admin-listings.html: the review queue as cards (approve, send back with a note, decline; a digital product needs the sandbox
 * tick), then every listing with its sale and price history (owner, 2026-11-08). No file is scanned: open the files in a sandbox before approving.
 */
export default async function AdminListings({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string }> }) {
  const viewer = await requireViewer({ path: '/admin/listings', roles: ['admin'], scope: 'catalog' });
  const sp = await searchParams;
  const tab = TABS.find(([k]) => k === sp.tab)?.[0] ?? 'waiting';
  const status = FILTERS.includes(sp.status ?? '') ? (sp.status ?? '') : '';
  const now = Date.now();
  const [queue, all, rows, log, { data: idRows }] = await Promise.all([
    listingQueue(),
    allListings(''),
    allListings(status),
    auditList(300, { targetType: 'product' }),
    supabaseConfigured ? createAdminClient().from('products').select('id, slug').neq('status', 'draft').limit(500) : Promise.resolve({ data: [] }),
  ]);
  const ids = (idRows ?? []) as { id: string; slug: string }[];
  const [sales, history] = await Promise.all([openSalesBySlug(ids), historyOf(ids.map((r) => r.id))]);
  const historyOfSlug = (slug: string) => history.get(ids.find((r) => r.slug === slug)?.id ?? '') ?? [];
  const approvedWeek = log.filter((a) => a.action === 'listing_approve' && a.at >= now - 7 * DAY_MS);
  const changes = all.filter((l) => l.status === 'rejected');
  const live = all.filter((l) => l.status === 'live');
  const recentlyApproved = [...new Set(log.filter((a) => a.action === 'listing_approve').map((a) => a.targetRef))].map((slug) => all.find((l) => l.slug === slug)).filter((l) => !!l);
  const oldest = queue.length ? Math.min(...queue.map((l) => l.createdAt)) : null;
  return (
    <AdminShell viewer={viewer} active="listings" file="admin-listings" title="Listing review" head={false}>
      <div className="row">
        <div>
          <h1>Listing review</h1>
          <div className="tag">Check every website before buyers can see it. Files are not scanned: open them in a sandbox before you approve.</div>
        </div>
        <div className="seg" role="tablist" aria-label="Queue">
          {TABS.map(([k, l]) => (
            <Link key={k} role="tab" className={k === tab ? 'on' : ''} aria-selected={k === tab} href={k === 'waiting' ? '/admin/listings' : `/admin/listings?tab=${k}`} prefetch={false}>
              {l}
            </Link>
          ))}
        </div>
      </div>
      <div className="kpis">
        <div className="glass kpi">
          <div className="l">Waiting for review</div>
          <div className="v">{queue.length}</div>
          <div className="s">{oldest ? `Oldest ${ago(oldest, now).replace(' ago', '')}` : 'None waiting'}</div>
        </div>
        <div className="glass kpi">
          <div className="l">Approved this week</div>
          <div className="v">{approvedWeek.length}</div>
          <div className="s">From the audit log</div>
        </div>
        <div className="glass kpi">
          <div className="l">Changes requested</div>
          <div className="v">{changes.length}</div>
          <div className="s">Waiting on seller</div>
        </div>
        <div className="glass kpi">
          <div className="l">Live websites</div>
          <div className="v">{live.length}</div>
          <div className="s">{sales.size} on sale now</div>
        </div>
      </div>

      {tab === 'waiting' &&
        (queue.length ? (
          queue.map((l, i) => (
            <section key={l.slug} className="glass card" style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div className="thumbm" aria-hidden="true">
                <span style={{ width: 24, borderRadius: 4, background: '#EAF1F4' }} />
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ height: 26, borderRadius: 4, background: TINT[i % TINT.length] }} />
                  <span style={{ height: 5, borderRadius: 3, background: '#E1EAEF' }} />
                  <span style={{ height: 5, width: '60%', borderRadius: 3, background: '#E1EAEF' }} />
                  <span style={{ height: 5, borderRadius: 3, background: '#E1EAEF' }} />
                </span>
              </div>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <div className="row">
                  <div>
                    <h2>{plainWords(l.name)}</h2>
                    <div className="tag">
                      by {l.seller} · {l.category} · {l.platform} · {usd(l.priceCents)} · submitted {ago(l.createdAt, now)}
                      {l.hasTrial ? ' · has a trial copy' : ''}
                    </div>
                  </div>
                  <span className="status st-info">In review</span>
                </div>
                <p className="muted" style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.6 }}>
                  {l.description}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(200px, 100%),1fr))', gap: 8, marginTop: 14 }}>
                  {checks(l).map(([ok, text]) => (
                    <div key={text} className="ck">
                      <i style={{ background: ok ? '#3F8F77' : '#C2553F' }} aria-hidden="true">
                        {ok ? '✓' : '!'}
                      </i>
                      {text}
                    </div>
                  ))}
                </div>
                {l.includes.length > 0 && <div className="tag">Includes: {l.includes.join(' · ')}</div>}
                {l.thirdParty.length > 0 && <div className="tag">Third-party code: {l.thirdParty.map((t) => `${t.name} (${t.licence})`).join(', ')}</div>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16, alignItems: 'flex-start' }}>
                  {l.demoUrl && (
                    <a className="btn sm ghost" href={l.demoUrl} target="_blank" rel="noopener noreferrer nofollow">
                      Open live demo
                    </a>
                  )}
                  {l.codeUrl && (
                    <a className="btn sm ghost" href={l.codeUrl} target="_blank" rel="noopener noreferrer nofollow">
                      Files (private link)
                    </a>
                  )}
                  {l.sampleUrl && (
                    <a className="btn sm ghost" href={l.sampleUrl} target="_blank" rel="noopener noreferrer nofollow">
                      Free sample
                    </a>
                  )}
                  <AdminForm
                    endpoint={`/api/admin/listings/${l.slug}/decide`}
                    fixed={{ decision: 'approve' }}
                    fields={[
                      { name: 'note', label: 'Note for the seller (optional)', kind: 'textarea' },
                      ...(l.digital ? [{ name: 'filesChecked', label: 'I opened the files in a sandbox and they are clean (needed for a digital product)', kind: 'checkbox' as const }] : []),
                    ]}
                    submit="Approve and publish"
                    openLabel="Approve"
                    tone="blue"
                  />
                  <AdminForm
                    endpoint={`/api/admin/listings/${l.slug}/decide`}
                    fixed={{ decision: 'changes' }}
                    fields={[{ name: 'note', label: 'What should the seller change? (at least 5 characters)', kind: 'textarea', required: true }]}
                    submit="Send back"
                    openLabel="Request changes"
                    tone="line"
                  />
                  <AdminForm
                    endpoint={`/api/admin/listings/${l.slug}/decide`}
                    fixed={{ decision: 'reject' }}
                    fields={[{ name: 'note', label: 'Why is it declined? The seller reads this (at least 5 characters)', kind: 'textarea', required: true }]}
                    submit="Decline"
                    openLabel="Reject"
                    tone="line"
                  />
                  <span style={{ flex: 1 }} />
                  <Link className="btn sm ghost" href={`/admin/seo/product?slug=${encodeURIComponent(l.slug)}`} prefetch={false}>
                    Edit the whole listing
                  </Link>
                  <Link className="chk" style={{ minHeight: 0 }} href="/admin/seo/categories" prefetch={false}>
                    Feature on home
                  </Link>
                </div>
              </div>
            </section>
          ))
        ) : (
          <section className="glass card">
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              Nothing is waiting for review.
            </p>
          </section>
        ))}

      {tab !== 'waiting' && (
        <section className="glass card">
          <h2>{tab === 'changes' ? 'Sent back or declined' : 'Recently approved'}</h2>
          {(tab === 'changes' ? changes : recentlyApproved).length ? (
            (tab === 'changes' ? changes : recentlyApproved).slice(0, 50).map((l) => (
              <div key={l.slug} className="li">
                <span className={`status ${STATUS[l.status]?.[1] ?? 'st-draft'}`}>{STATUS[l.status]?.[0] ?? l.status}</span>
                <div style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
                  {plainWords(l.name)} <span className="muted">· {l.seller}</span>
                </div>
                <Link className="btn sm ghost" href={`/admin/seo/product?slug=${encodeURIComponent(l.slug)}`} prefetch={false}>
                  Edit
                </Link>
              </div>
            ))
          ) : (
            <p className="muted" style={{ margin: '8px 0 0', fontSize: 14 }}>
              None.
            </p>
          )}
        </section>
      )}

      <section className="glass" style={{ padding: '8px 8px 4px' }}>
        <div className="row" style={{ padding: '14px 14px 8px' }}>
          <h2>All listings</h2>
          <div className="seg" role="tablist" aria-label="Listing status">
            {FILTERS.map((f) => (
              <Link
                key={f || 'all'}
                role="tab"
                className={f === status ? 'on' : ''}
                aria-selected={f === status}
                href={f ? `/admin/listings?tab=${tab}&status=${f}` : `/admin/listings?tab=${tab}`}
                prefetch={false}
              >
                {f ? (STATUS[f]?.[0] ?? f) : 'All'}
              </Link>
            ))}
          </div>
        </div>
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>Website</th>
                <th>Seller</th>
                <th>Price</th>
                <th>Added</th>
                <th>Sale</th>
                <th>Price history</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((l) => {
                  const h = historyOfSlug(l.slug);
                  const [label, tone] = STATUS[l.status] ?? [l.status, 'st-draft'];
                  return (
                    <tr key={l.slug}>
                      <td style={{ fontWeight: 500 }}>
                        <Link href={`/admin/seo/product?slug=${encodeURIComponent(l.slug)}`} prefetch={false}>
                          {plainWords(l.name)}
                        </Link>
                      </td>
                      <td>{l.seller}</td>
                      <td>{usd(l.priceCents)}</td>
                      <td>{shortDate(l.createdAt)}</td>
                      <td>
                        <SaleCell slug={l.slug} sale={sales.get(l.slug) ?? null} endpoint="/api/admin/listings/sale" />
                      </td>
                      <td>
                        {h.length ? (
                          <details>
                            <summary>{h.length} prices</summary>
                            {[...h].reverse().map((x) => (
                              <div key={x.from} className="tag">
                                {usd(x.priceCents)} from {shortDate(x.from)}
                                {x.to ? ` to ${shortDate(x.to)}` : ' (now)'}
                              </div>
                            ))}
                          </details>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>
                        <span className={`status ${tone}`}>{label}</span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="muted">
                    No listings.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="glass card">
        <div className="row">
          <h2>More listing tools</h2>
        </div>
        {(
          [
            ['/admin/listings/all', 'Every listing with its edit link'],
            ['/admin/listings/files', 'Source files waiting for a check'],
            ['/admin/listings/versions', 'New versions of live listings'],
            ['/admin/listings/repo', 'Repository access deliveries'],
            ['/admin/seo/categories', 'Featured listings per category'],
          ] as const
        ).map(([href, text]) => (
          <div key={href} className="li" style={{ fontSize: 14 }}>
            <span style={{ flex: 1 }}>{text}</span>
            <Link className="btn sm ghost" href={href} prefetch={false}>
              Open
            </Link>
          </div>
        ))}
      </section>
    </AdminShell>
  );
}

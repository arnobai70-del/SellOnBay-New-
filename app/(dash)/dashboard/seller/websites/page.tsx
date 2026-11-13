import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminForm } from '@/components/AdminForm';
import { SourceUpload } from '@/components/SourceUpload';
import { SaleCell } from '@/components/glass/SaleCell';
import { BetaSwitch } from '@/components/glass/SellerForms';
import { SellerShell } from '@/components/glass/SellerShell';
import { UploadSection } from '@/components/glass/UploadSection';
import { sellerDashboard } from '@/lib/dashboard';
import { listFiles } from '@/lib/files/store';
import { usd } from '@/lib/glass/orderStatus';
import { draftsFor } from '@/lib/drafts';
import { sellerListingFlags, sellerSales, storeProfile } from '@/lib/glass/seller';
import { plainWords } from '@/lib/glass/words';
import { orderStore } from '@/lib/orders/store';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
import type { Tx } from '@/lib/i18n/tx';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('My websites'), robots: { index: false } });
export const dynamic = 'force-dynamic';

const STATUS = (tx: Tx): Record<string, [string, string]> => ({
  live: ['Live', 'st-ok'],
  in_review: [tx('In review'), 'st-info'],
  rejected: [tx('Changes requested'), 'st-wait'],
  paused: ['Paused', 'st-draft'],
});
const FILE_STATE = (tx: Tx): Record<string, string> => ({
  awaiting_upload: tx('Not uploaded yet'),
  checking: tx('Being checked'),
  failed_checks: tx('Not accepted'),
  awaiting_review: tx('Waiting for a reviewer'),
  approved: 'Approved',
  rejected: 'Rejected',
  purged: 'Removed',
});

/*
 * design-reference/seller-websites.html: the seller's listings with their sales, rating, status and the reviewer's note, then "Upload a new
 * website". Kept from before: the sale price (/api/seller/listings/sale), free during the beta, new versions, drafts and the private source files.
 * The top bar's search filters the listings (?q=).
 */
export default async function SellerWebsites({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/dashboard/seller/websites', roles: ['seller', 'admin'] });
  const q = ((await searchParams).q ?? '').trim().toLowerCase().slice(0, 80);
  const [v, flags, files, store, sales, drafts, orders] = viewer
    ? await Promise.all([
        sellerDashboard(viewer.id),
        sellerListingFlags(viewer.id),
        listFiles({ uploadedBy: viewer.id }),
        storeProfile(viewer.id, viewer.name),
        sellerSales(viewer.id),
        draftsFor(viewer.id),
        (async () => (await (await orderStore()).forUser(viewer.id)).filter((o) => o.sellerId === viewer.id))(),
      ])
    : [null, new Map<string, { betaFree: boolean }>(), [], null, new Map(), [], []];
  const myFiles = files.filter((f) => f.purpose !== 'delivery' && f.purpose !== 'revision').slice(0, 12);
  const soldOf = (slug: string) => orders.filter((o) => o.productKey === slug && (o.fundedAt || o.state === 'beta_approved')).length;
  const listings = (v?.listings ?? []).filter((l) => !q || l.name.toLowerCase().includes(q) || l.slug.includes(q));
  return (
    <SellerShell viewer={viewer} active="websites" file="seller-websites" title={tx('My websites')} head={false} handle={store?.username ? store.handle : undefined}>
      <div className="row">
        <div>
          <h1>
            <T s={'My websites'} />
          </h1>
          <div className="tag">
            <T s={'Your listings, reviewer feedback and new uploads. A change to a link or a file sends a listing back for review.'} />
          </div>
        </div>
      </div>
      {v && (
        <section className="glass" style={{ padding: '8px 8px 4px' }}>
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>
                    <T s={'Website'} />
                  </th>
                  <th>
                    <T s={'Price'} />
                  </th>
                  <th>
                    <T s={'Sales'} />
                  </th>
                  <th>
                    <T s={'Rating'} />
                  </th>
                  <th>
                    <T s={'Status'} />
                  </th>
                  <th>
                    <T s={'Reviewer note'} />
                  </th>
                  <th>
                    <T s={'Sale'} />
                  </th>
                  <th>
                    <T s={'Free in beta'} />
                  </th>
                  <th>
                    <span className="hidden-label">
                      <T s={'Actions'} />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {listings.map((l) => {
                  const [label, tone] = STATUS(tx)[l.status] ?? [l.status, 'st-draft'];
                  return (
                    <tr key={l.slug}>
                      <td style={{ fontWeight: 500 }}>
                        {plainWords(l.name)}
                        <div className="tag">
                          <T s={'Delivery {delivery}'} v={{ delivery: l.delivery }} />
                        </div>
                        {l.digital && l.versions.length > 0 && (
                          <div className="tag">
                            <T s={'Versions:'} /> {l.versions.map((x) => `${x.version} (${x.status.replace('_', ' ')})`).join(', ')}
                          </div>
                        )}
                      </td>
                      <td>{usd(l.priceCents)}</td>
                      <td>{soldOf(l.slug)}</td>
                      <td>{l.ratingCount ? l.ratingAvg : '—'}</td>
                      <td>
                        <span className={`status ${tone}`}>{label}</span>
                      </td>
                      <td className={l.reviewNote ? undefined : 'muted'} style={l.reviewNote ? { color: '#6E4B12' } : undefined}>
                        {l.reviewNote ?? '—'}
                      </td>
                      <td>
                        <SaleCell slug={l.slug} sale={sales.get(l.slug) ?? null} endpoint="/api/seller/listings/sale" />
                      </td>
                      <td>
                        <BetaSwitch slug={l.slug} name={plainWords(l.name)} on={!!flags.get(l.slug)?.betaFree} />
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', textAlign: 'left' }}>
                          <Link
                            className={l.status === 'rejected' ? 'btn sm' : 'btn sm ghost'}
                            href={`/dashboard/seller/websites/new?edit=${encodeURIComponent(l.slug)}`}
                            prefetch={false}
                            aria-label={tx('Edit {plainWords}', { plainWords: plainWords(l.name) })}
                          >
                            {l.status === 'rejected' ? tx('Fix & resubmit') : tx('Edit')}
                          </Link>
                          {l.status === 'live' && (
                            <Link className="btn sm ghost" href={`/websites/${encodeURIComponent(l.slug)}`} prefetch={false}>
                              <T s={'View'} />
                            </Link>
                          )}
                          {l.digital && l.status === 'live' && (
                            <AdminForm
                              endpoint={`/api/listings/${l.slug}/versions`}
                              openLabel={tx('New version')}
                              submit={tx('Send for review')}
                              tone="line"
                              fields={[
                                { name: 'version', label: tx('Version number, for example 1.1'), kind: 'text', required: true },
                                { name: 'changelog', label: tx('What changed (buyers see this)'), kind: 'textarea', required: true },
                                { name: 'fileUrl', label: tx('Private link to the new files (https)'), kind: 'text', required: true },
                              ]}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {drafts.map((d) => (
                  <tr key={d.slug}>
                    <td style={{ fontWeight: 500 }}>{d.name}</td>
                    <td>—</td>
                    <td>0</td>
                    <td>—</td>
                    <td>
                      <span className="status st-draft">
                        <T s={'Draft'} />
                      </span>
                    </td>
                    <td className="muted">
                      <T s={'Not submitted'} />
                    </td>
                    <td />
                    <td />
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Link className="btn sm ghost" href={`/dashboard/seller/websites/new?draft=${encodeURIComponent(d.slug)}`} prefetch={false}>
                        <T s={'Continue'} />
                      </Link>
                    </td>
                  </tr>
                ))}
                {!listings.length && !drafts.length && (
                  <tr>
                    <td colSpan={9} className="muted">
                      {q ? tx('No listing matches that search.') : tx('No listings yet. Upload your first website below to start selling.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <UploadSection viewer={viewer} />
      {v && (
        <section className="glass card" id="files">
          <h2>
            <T s={'Source files'} />
          </h2>
          <div className="tag">
            <T
              s={
                'Buyers get exactly the file SellOnBay approved, from private storage, only after the order is funded or approved. A change is a new upload and a new version; an approved file never changes.'
              }
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <SourceUpload listings={v.listings.filter((l) => l.status !== 'rejected').map((l) => ({ slug: l.slug, name: plainWords(l.name) }))} />
          </div>
          {myFiles.map((f) => (
            <div key={f.id} className="li" style={{ alignItems: 'flex-start', fontSize: 14 }}>
              <span style={{ flex: 1 }}>
                {f.originalName}
                {((f.checks as { problems?: string[] }).problems ?? []).slice(0, 2).map((p, i) => (
                  <span key={i} className="tag" style={{ display: 'block' }}>
                    {p}
                  </span>
                ))}
              </span>
              <span className="tag" style={{ margin: 0 }}>
                {FILE_STATE(tx)[f.state] ?? f.state}
                {f.reviewNote ? ` · ${f.reviewNote}` : ''}
              </span>
            </div>
          ))}
        </section>
      )}
    </SellerShell>
  );
}

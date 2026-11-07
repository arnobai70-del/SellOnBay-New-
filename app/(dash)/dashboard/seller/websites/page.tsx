import type { Metadata } from 'next';
import { AdminForm } from '@/components/AdminForm';
import { SourceUpload } from '@/components/SourceUpload';
import { Button } from '@/components/glass/Button';
import { DataTable } from '@/components/glass/DataTable';
import { GlassCard } from '@/components/glass/GlassCard';
import { BetaSwitch } from '@/components/glass/SellerForms';
import { SellerShell } from '@/components/glass/SellerShell';
import { StatusPill, type PillTone } from '@/components/glass/StatusPill';
import { sellerDashboard, type SellerListing } from '@/lib/dashboard';
import { listFiles } from '@/lib/files/store';
import { usd } from '@/lib/glass/orderStatus';
import { sellerListingFlags, storeProfile } from '@/lib/glass/seller';
import { plainWords } from '@/lib/glass/words';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'My websites', robots: { index: false } };
export const dynamic = 'force-dynamic';

const STATUS: Record<string, [string, PillTone]> = { live: ['Live', 'ok'], in_review: ['In review', 'wait'], rejected: ['Sent back', 'bad'], paused: ['Paused', 'draft'] };
const FILE_STATE: Record<string, string> = {
  awaiting_upload: 'Not uploaded yet',
  checking: 'Being checked',
  failed_checks: 'Not accepted',
  awaiting_review: 'Waiting for a reviewer',
  approved: 'Approved',
  rejected: 'Rejected',
  purged: 'Removed',
};

/* The seller's listings: status, price, the beta offer, edits, new versions, and the private source files buyers receive. */
export default async function SellerWebsites() {
  const viewer = await requireViewer({ path: '/dashboard/seller/websites', roles: ['seller', 'admin'] });
  const [v, flags, files, store] = viewer
    ? await Promise.all([sellerDashboard(viewer.id), sellerListingFlags(viewer.id), listFiles({ uploadedBy: viewer.id }), storeProfile(viewer.id, viewer.name)])
    : [null, new Map<string, { betaFree: boolean }>(), [], null];
  const myFiles = files.filter((f) => f.purpose !== 'delivery' && f.purpose !== 'revision').slice(0, 12);
  return (
    <SellerShell
      viewer={viewer}
      active="websites"
      title="My websites"
      subtitle="Every listing is checked by a person before it goes live. A change to a link or a file sends it back for review."
      handle={store?.username ? store.handle : undefined}
      actions={<Button href="/dashboard/seller/websites/new">Upload website</Button>}
    >
      {v && (
        <>
          <GlassCard as="section" pad={false} style={{ padding: '14px 8px 4px' }}>
            <DataTable<SellerListing>
              caption="Your listings"
              rows={v.listings}
              rowKey={(l) => l.slug}
              empty="No listings yet. Upload your first website to start selling."
              columns={[
                {
                  key: 'name',
                  label: 'Website',
                  cell: (l) => (
                    <>
                      <b>{plainWords(l.name)}</b>
                      {l.reviewNote && <div className="g-tag">Reviewer note: {l.reviewNote}</div>}
                      {l.digital && l.versions.length > 0 && <div className="g-tag">Versions: {l.versions.map((x) => `${x.version} (${x.status.replace('_', ' ')})`).join(', ')}</div>}
                    </>
                  ),
                },
                { key: 'price', label: 'Price', cell: (l) => usd(l.priceCents) },
                { key: 'delivery', label: 'Delivery', cell: (l) => l.delivery },
                { key: 'rating', label: 'Rating', cell: (l) => (l.ratingCount ? `${l.ratingAvg} (${l.ratingCount})` : 'None yet') },
                {
                  key: 'status',
                  label: 'Status',
                  cell: (l) => {
                    const [label, tone] = STATUS[l.status] ?? [l.status, 'draft'];
                    return <StatusPill tone={tone}>{label}</StatusPill>;
                  },
                },
                { key: 'beta', label: 'Free during beta', cell: (l) => <BetaSwitch slug={l.slug} name={plainWords(l.name)} on={!!flags.get(l.slug)?.betaFree} /> },
                {
                  key: 'actions',
                  label: 'Actions',
                  hideLabel: true,
                  cell: (l) => (
                    <div className="g-row" style={{ justifyContent: 'flex-start', gap: 8 }}>
                      <Button variant="ghost" size="sm" href={`/dashboard/seller/websites/new?edit=${encodeURIComponent(l.slug)}`} aria-label={`Edit ${plainWords(l.name)}`}>
                        Edit
                      </Button>
                      {l.status === 'live' && (
                        <Button variant="ghost" size="sm" href={`/websites/${encodeURIComponent(l.slug)}`}>
                          View
                        </Button>
                      )}
                      {l.digital && l.status === 'live' && (
                        <AdminForm
                          endpoint={`/api/listings/${l.slug}/versions`}
                          openLabel="New version"
                          submit="Send for review"
                          tone="line"
                          fields={[
                            { name: 'version', label: 'Version number, for example 1.1', kind: 'text', required: true },
                            { name: 'changelog', label: 'What changed (buyers see this)', kind: 'textarea', required: true },
                            { name: 'fileUrl', label: 'Private link to the new files (https)', kind: 'text', required: true },
                          ]}
                        />
                      )}
                    </div>
                  ),
                },
              ]}
            />
          </GlassCard>
          <GlassCard as="section" id="files">
            <h2>Source files</h2>
            <p className="g-tag">
              Buyers get exactly the file SellOnBay approved, from private storage, only after the order is funded or approved. A change is a new upload and a new version; an approved file never
              changes.
            </p>
            <div style={{ marginTop: 12 }}>
              <SourceUpload listings={v.listings.filter((l) => l.status !== 'rejected').map((l) => ({ slug: l.slug, name: plainWords(l.name) }))} />
            </div>
            {myFiles.map((f) => (
              <div key={f.id} className="g-li" style={{ alignItems: 'flex-start' }}>
                <span style={{ flex: 1 }}>
                  {f.originalName}
                  {((f.checks as { problems?: string[] }).problems ?? []).slice(0, 2).map((p, i) => (
                    <span key={i} className="g-tag" style={{ display: 'block' }}>
                      {p}
                    </span>
                  ))}
                </span>
                <span className="g-tag">
                  {FILE_STATE[f.state] ?? f.state}
                  {f.reviewNote ? ` · ${f.reviewNote}` : ''}
                </span>
              </div>
            ))}
          </GlassCard>
        </>
      )}
    </SellerShell>
  );
}

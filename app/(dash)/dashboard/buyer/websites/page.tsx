import type { Metadata } from 'next';
import Link from 'next/link';
import { BuyerShell } from '@/components/glass/BuyerShell';
import { StarRating } from '@/components/glass/StarRating';
import { buyerOrders, buyerWebsites } from '@/lib/glass/buyer';
import { buyerStatus } from '@/lib/glass/orderStatus';
import { listRequests } from '@/lib/requests/store';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'My websites', robots: { index: false } };
export const dynamic = 'force-dynamic';

const TONE = { ok: 'st-ok', wait: 'st-wait', bad: 'st-bad', info: 'st-info', draft: 'st-draft' } as const;
const TINT = ['#DDEAF6', '#D3EEE4', '#E1E2F6', '#F1E8DD'];
const RATEABLE = ['accepted', 'payout_pending', 'paid_out'];

/*
 * design-reference/buyer-websites.html: each website the buyer may download (files come from its order page, through the signed 24-hour link),
 * its setup guide, the domain and help, the rating after approval, and customization offers (quotations) waiting for an answer.
 * The top bar's search filters the list (?q=).
 */
export default async function BuyerWebsites({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const viewer = await requireViewer({ path: '/dashboard/buyer/websites', roles: ['buyer', 'seller'] });
  const q = ((await searchParams).q ?? '').trim().toLowerCase().slice(0, 80);
  const [orders, requests] = viewer ? await Promise.all([buyerOrders(viewer.id), listRequests({ buyerId: viewer.id }).catch(() => [])]) : [[], []];
  const sites = (await buyerWebsites(orders)).filter((s) => !q || s.title.toLowerCase().includes(q));
  const offers = requests.filter((r) => r.status === 'quoted');
  return (
    <BuyerShell viewer={viewer} active="websites" file="buyer-websites" title="My websites" head={false}>
      <div className="row">
        <div>
          <h1>My websites</h1>
          <div className="tag">Download files, follow the setup guide, rate and ask for changes</div>
        </div>
        <Link className="btn ghost" href="/websites" prefetch={false}>
          Browse more websites
        </Link>
      </div>
      {sites.length ? (
        sites.map((s, i) => {
          const st = buyerStatus(s.order.state);
          return (
            <section key={s.order.id} className="glass card" style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div className="mthumb" aria-hidden="true">
                <span style={{ width: 18, borderRadius: 3, background: '#EAF1F4' }} />
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <span style={{ height: 22, borderRadius: 3, background: TINT[i % TINT.length] }} />
                  <span style={{ height: 4, borderRadius: 2, background: '#E1EAEF' }} />
                  <span style={{ height: 4, width: '60%', borderRadius: 2, background: '#E1EAEF' }} />
                </span>
              </div>
              <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                <div className="row">
                  <div>
                    <h2>{s.title}</h2>
                    <div className="tag">
                      by {s.seller}
                      {s.stack ? ` · ${s.stack}` : ''} · {s.order.licence ?? 'Standard'}
                    </div>
                  </div>
                  <span className={`status ${TONE[st.tone]}`}>{st.label}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                  <Link className="btn sm" href={`/orders/${s.order.id}`} prefetch={false}>
                    Download files
                  </Link>{' '}
                  {s.docsUrl && (
                    <a className="btn sm ghost" href={s.docsUrl} target="_blank" rel="noopener noreferrer nofollow">
                      Setup guide
                    </a>
                  )}{' '}
                  <Link className="btn sm ghost" href="/dashboard/buyer/domains" prefetch={false}>
                    Connect domain
                  </Link>{' '}
                  <Link className="btn sm ghost" href="/dashboard/buyer/support" prefetch={false}>
                    Get help
                  </Link>
                </div>
                <StarRating orderId={s.order.id} canRate={RATEABLE.includes(s.order.state)} />
              </div>
            </section>
          );
        })
      ) : (
        <section className="glass card" style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 280px' }}>
            <h2>{q ? 'No website matches that search' : 'No websites yet'}</h2>
            <div className="tag">Websites you get show up here, ready to download.</div>
          </div>
          <Link className="btn" href="/websites" prefetch={false}>
            Browse websites
          </Link>
        </section>
      )}
      {offers.map((r) => (
        <section key={r.id} className="glass card" style={{ display: 'flex', flexDirection: 'column', gap: 12, borderColor: '#CFE9DF' }}>
          <div className="row">
            <div>
              <h2>{r.kind === 'custom_dev' ? 'Customization offer' : 'Your quotation'}</h2>
              <div className="tag">Pay into escrow; the money is released only when you approve the work</div>
            </div>
            <span className="status st-ok">New offer</span>
          </div>
          <div className="row">
            <span style={{ fontSize: 15 }}>{r.intendedUse.slice(0, 120)}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link className="btn ghost" href="/dashboard/buyer/support" prefetch={false}>
                Ask a question
              </Link>
              <Link className="btn" href={`/dashboard/buyer/requests/${r.id}`} prefetch={false}>
                See the offer
              </Link>
            </div>
          </div>
        </section>
      ))}
    </BuyerShell>
  );
}

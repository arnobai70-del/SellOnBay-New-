import type { Metadata } from 'next';
import Link from 'next/link';
import { StoreForm } from '@/components/glass/SellerForms';
import { SellerShell } from '@/components/glass/SellerShell';
import { sellerDashboard } from '@/lib/dashboard';
import { sellerStats, storeProfile } from '@/lib/glass/seller';
import { plainWords } from '@/lib/glass/words';
import { orderStore } from '@/lib/orders/store';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const metadata: Metadata = { title: 'Store and analytics', robots: { index: false } };
export const dynamic = 'force-dynamic';

const initials = (n: string) =>
  n
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || 'S';

/*
 * design-reference/seller-store.html: the last 30 days of views and Buy clicks on the seller's listings (visitor analytics, no cookies), sales,
 * and the public store profile (StoreForm: name, headline, about, skills, reply time, customization badge, pause).
 */
export default async function SellerStore() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/dashboard/seller/store', roles: ['seller', 'admin'] });
  const [v, store, orders] = viewer
    ? await Promise.all([sellerDashboard(viewer.id), storeProfile(viewer.id, viewer.name), (async () => (await (await orderStore()).forUser(viewer.id)).filter((o) => o.sellerId === viewer.id))()])
    : [null, null, []];
  const stats = v ? await sellerStats(v.listings.map((l) => l.slug)) : new Map();
  const soldOf = (slug: string) => orders.filter((o) => o.productKey === slug && (o.fundedAt || o.state === 'beta_approved')).length;
  const rows = (v?.listings ?? [])
    .map((l) => ({ slug: l.slug, name: plainWords(l.name), rating: l.ratingCount ? l.ratingAvg : null, sales: soldOf(l.slug), ...(stats.get(l.slug) ?? { views: 0, people: 0, buys: 0 }) }))
    .sort((a, b) => b.views - a.views);
  const total = rows.reduce((s, r) => ({ views: s.views + r.views, people: s.people + r.people, buys: s.buys + r.buys, sales: s.sales + r.sales }), { views: 0, people: 0, buys: 0, sales: 0 });
  const pct = (n: number) => `${Math.max(2, Math.round((n / Math.max(1, total.views)) * 100))}%`;
  return (
    <SellerShell viewer={viewer} active="store" file="seller-store" title={tx('Store & analytics')} head={false} handle={store?.username ? store.handle : undefined}>
      <div className="row">
        <div>
          <h1>
            <T s={'Store & analytics'} />
          </h1>
          <div className="tag">
            <T s={'How buyers find you, and how your public store looks'} />
          </div>
        </div>
        {store?.username && (
          <Link className="btn ghost" href={`/sellers/${store.handle}`} prefetch={false}>
            <T s={'View public store'} />
          </Link>
        )}
      </div>
      {v && store && (
        <>
          <div className="kpis">
            <div className="glass kpi">
              <div className="l">
                <T s={'Store views'} />
              </div>
              <div className="v">{total.views.toLocaleString('en-US')}</div>
              <div className="s">
                <T s={'Last 30 days · {people} people'} v={{ people: total.people }} />
              </div>
            </div>
            <div className="glass kpi">
              <div className="l">
                <T s={'Buy clicks'} />
              </div>
              <div className="v">{total.buys}</div>
              <div className="s">{total.people ? `${Math.round((total.buys / total.people) * 100)}% of visitors` : 'No visitors yet'}</div>
            </div>
            <div className="glass kpi">
              <div className="l">
                <T s={'Sales'} />
              </div>
              <div className="v">{total.sales}</div>
              <div className="s">
                {v.listings.filter((l) => l.status === 'live').length} <T s={'live websites'} />
              </div>
            </div>
            <div className="glass kpi">
              <div className="l">
                <T s={'Avg. rating'} />
              </div>
              <div className="v">{v.health.rating ?? '—'}</div>
              <div className="s">{v.health.ratingCount ? `From ${v.health.ratingCount} buyers` : 'No reviews yet'}</div>
            </div>
          </div>
          <div className="grid2">
            <section className="glass card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h2>
                <T s={'From view to sale'} />
              </h2>
              {(
                [
                  ['Views', total.views, '#A9D4C5'],
                  ['Visitors', total.people, '#A9D4C5'],
                  ['Buy clicks', total.buys, '#A9D4C5'],
                  ['Sales', total.sales, '#5FA88F'],
                ] as const
              ).map(([l, n, bg]) => (
                <div key={l} className="fn">
                  <span style={{ width: 110 }}>{l}</span>
                  <span className="b" style={{ width: total.views ? pct(n) : '2%', background: bg }} />
                  <span>{n.toLocaleString('en-US')}</span>
                </div>
              ))}
              <div className="tag" style={{ margin: 0 }}>
                <T s={'Tip: listings with a live demo and 6 or more screenshots get more Buy clicks.'} />
              </div>
            </section>
            <section className="glass" style={{ padding: '8px 8px 4px' }}>
              <div className="row" style={{ padding: '14px 14px 4px' }}>
                <h2>
                  <T s={'Per website'} />
                </h2>
                <span className="tag" style={{ margin: 0 }}>
                  <T s={'Last 30 days'} />
                </span>
              </div>
              <div className="tbl">
                <table>
                  <thead>
                    <tr>
                      <th>
                        <T s={'Website'} />
                      </th>
                      <th>
                        <T s={'Views'} />
                      </th>
                      <th>
                        <T s={'Buy clicks'} />
                      </th>
                      <th>
                        <T s={'Sales'} />
                      </th>
                      <th>
                        <T s={'Rating'} />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length ? (
                      rows.map((r) => (
                        <tr key={r.slug}>
                          <td style={{ fontWeight: 500 }}>{r.name}</td>
                          <td>{r.views.toLocaleString('en-US')}</td>
                          <td>{r.buys}</td>
                          <td>{r.sales}</td>
                          <td>{r.rating ?? '—'}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="muted">
                          <T s={'No listings yet.'} />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
          <section className="glass card" id="profile" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="row">
              <h2>
                <T s={'Public store profile'} />
              </h2>
              <span className="tag" style={{ margin: 0 }}>
                <T s={'Keep emails, phone numbers and outside links out: buyers talk to you inside an order'} />
              </span>
            </div>
            <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="av" style={{ width: 72, height: 72, fontSize: 22, background: '#E6E2F4' }} aria-hidden="true">
                {initials(viewer?.name ?? 'Seller')}
              </span>
              <span className="tag" style={{ margin: 0 }}>
                {store.username ? `sellonbay.com/sellers/${store.handle}` : 'Choose a store name below to get your public page'}
              </span>
            </div>
            <StoreForm
              initial={{
                username: store.username,
                headline: store.headline,
                bio: store.bio,
                skills: store.skills,
                customAvailable: store.customAvailable,
                replyTime: store.replyTime,
                storePaused: store.storePaused,
              }}
            />
          </section>
        </>
      )}
    </SellerShell>
  );
}

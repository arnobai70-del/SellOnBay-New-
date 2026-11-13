import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminShell } from '@/components/glass/AdminShell';
import { allListings, listUsers } from '@/lib/admin/queue';
import { hasScope } from '@/lib/admin/scopes';
import { DAY_MS } from '@/lib/config';
import { buyerStatus, usd } from '@/lib/glass/orderStatus';
import { plainWords } from '@/lib/glass/words';
import { orderStore } from '@/lib/orders/store';
import { orderCode } from '@/lib/payments/rules';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Admin search'), robots: { index: false } });
export const dynamic = 'force-dynamic';

const TONE = { ok: 'st-ok', wait: 'st-wait', bad: 'st-bad', info: 'st-info', draft: 'st-draft' } as const;

/* Where the admin top bar's search goes: orders (by code, id or title), listings and accounts, each only for the permissions that may see them. Read only. */
export default async function AdminSearch({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/search', roles: ['admin'] });
  const q = ((await searchParams).q ?? '').trim().slice(0, 80);
  const lq = q.toLowerCase().replace(/^#/, '');
  const scopes = viewer?.scopes ?? ['super'];
  const [orders, listings, users] =
    q.length >= 2
      ? await Promise.all([
          hasScope(scopes, ['delivery', 'support', 'finance']) ? (await orderStore()).changedSince(Date.now() - 365 * DAY_MS) : Promise.resolve([]),
          hasScope(scopes, 'catalog') ? allListings('') : Promise.resolve([]),
          scopes.includes('super') ? listUsers(q) : Promise.resolve([]),
        ])
      : [[], [], []];
  const o = orders.filter((x) => x.id.toLowerCase().startsWith(lq) || orderCode(x.id).toLowerCase().replace(/^#/, '').includes(lq) || x.title.toLowerCase().includes(lq)).slice(0, 20);
  const l = listings.filter((x) => x.name.toLowerCase().includes(lq) || x.slug.includes(lq) || x.seller.toLowerCase().includes(lq)).slice(0, 20);
  return (
    <AdminShell viewer={viewer} active="overview" title={q ? `Search: ${q}` : tx('Search')} subtitle="Orders, listings and accounts">
      {q.length < 2 ? (
        <section className="glass card">
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            <T s={'Type at least two letters in the search box above.'} />
          </p>
        </section>
      ) : (
        <>
          <section className="glass card">
            <h2>
              <T s={'Orders ({length})'} v={{ length: o.length }} />
            </h2>
            {o.length ? (
              o.map((x) => (
                <div key={x.id} className="li" style={{ fontSize: 14 }}>
                  <span className={`status ${TONE[buyerStatus(x.state).tone]}`}>{buyerStatus(x.state).label}</span>
                  <span style={{ flex: 1 }}>
                    <Link href={`/admin/orders/${x.id}`} prefetch={false}>
                      {orderCode(x.id)}
                    </Link>{' '}
                    · {plainWords(x.title)}
                  </span>
                  <span>{usd(x.priceCents)}</span>
                </div>
              ))
            ) : (
              <p className="muted" style={{ margin: '8px 0 0', fontSize: 14 }}>
                <T s={'No order matches.'} />
              </p>
            )}
          </section>
          <section className="glass card">
            <h2>
              <T s={'Listings ({length})'} v={{ length: l.length }} />
            </h2>
            {l.length ? (
              l.map((x) => (
                <div key={x.slug} className="li" style={{ fontSize: 14 }}>
                  <span style={{ flex: 1 }}>
                    <Link href={`/admin/seo/product?slug=${encodeURIComponent(x.slug)}`} prefetch={false}>
                      {plainWords(x.name)}
                    </Link>{' '}
                    <span className="muted">· {x.seller}</span>
                  </span>
                  <span className="tag" style={{ margin: 0 }}>
                    {x.status}
                  </span>
                </div>
              ))
            ) : (
              <p className="muted" style={{ margin: '8px 0 0', fontSize: 14 }}>
                <T s={'No listing matches.'} />
              </p>
            )}
          </section>
          <section className="glass card">
            <h2>
              <T s={'Accounts ({length})'} v={{ length: users.length }} />
            </h2>
            {users.length ? (
              users.slice(0, 20).map((x) => (
                <div key={x.id} className="li" style={{ fontSize: 14 }}>
                  <span style={{ flex: 1 }}>{x.name}</span>
                  <span className="tag" style={{ margin: 0 }}>
                    {x.role}
                  </span>
                  <Link className="btn sm ghost" href={`/admin/users?q=${encodeURIComponent(x.name)}`} prefetch={false}>
                    <T s={'Open'} />
                  </Link>
                </div>
              ))
            ) : (
              <p className="muted" style={{ margin: '8px 0 0', fontSize: 14 }}>
                {scopes.includes('super') ? tx('No account matches.') : tx('Accounts are for Super Admin.')}
              </p>
            )}
          </section>
        </>
      )}
    </AdminShell>
  );
}

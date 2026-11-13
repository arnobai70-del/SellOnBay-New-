import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminForm } from '@/components/AdminForm';
import { AdminShell } from '@/components/glass/AdminShell';
import { betaRequests } from '@/lib/beta/service';
import { CONFIG, DAY_MS } from '@/lib/config';
import { ALL_TLDS, registrarLive } from '@/lib/domains';
import { profileNames } from '@/lib/glass/admin';
import { plainWords } from '@/lib/glass/words';
import type { Order } from '@/lib/orders/machine';
import { getOrder } from '@/lib/orders/service';
import { orderCode } from '@/lib/payments/rules';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createAdminClient } from '@/lib/supabase/server';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const metadata: Metadata = { title: 'Domains', robots: { index: false } };
export const dynamic = 'force-dynamic';

const TABS = [
  ['all', 'All'],
  ['expiring', 'Expiring'],
  ['pending', 'Pending'],
  ['transfers', 'Transfers'],
] as const;
type Row = { name: string; orderId: string | null; expires: number | null; ref: string | null; pending: boolean; asked?: { name: string; country: string; decided: boolean } };
const month = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/*
 * design-reference/admin-domains.html. No registrar is connected (owner, 2026-11-07): a domain a buyer asked for is registered by hand at the
 * registrar, in the buyer's own name, and recorded here (/api/admin/domains) so it shows in the buyer's dashboard. Prices per extension come
 * from lib/domains.ts; reminders from lib/config.ts.
 */
export default async function AdminDomains({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/domains', roles: ['admin'], scope: 'support' });
  const sp = await searchParams;
  const tab = TABS.find(([k]) => k === sp.tab)?.[0] ?? 'all';
  const q = (sp.q ?? '').trim().toLowerCase();
  const now = Date.now();
  const [requests, held] = await Promise.all([
    betaRequests(),
    supabaseConfigured ? createAdminClient().from('domains').select('name, order_id, expires_at, registrar_ref').order('created_at', { ascending: false }).limit(200) : Promise.resolve({ data: [] }),
  ]);
  const recorded = (held.data ?? []) as { name: string; order_id: string | null; expires_at: string | null; registrar_ref: string | null }[];
  const names = new Set(recorded.map((d) => d.name));
  const asked = requests.filter((r) => r.domain && !r.declineReason && !names.has(r.domain.toLowerCase()));
  const all: Row[] = [
    ...asked.map((r) => ({ name: r.domain!, orderId: r.orderId, expires: null, ref: null, pending: true, asked: { name: r.name, country: r.country, decided: !!r.decidedAt } })),
    ...recorded.map((d) => ({ name: d.name, orderId: d.order_id, expires: d.expires_at ? Date.parse(d.expires_at) : null, ref: d.registrar_ref, pending: false })),
  ];
  const orders = new Map<string, Order | null>(await Promise.all([...new Set(all.map((r) => r.orderId).filter((x): x is string => !!x))].map(async (id) => [id, await getOrder(id)] as const)));
  const people = await profileNames([...orders.values()].map((o) => o?.buyerId));
  const owner = (r: Row) => r.asked?.name ?? people.get(orders.get(r.orderId ?? '')?.buyerId ?? '') ?? '—';
  const expiring = (r: Row) => !r.pending && r.expires !== null && r.expires - now < 30 * DAY_MS;
  const rows = all
    .filter((r) => (tab === 'expiring' ? expiring(r) : tab === 'pending' ? r.pending : tab === 'transfers' ? false : true))
    .filter((r) => !q || r.name.toLowerCase().includes(q) || owner(r).toLowerCase().includes(q));
  const active = recorded.length;
  const soon = all.filter(expiring);
  return (
    <AdminShell viewer={viewer} active="domains" file="admin-domains" title={tx('Domains')} head={false}>
      <div className="row">
        <div>
          <h1>
            <T s={'Domains'} />
          </h1>
          <div className="tag">
            <T s={"Registrations, renewals and prices · every domain is registered in the buyer's name"} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn ghost" type="button" disabled title={tx('No registrar is connected yet')}>
            <T s={'Sync with registrar'} />
          </button>
          <Link className="btn" href="/admin/domains?tab=pending" prefetch={false}>
            <T s={'+ Register for a buyer'} />
          </Link>
        </div>
      </div>
      <div className="kpis">
        <div className="glass kpi">
          <div className="l">
            <T s={'Active domains'} />
          </div>
          <div className="v">{active}</div>
          <div className="s">
            {recorded.filter((d) => d.order_id).length} <T s={'linked to a website'} />
          </div>
        </div>
        <div className="glass kpi">
          <div className="l">
            <T s={'Expiring in 30 days'} />
          </div>
          <div className="v">{soon.length}</div>
          <div className="s">
            {soon.filter((r) => r.expires! - now < 7 * DAY_MS).length} <T s={'this week'} />
          </div>
        </div>
        <div className="glass kpi">
          <div className="l">
            <T s={'Pending registration'} />
          </div>
          <div className="v">{asked.length}</div>
          <div className="s">
            <T s={'Register by hand, then record'} />
          </div>
        </div>
        <div className="glass kpi">
          <div className="l">
            <T s={'Domain income'} />
          </div>
          <div className="v">$0</div>
          <div className="s">{registrarLive() ? tx('This month') : tx('No registrar yet')}</div>
        </div>
      </div>
      <section className="glass" style={{ padding: '8px 8px 4px' }}>
        <div className="row" style={{ padding: '14px 14px 8px' }}>
          <div className="seg" role="tablist" aria-label={tx('Domain status')}>
            {TABS.map(([k, l]) => (
              <Link key={k} role="tab" className={k === tab ? 'on' : ''} aria-selected={k === tab} href={k === 'all' ? '/admin/domains' : `/admin/domains?tab=${k}`} prefetch={false}>
                {l}
              </Link>
            ))}
          </div>
          <form action="/admin/domains" method="get" role="search" style={{ maxWidth: 260, width: '100%' }}>
            {tab !== 'all' && <input type="hidden" name="tab" value={tab} />}
            <label htmlFor="df" className="hidden-label">
              <T s={'Search domains'} />
            </label>
            <input id="df" name="q" defaultValue={sp.q ?? ''} className="input" placeholder={tx('Search domain or owner')} style={{ maxWidth: 260, borderRadius: 999 }} />
          </form>
        </div>
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>
                  <T s={'Domain'} />
                </th>
                <th>
                  <T s={'Owner (registrant)'} />
                </th>
                <th>
                  <T s={'Linked website'} />
                </th>
                <th>
                  <T s={'Expires'} />
                </th>
                <th>
                  <T s={'Auto-renew'} />
                </th>
                <th>
                  <T s={'Status'} />
                </th>
                <th>
                  <span className="hidden-label">
                    <T s={'Actions'} />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((r) => {
                  const o = orders.get(r.orderId ?? '');
                  const days = r.expires !== null ? Math.ceil((r.expires - now) / DAY_MS) : null;
                  return (
                    <tr key={r.name}>
                      <td style={{ fontWeight: 500 }}>{r.name}</td>
                      <td>
                        {owner(r)}
                        {r.asked && <div className="tag">{r.asked.country}</div>}
                      </td>
                      <td>
                        {o ? (
                          <Link href={`/admin/orders/${o.id}`} prefetch={false}>
                            {plainWords(o.title)}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{r.pending ? '—' : days === null ? tx('Not recorded') : days <= 30 ? `in ${days} days` : month(r.expires!)}</td>
                      <td>
                        <span className="tag" style={{ margin: 0 }}>
                          <T s={'By hand'} />
                        </span>
                      </td>
                      <td>
                        {r.pending ? (
                          <span className="status st-info">{r.asked?.decided ? tx('Pending') : tx('Request waiting')}</span>
                        ) : expiring(r) ? (
                          <span className="status st-wait">
                            <T s={'Expiring'} />
                          </span>
                        ) : (
                          <span className="status st-ok">
                            <T s={'Active'} />
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {r.pending ? (
                          <AdminForm
                            endpoint="/api/admin/domains"
                            openLabel="Record as registered"
                            submit="Record the domain"
                            tone="line"
                            fixed={{ orderId: r.orderId, name: r.name }}
                            fields={[
                              { name: 'expiresAt', label: 'Expires on (YYYY-MM-DD)', kind: 'text', required: true },
                              { name: 'registrarRef', label: 'Registrar reference (optional)', kind: 'text' },
                            ]}
                          />
                        ) : (
                          <span className="tag" style={{ margin: 0 }}>
                            {r.ref ? `Ref ${r.ref}` : r.orderId ? orderCode(r.orderId) : ''}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="muted">
                    {tab === 'transfers' ? tx('No transfers: domains are registered by hand.') : tx('No domains here.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <div className="grid2">
        <section className="glass" style={{ padding: '8px 8px 4px' }}>
          <div className="row" style={{ padding: '14px 14px 4px' }}>
            <h2>
              <T s={'Prices per extension'} />
            </h2>
            <span className="tag" style={{ margin: 0 }}>
              <T s={'Set in the code (lib/domains.ts)'} />
            </span>
          </div>
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>
                    <T s={'Extension'} />
                  </th>
                  <th>
                    <T s={'Your cost'} />
                  </th>
                  <th>
                    <T s={'Sell price'} />
                  </th>
                  <th>
                    <T s={'Renewal'} />
                  </th>
                  <th>
                    <T s={'Margin'} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {ALL_TLDS.map(([tld, price]) => (
                  <tr key={tld}>
                    <td style={{ fontWeight: 500 }}>{tld}</td>
                    <td className="muted">—</td>
                    <td>${price.toFixed(2)}</td>
                    <td className="muted">—</td>
                    <td className="muted">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="glass card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2>
            <T s={'Renewal reminders'} />
          </h2>
          <div className="row">
            <span style={{ fontSize: 14 }}>
              <T s={'Email buyer {v0} days before expiry'} v={{ v0: CONFIG.domain.reminderDays.join(', ') }} />
            </span>
            <span className="status st-ok">
              <T s={'On'} />
            </span>
          </div>
          <div className="row">
            <span style={{ fontSize: 14 }}>
              <T s={'Privacy protection on by default'} />
            </span>
            <span className="status st-draft">
              <T s={'At the registrar'} />
            </span>
          </div>
          <div className="field">
            <label htmlFor="rg">
              <T s={'Registrar account'} />
            </label>
            <select id="rg" className="input" disabled>
              <option>
                <T s={'Not connected'} />
              </option>
            </select>
          </div>
          <div className="tag" style={{ margin: 0 }}>
            {registrarLive() ? tx('Registrar connected.') : tx('No registrar is connected yet: register at the registrar in the buyer’s name, then record it above.')}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}

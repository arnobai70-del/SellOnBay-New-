import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionButton } from '@/components/ActionButton';
import { AdminForm } from '@/components/AdminForm';
import { AdminShell } from '@/components/glass/AdminShell';
import { devQueue, listUsers, type UserRow } from '@/lib/admin/queue';
import { effectiveScopes, hasScope, SCOPE_LABEL, SCOPES, type AdminScope } from '@/lib/admin/scopes';
import { DAY_MS } from '@/lib/config';
import { COUNTRY_NAME } from '@/lib/countries';
import { accountRows } from '@/lib/glass/admin';
import { shortDate, usd } from '@/lib/glass/orderStatus';
import { orderStore } from '@/lib/orders/store';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createAdminClient } from '@/lib/supabase/server';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
import { tx, type Tx } from '@/lib/i18n/tx'; // tx marks the English of module-level words; translate() shows them in the page's language
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Users and roles'), robots: { index: false } });
export const dynamic = 'force-dynamic';

const DOC = (tx: Tx): Record<string, string> => ({ passport: 'Passport', national_id: tx('National ID card'), driver_licence: tx('Driver licence') });
type Check = { id: string; seller_id: string; doc_type: string; country: string; back_path: string | null; created_at: string };

/* The design's permission table: which pages each permission opens, and what can be done there (lib/admin/scopes.ts and each page's guard). */
const PAGES: [page: string, open: AdminScope[], acts: ('edit' | 'approve' | 'pay' | 'export')[]][] = [
  [tx('Overview'), [...SCOPES], []],
  [tx('Orders & payments'), ['delivery', 'support', 'finance'], ['edit', 'approve', 'pay']],
  [tx('Listing review'), ['catalog'], ['edit', 'approve']],
  [tx('Disputes & support'), ['support'], ['edit', 'approve', 'pay']],
  [tx('Domains'), ['support'], ['edit']],
  [tx('Finance & payouts'), ['finance'], ['pay', 'export']],
  [tx('Reports'), ['finance'], ['export']],
  [tx('Users & roles'), ['finance'], ['approve']],
  [tx('Guides & pages'), ['content'], ['edit', 'approve']],
  [tx('Settings'), [], ['edit']],
];
const COLS = (tx: Tx) =>
  [
    ['view', tx('View')],
    ['edit', tx('Create / edit')],
    ['approve', tx('Approve')],
    ['pay', tx('Refund / pay')],
    ['export', tx('Export')],
  ] as const;

/*
 * design-reference/admin-users.html: staff permissions, sellers' identity checks (Finance only, owner 2026-11-07; each document opens for 5 minutes
 * and the opening is logged), buyers with their purchase history, accounts (find, ban, unban; Super Admin) and developer profiles to review.
 * An admin's permissions are changed in the accounts tool (/api/admin/users/[id]/scopes).
 */
export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; b?: string; role?: string }> }) {
  const { tx, translate } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/users', roles: ['admin'], scope: ['super', 'finance'] });
  const sp = await searchParams;
  const q = (sp.q ?? '').slice(0, 60);
  const bq = (sp.b ?? '').trim().toLowerCase().slice(0, 60);
  const role: AdminScope = SCOPES.find((s) => s === sp.role) ?? 'finance';
  const scopes = viewer?.scopes ?? ['super'];
  const finance = hasScope(scopes, 'finance');
  const superAdmin = scopes.includes('super');
  const now = Date.now();
  const [users, checks, accounts, orders, devs] = await Promise.all([
    superAdmin ? listUsers(q) : Promise.resolve([] as UserRow[]),
    finance && supabaseConfigured
      ? createAdminClient().from('seller_verifications').select('id, seller_id, doc_type, country, back_path, created_at').eq('status', 'pending').order('created_at').limit(100)
      : Promise.resolve({ data: [] }),
    accountRows(),
    (async () => (await orderStore()).changedSince(now - 365 * DAY_MS))(),
    superAdmin ? devQueue() : Promise.resolve([]),
  ]);
  const pending = (checks.data ?? []) as Check[];
  const nameOf = new Map(accounts.map((a) => [a.id, a.name]));
  const staff = accounts.filter((a) => a.role === 'admin');
  const sellers = accounts.filter((a) => a.role === 'seller');
  const buyers = accounts.filter((a) => a.role === 'buyer');
  const suspended = accounts.filter((a) => a.banned || (a.suspendedUntil && a.suspendedUntil > now));
  const monthFrom = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1);
  const scopeCount = (s: AdminScope) => staff.filter((a) => effectiveScopes(a.scopes).includes(s)).length;
  const crm = new Map<string, { n: number; spent: number; domains: number; last: number; refunded: boolean }>();
  for (const o of orders) {
    if (!o.buyerId) continue;
    const c = crm.get(o.buyerId) ?? { n: 0, spent: 0, domains: 0, last: 0, refunded: false };
    c.n++;
    if (o.fundedAt) c.spent += o.priceCents - o.refundedCents;
    if (o.domain) c.domains++;
    c.last = Math.max(c.last, o.createdAt);
    if (o.refundedCents > 0 || o.state === 'refunded') c.refunded = true;
    crm.set(o.buyerId, c);
  }
  const crmRows = [...crm.entries()]
    .map(([id, c]) => ({ id, name: nameOf.get(id) ?? 'Buyer', ...c }))
    .filter((r) => !bq || r.name.toLowerCase().includes(bq))
    .sort((a, b) => b.last - a.last)
    .slice(0, 100);
  const sellerSites = new Map<string, number>();
  for (const o of orders) if (o.sellerId) sellerSites.set(o.sellerId, (sellerSites.get(o.sellerId) ?? 0) + 1);
  const allowed = (page: (typeof PAGES)[number], col: string) => {
    const opens = role === 'super' || page[1].includes(role);
    return col === 'view' ? opens : opens && page[2].includes(col as 'edit');
  };
  const ago = (t: number) => {
    const d = Math.floor((now - t) / DAY_MS);
    return d < 1 ? 'Today' : d === 1 ? 'Yesterday' : `${d} days ago`;
  };
  return (
    <AdminShell viewer={viewer} active="users" file="admin-users" title={tx('Users & roles')} head={false}>
      <div className="row">
        <div>
          <h1>
            <T s={'Users & roles'} />
          </h1>
          <div className="tag">
            <T s={'Staff permissions, seller verification and buyer records · deny by default'} />
          </div>
        </div>
        {superAdmin && (
          <Link className="btn" href="/admin/users/accounts" prefetch={false}>
            <T s={'+ Invite staff'} />
          </Link>
        )}
      </div>
      <div className="kpis">
        <div className="glass kpi">
          <div className="l">
            <T s={'Staff'} />
          </div>
          <div className="v">{staff.length}</div>
          <div className="s">
            {SCOPES.filter((s) => scopeCount(s) > 0).length} <T s={'permissions in use'} />
          </div>
        </div>
        <div className="glass kpi">
          <div className="l">
            <T s={'Sellers'} />
          </div>
          <div className="v">{sellers.length}</div>
          <div className="s">
            <T s={'{length} waiting identity check'} v={{ length: pending.length }} />
          </div>
        </div>
        <div className="glass kpi">
          <div className="l">
            <T s={'Buyers'} />
          </div>
          <div className="v">{buyers.length}</div>
          <div className="s">
            {buyers.filter((b) => b.createdAt >= monthFrom).length} <T s={'new this month'} />
          </div>
        </div>
        <div className="glass kpi">
          <div className="l">
            <T s={'Suspended'} />
          </div>
          <div className="v">{suspended.length}</div>
          <div className="s">
            {suspended.filter((a) => a.banned).length} <T s={'banned'} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <aside className="glass" style={{ flex: '1 1 220px', maxWidth: 280, padding: 10, display: 'flex', flexDirection: 'column', gap: 4 }} aria-label={tx('Roles')}>
          <div className="grp" style={{ padding: '8px 10px 4px' }}>
            <T s={'Roles'} />
          </div>
          {SCOPES.map((s) => (
            <Link key={s} className={s === role ? 'role on' : 'role'} href={`/admin/users?role=${s}`} prefetch={false}>
              <span>{SCOPE_LABEL[s]}</span>
              <span className="tag" style={{ margin: 0 }}>
                <T s={'{v0} people'} v={{ v0: scopeCount(s) }} />
              </span>
            </Link>
          ))}
        </aside>
        <section className="glass" style={{ flex: '999 1 480px', minWidth: 0, padding: '8px 8px 14px' }}>
          <div className="row" style={{ padding: '14px 14px 8px' }}>
            <div>
              <h2>
                <T s={'{v0} permissions'} v={{ v0: SCOPE_LABEL[role] }} />
              </h2>
              <div className="tag">
                <T s={'What this role can open and do. Give an admin a role in the accounts tool.'} />
              </div>
            </div>
            {superAdmin && (
              <Link className="btn sm" href="/admin/users/accounts" prefetch={false}>
                <T s={'Set roles'} />
              </Link>
            )}
          </div>
          <div className="tbl">
            <table className="pm">
              <thead>
                <tr>
                  <th>
                    <T s={'Page'} />
                  </th>
                  {COLS(tx).map(([, l]) => (
                    <th key={l}>{l}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PAGES.map((p, i) => (
                  <tr key={p[0]}>
                    <td style={{ fontWeight: 500 }}>{translate(p[0])}</td>
                    {COLS(tx).map(([k, l], j) => (
                      <td key={k}>
                        <label className="hidden-label" htmlFor={`p${i}_${j}`}>
                          {l} {translate(p[0])}
                        </label>
                        <input id={`p${i}_${j}`} type="checkbox" checked={allowed(p, k)} readOnly disabled />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '16px 14px 0' }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
              <T s={'Hidden from this role'} />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(
                [
                  [tx('Payout account'), role !== 'finance' && role !== 'super'],
                  [tx('Identity documents'), role !== 'finance' && role !== 'super'],
                  [tx('Source file links'), role !== 'catalog' && role !== 'delivery' && role !== 'super'],
                  [tx('Audit log'), role !== 'super'],
                ] as const
              ).map(([l, hidden]) => (
                <label key={l} className="chk" style={{ padding: '0 12px', borderRadius: 999, border: '1px solid #DCE7EC', background: 'rgba(255,255,255,.7)' }}>
                  <input type="checkbox" checked={hidden} readOnly disabled /> {l}
                </label>
              ))}
            </div>
          </div>
        </section>
      </div>

      {finance && (
        <section className="glass" style={{ padding: '8px 8px 4px' }} id="verify">
          <div className="row" style={{ padding: '14px 14px 4px' }}>
            <div>
              <h2>
                <T s={'Seller verification'} />
              </h2>
              <div className="tag">
                <T s={'Identity and payout method are checked before the first payout. Only Finance sees these; each document opens for 5 minutes and the opening is logged.'} />
              </div>
            </div>
            <Link className="btn sm ghost" href="/admin/users/sellers" prefetch={false}>
              <T s={'All sellers'} />
            </Link>
          </div>
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>
                    <T s={'Seller'} />
                  </th>
                  <th>
                    <T s={'Sent'} />
                  </th>
                  <th>
                    <T s={'Orders'} />
                  </th>
                  <th>
                    <T s={'Document'} />
                  </th>
                  <th>
                    <T s={'Country'} />
                  </th>
                  <th>
                    <span className="hidden-label">
                      <T s={'Actions'} />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pending.length ? (
                  pending.map((c) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 500 }}>{nameOf.get(c.seller_id) ?? tx('Seller')}</td>
                      <td>{shortDate(Date.parse(c.created_at))}</td>
                      <td>{sellerSites.get(c.seller_id) ?? 0}</td>
                      <td>
                        <span className="status st-wait">{DOC(tx)[c.doc_type] ?? c.doc_type}</span>
                      </td>
                      <td>{COUNTRY_NAME[c.country] ?? c.country}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', textAlign: 'left' }}>
                          <a className="btn sm ghost" href={`/api/admin/verifications/${c.id}/file?side=front`} target="_blank" rel="noopener noreferrer">
                            <T s={'View front'} />
                          </a>
                          {c.back_path && (
                            <a className="btn sm ghost" href={`/api/admin/verifications/${c.id}/file?side=back`} target="_blank" rel="noopener noreferrer">
                              <T s={'View back'} />
                            </a>
                          )}
                          <ActionButton endpoint={`/api/admin/verifications/${c.id}`} label={tx('Approve')} body={{ decision: 'approve' }} />
                          <ActionButton
                            endpoint={`/api/admin/verifications/${c.id}`}
                            label={tx('Reject')}
                            tone="line"
                            body={{ decision: 'reject' }}
                            note={{ label: tx('Reason for the seller'), required: true }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="muted">
                      <T s={'No identity check is waiting.'} />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="glass" style={{ padding: '8px 8px 4px' }}>
        <div className="row" style={{ padding: '14px 14px 4px' }}>
          <div>
            <h2>
              <T s={'Buyers (CRM)'} />
            </h2>
            <div className="tag">
              <T s={'Purchase history and value per buyer, last 12 months'} />
            </div>
          </div>
          <form action="/admin/users" method="get" role="search" style={{ maxWidth: 240, width: '100%' }}>
            <label htmlFor="bs" className="hidden-label">
              <T s={'Search buyers'} />
            </label>
            <input id="bs" name="b" defaultValue={sp.b ?? ''} className="input" placeholder={tx('Search buyers')} style={{ maxWidth: 240, borderRadius: 999 }} />
          </form>
        </div>
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>
                  <T s={'Buyer'} />
                </th>
                <th>
                  <T s={'Orders'} />
                </th>
                <th>
                  <T s={'Total spent'} />
                </th>
                <th>
                  <T s={'Domains'} />
                </th>
                <th>
                  <T s={'Last order'} />
                </th>
                <th>
                  <T s={'Tags'} />
                </th>
              </tr>
            </thead>
            <tbody>
              {crmRows.length ? (
                crmRows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 500 }}>{r.name}</td>
                    <td>{r.n}</td>
                    <td>{usd(r.spent)}</td>
                    <td>{r.domains}</td>
                    <td>{ago(r.last)}</td>
                    <td>
                      {r.refunded ? (
                        <span className="status st-bad">
                          <T s={'Refunded'} />
                        </span>
                      ) : r.n > 1 ? (
                        <span className="status st-info">
                          <T s={'Repeat'} />
                        </span>
                      ) : r.domains && !r.spent ? (
                        <span className="status st-draft">
                          <T s={'Domain only'} />
                        </span>
                      ) : (
                        <span className="status st-draft">
                          <T s={'New'} />
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="muted">
                    {bq ? tx('No buyer matches that search.') : tx('No buyer has ordered yet.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {superAdmin && (
        <section className="glass" style={{ padding: '8px 8px 4px' }}>
          <div className="row" style={{ padding: '14px 14px 4px' }}>
            <div>
              <h2>
                <T s={'Accounts'} />
              </h2>
              <div className="tag">
                <T s={'Find, ban or unban a person. Every action goes in the audit log.'} />
              </div>
            </div>
            <form action="/admin/users" method="get" role="search" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label className="hidden-label" htmlFor="user-q">
                <T s={'Find by name'} />
              </label>
              <input id="user-q" className="input" name="q" defaultValue={q} placeholder={tx('Find by name')} style={{ maxWidth: 240, borderRadius: 999 }} />
              <button className="btn ghost sm" type="submit">
                <T s={'Find'} />
              </button>
            </form>
          </div>
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>
                    <T s={'Name'} />
                  </th>
                  <th>
                    <T s={'Role'} />
                  </th>
                  <th>
                    <T s={'Joined'} />
                  </th>
                  <th>
                    <T s={'State'} />
                  </th>
                  <th>
                    <span className="hidden-label">
                      <T s={'Actions'} />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.length ? (
                  users.map((u) => (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 500 }}>{u.name}</td>
                      <td>{u.role}</td>
                      <td>{shortDate(u.createdAt)}</td>
                      <td>
                        {u.banned ? (
                          <span className="status st-bad">
                            <T s={'Banned'} />
                          </span>
                        ) : u.flagged ? (
                          <span className="status st-wait">
                            <T s={'Flagged'} />
                          </span>
                        ) : (
                          <span className="status st-ok">
                            <T s={'Active'} />
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {u.id === viewer?.id ? null : (
                          <AdminForm
                            endpoint={`/api/admin/users/${u.id}/action`}
                            openLabel={tx('Act')}
                            submit={tx('Save')}
                            tone="line"
                            fields={[
                              {
                                name: 'action',
                                label: tx('What to do'),
                                kind: 'select',
                                options: [
                                  [u.banned ? 'unban' : 'ban', u.banned ? 'Unban' : 'Ban'],
                                  ['unsuspend', tx('Lift a suspension')],
                                  ['clear_flag', tx('Clear the flag')],
                                ],
                              },
                              { name: 'note', label: tx('Why (goes in the audit log)'), kind: 'textarea', required: true },
                            ]}
                          />
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="muted">
                      <T s={'No accounts found.'} />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {superAdmin && (
        <section className="glass card" id="developers">
          <div className="row" style={{ marginBottom: 6 }}>
            <h2>
              <T s={'Developer profiles'} />
            </h2>
            <span className="tag" style={{ margin: 0 }}>
              <T s={'Profiles stay hidden until you approve them'} />
            </span>
          </div>
          {devs.length ? (
            devs.map((d) => (
              <div key={d.handle} className="li" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                <b style={{ fontWeight: 500 }}>
                  {d.name} · {d.headline}
                </b>
                <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                  {d.bio}
                </p>
                <AdminForm
                  endpoint={`/api/admin/developers/${d.handle}/decide`}
                  submit={tx('Save decision')}
                  openLabel={tx('Decide')}
                  tone="blue"
                  fields={[
                    {
                      name: 'decision',
                      label: tx('Decision'),
                      kind: 'select',
                      options: [
                        ['approve', tx('Approve and publish')],
                        ['changes', tx('Send back for changes')],
                        ['reject', 'Reject'],
                      ],
                    },
                    { name: 'note', label: tx('Note for the developer (needed unless you approve)'), kind: 'textarea' },
                  ]}
                />
              </div>
            ))
          ) : (
            <p className="muted" style={{ margin: '8px 0 0', fontSize: 14 }}>
              <T s={'Nothing is waiting for review.'} />
            </p>
          )}
        </section>
      )}
    </AdminShell>
  );
}

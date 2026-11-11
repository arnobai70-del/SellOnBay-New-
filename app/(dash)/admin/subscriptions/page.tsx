import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionButton } from '@/components/ActionButton';
import { AdminShell } from '@/components/glass/AdminShell';
import { PlanEditor, SubSettingsForm } from '@/components/glass/SubAdminForms';
import { hasScope } from '@/lib/admin/scopes';
import { ADMIN_MOVES, PERIOD_LABEL, STATUS_LABEL, STATUS_TONE } from '@/lib/buyerSubs/rules';
import { adminSubs, allPlans, subReport, subSettings } from '@/lib/buyerSubs/service';
import { profileNames } from '@/lib/glass/admin';
import { HUBS } from '@/lib/seo/hubs';
import { listMethods } from '@/lib/payments/store';
import { requireViewer } from '@/lib/supabase/viewer';
import { SellerSection } from './SellerSection';

export const metadata: Metadata = { title: 'Buyer subscriptions', robots: { index: false } };
export const dynamic = 'force-dynamic';

const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0 })}`;
const day = (t: number | null) => (t ? new Date(t).toISOString().slice(0, 10) : '–');
const API = '/api/admin/buyer-subscriptions';

/*
 * Admin › Buyer subscriptions (owner, 2026-11-12): the on/off switch and pricing page words, every plan (create, edit, duplicate, archive),
 * subscriptions with their payments (verify, reject, approve, suspend, cancel, extend), and the numbers. Plans and settings need a Super Admin;
 * payments and subscriptions Finance or Super. Coupons are the ones in Admin › Marketing.
 */
export default async function AdminSubscriptions({ searchParams }: { searchParams: Promise<{ edit?: string; status?: string; tab?: string }> }) {
  const viewer = await requireViewer({ path: '/admin/subscriptions', roles: ['admin'], scope: ['finance', 'super'] });
  const sp = await searchParams;
  const now = Date.now();
  const [settings, plans, { rows, payments }] = await Promise.all([subSettings(), allPlans(), adminSubs()]);
  const report = subReport(rows, payments, now);
  const names = await profileNames(rows.map((r) => r.sub.buyerId)).catch(() => new Map<string, string>());
  const superAdmin = !viewer || hasScope(viewer.scopes ?? [], 'super'); // no viewer only in the demo build without a database; the API checks the scope on every save
  const shown = sp.status ? rows.filter((r) => r.sub.status === sp.status) : rows;
  const categories = HUBS.map((h) => ({ slug: h.slug, name: h.name.replace(/ Websites$/, '') }));
  const editing = sp.edit === 'new' ? null : plans.find((p) => p.id === sp.edit);
  const tab = sp.tab === 'seller' ? 'seller' : 'buyer';
  const methods = superAdmin ? await listMethods(true).catch(() => []) : [];
  return (
    <AdminShell viewer={viewer} active="subscriptions" file="admin-finance" title="Subscription Management" subtitle="Buyer and seller subscriptions: switches, plans, prices, members and payments.">
      <div className="seg" role="tablist" aria-label="Subscriptions" style={{ alignSelf: 'flex-start' }}>
        <Link role="tab" aria-selected={tab === 'buyer'} className={tab === 'buyer' ? 'on' : ''} href="/admin/subscriptions" prefetch={false}>
          Buyer subscriptions
        </Link>
        <Link role="tab" aria-selected={tab === 'seller'} className={tab === 'seller' ? 'on' : ''} href="/admin/subscriptions?tab=seller" prefetch={false}>
          Seller subscriptions
        </Link>
      </div>
      {tab === 'seller' ? (
        <SellerSection superAdmin={superAdmin} />
      ) : (
        <>
          <div className="kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: 12 }}>
            {[
              ['Active', String(report.active), 'running now'],
              ['Waiting', String(report.waiting), 'payment or review'],
              ['Ending in 30 days', String(report.expiringSoon), 'reminders go out 14 days before'],
              ['Revenue', usd(report.revenueCents), `${report.newSales} new · ${report.renewals} renewals`],
              ['Expired', String(report.expired), 'licence and support ended'],
            ].map(([l, v, s]) => (
              <div key={l} className="glass kpi">
                <div className="l">{l}</div>
                <div className="v">{v}</div>
                <div className="s">{s}</div>
              </div>
            ))}
          </div>

          {superAdmin && (
            <section className="glass card">
              <div className="row" style={{ marginBottom: 8 }}>
                <h2>Feature and pricing page</h2>
                <span className={`status ${settings.enabled ? 'st-ok' : 'st-draft'}`}>{settings.enabled ? 'Open' : 'Off'}</span>
              </div>
              <SubSettingsForm
                enabled={settings.enabled}
                intro={settings.intro}
                faq={settings.faq}
                allowedMethods={settings.allowedMethods}
                methods={methods.map((m) => ({ id: m.id, label: m.label }))}
              />
              <div className="tag">
                <Link href="/subscriptions" prefetch={false}>
                  Open the pricing page
                </Link>{' '}
                (admins see it even while it is off). Coupons for subscriptions are made in <Link href="/admin/marketing">Marketing</Link>.
              </div>
            </section>
          )}

          <section className="glass card">
            <div className="row" style={{ marginBottom: 8 }}>
              <h2>Plans</h2>
              {superAdmin && (
                <Link className="btn sm" href="/admin/subscriptions?edit=new#plan-editor" prefetch={false}>
                  + New plan
                </Link>
              )}
            </div>
            <div className="tbl" style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>Price</th>
                    <th>Renewal</th>
                    <th>Websites</th>
                    <th>Support</th>
                    <th>State</th>
                    {superAdmin && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {plans.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <span aria-hidden="true" style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: p.color, marginRight: 8 }} />
                        {p.name} {p.badge && <span className="tag">· {p.badge}</span>}
                      </td>
                      <td>
                        {usd(p.priceCents)} / {p.period === 'custom' ? `${p.periodDays} days` : PERIOD_LABEL[p.period]}
                      </td>
                      <td>{usd(p.renewalCents)}</td>
                      <td>{p.websiteLimit}</td>
                      <td>{p.supportDays} days</td>
                      <td>
                        <span className={`status ${p.archivedAt ? 'st-draft' : p.active && p.visible ? 'st-ok' : 'st-wait'}`}>
                          {p.archivedAt ? 'Archived' : !p.active ? 'Inactive' : !p.visible ? 'Hidden' : 'On sale'}
                        </span>
                      </td>
                      {superAdmin && (
                        <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <Link className="btn sm ghost" href={`/admin/subscriptions?edit=${p.id}#plan-editor`} prefetch={false}>
                            Edit
                          </Link>
                          <ActionButton endpoint={API} body={{ action: 'duplicatePlan', id: p.id }} label="Duplicate" tone="line" />
                          <ActionButton
                            endpoint={API}
                            body={{ action: 'archivePlan', id: p.id, archived: !p.archivedAt }}
                            label={p.archivedAt ? 'Restore' : 'Delete'}
                            tone="line"
                            confirm={p.archivedAt ? undefined : 'Delete this plan? It is archived: hidden and not for sale, and running subscriptions keep working.'}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {superAdmin && sp.edit && (
            <section className="glass card" id="plan-editor">
              <div className="row" style={{ marginBottom: 8 }}>
                <h2>{editing ? `Edit ${editing.name}` : 'New plan'}</h2>
                <Link className="btn sm ghost" href="/admin/subscriptions" prefetch={false}>
                  Close
                </Link>
              </div>
              <PlanEditor key={editing?.id ?? 'new'} plan={editing ?? null} categories={categories} />
            </section>
          )}

          <section className="glass" style={{ padding: '8px 8px 4px' }}>
            <div className="row" style={{ padding: '14px 14px 4px', flexWrap: 'wrap', gap: 8 }}>
              <h2>Subscriptions</h2>
              <div className="seg" role="tablist" aria-label="Filter">
                {[['', 'All'], ...Object.entries(STATUS_LABEL)].map(([k, l]) => (
                  <Link
                    key={k || 'all'}
                    role="tab"
                    className={(sp.status ?? '') === k ? 'on' : ''}
                    aria-selected={(sp.status ?? '') === k}
                    href={k ? `/admin/subscriptions?status=${k}` : '/admin/subscriptions'}
                    prefetch={false}
                  >
                    {l}
                  </Link>
                ))}
              </div>
            </div>
            <div className="tbl" style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Buyer</th>
                    <th>Plan</th>
                    <th>Status</th>
                    <th>Websites</th>
                    <th>Ends</th>
                    <th>Payment to check</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.length === 0 && (
                    <tr>
                      <td colSpan={7} className="muted">
                        No subscriptions here yet.
                      </td>
                    </tr>
                  )}
                  {shown.map(({ sub, selections, waiting }) => (
                    <tr key={sub.id}>
                      <td>{names.get(sub.buyerId) ?? sub.buyerId.slice(0, 8)}</td>
                      <td>
                        {sub.plan.name} · {usd(sub.amountCents)}
                        {sub.couponCode ? ` (${sub.couponCode})` : ''}
                      </td>
                      <td>
                        <span className={`status ${STATUS_TONE[sub.status]}`}>{STATUS_LABEL[sub.status]}</span>
                      </td>
                      <td>
                        {selections} / {sub.creditsTotal || sub.plan.websiteLimit}
                      </td>
                      <td>{day(sub.expiresAt)}</td>
                      <td>
                        {waiting.map((p) => (
                          <div key={p.id} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
                            <span className="tag" style={{ margin: 0 }}>
                              {p.kind === 'new' ? 'New' : 'Renewal'} {usd(p.amountCents)} · {p.methodLabel || 'manual'} · {p.reference}
                              {p.paidOn ? ` · ${p.paidOn}` : ''}
                            </span>
                            <ActionButton endpoint={API} body={{ action: 'payment', id: p.id, verified: true }} label="Verify" />
                            <ActionButton
                              endpoint={API}
                              body={{ action: 'payment', id: p.id, verified: false }}
                              label="Reject"
                              tone="line"
                              confirm="Reject this payment? The buyer can send another reference."
                            />
                          </div>
                        ))}
                        {!waiting.length && <span className="muted">–</span>}
                      </td>
                      <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {ADMIN_MOVES[sub.status].map((to) => (
                          <ActionButton
                            key={to}
                            endpoint={API}
                            body={{ action: 'move', id: sub.id, to }}
                            label={to === 'active' ? (sub.startsAt ? 'Reactivate' : 'Approve') : to === 'suspended' ? 'Suspend' : to === 'cancelled' ? 'Cancel' : 'Reject'}
                            tone={to === 'active' ? 'blue' : 'line'}
                            note={to === 'active' ? undefined : { label: 'Reason (kept in the history)', required: true }}
                          />
                        ))}
                        {sub.expiresAt && (
                          <ActionButton endpoint={API} body={{ action: 'extend', id: sub.id }} label="Extend" tone="line" note={{ label: 'Days to add (1 to 3650)', required: true, rows: 1 }} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <div className="tag">
            Expiry ends the licence and free support only: buyers&apos; websites keep running and their downloaded files stay theirs. Each chosen website is a $0 order, so its files, downloads and
            support use the normal order tools (<Link href="/admin/support">Disputes &amp; support</Link>).
          </div>
        </>
      )}
    </AdminShell>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionButton } from '@/components/ActionButton';
import { AdminForm } from '@/components/AdminForm';
import { AdminShell } from '@/components/glass/AdminShell';
import { systemSnapshot } from '@/lib/admin/system';
import { CONFIG, PAYOUT_TEXT, PLAN_KEEP_TEXT, REVIEW_HOURS } from '@/lib/config';
import { readRows, isActive } from '@/lib/maintenance/state';
import { launchChecks } from '@/lib/launchCheck';
import { listMethods } from '@/lib/payments/store';
import { allPosts } from '@/lib/posts';
import { paypalConfigured } from '@/lib/providers/payment';
import { getSettings } from '@/lib/settings';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Settings'), robots: { index: false } });
export const dynamic = 'force-dynamic';

const why = { name: 'reason', label: 'Why (goes in the audit log)', kind: 'textarea' as const, required: true };
const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? 'G-FEK9C0CM04';
const DOT = { ok: '#3F8F77', warn: '#C9962E', bad: '#C2553F', off: '#A9B8C0' } as const;
const RO: React.CSSProperties = { background: 'rgba(255,255,255,.6)' };

/*
 * design-reference/admin-settings.html (Super Admin). Every change needs a reason and is audited: the payments mode and countries (/api/admin/settings),
 * the bank and wallet methods buyers see (/api/admin/payments/methods). Money rules are fixed in lib/config.ts and shown read-only. Server keys show
 * whether each is set, never its value.
 */
export default async function AdminSettings() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/settings', roles: ['admin'], scope: 'super' });
  const [s, checks, methods, posts, maint, system] = await Promise.all([
    getSettings(),
    launchChecks(),
    listMethods(),
    allPosts().catch(() => []),
    readRows().catch(() => null),
    systemSnapshot().catch(() => null),
  ]);
  const dev = process.env.NODE_ENV === 'development';
  const live = s.paymentsMode === 'live';
  const paypal = paypalConfigured();
  const closed = maint ? maint.rows.filter((r) => isActive(r)).length + maint.pages.filter((p) => isActive(p)).length : 0;
  const drafts = posts.filter((p) => p.status !== 'published').length;
  return (
    <AdminShell viewer={viewer} active="settings" file="admin-settings" title={tx('Settings')} head={false}>
      <div className="row">
        <div>
          <h1>
            <T s={'Settings'} />
          </h1>
          <div className="tag">
            <T s={'Payments, platform rules, website & SEO, dashboard and system health. Every change needs a reason and goes in the audit log.'} />
          </div>
        </div>
        <Link className="btn" href="/admin/settings/platform" prefetch={false}>
          <T s={'Shop settings'} />
        </Link>
      </div>

      <section className="glass card">
        <div className="row" style={{ marginBottom: 4 }}>
          <h2>
            <T s={'Payment gateways'} />
          </h2>
          <span className={`status ${live ? 'st-ok' : 'st-info'}`}>{live ? tx('Live payments') : tx('Free beta: nothing is charged')}</span>
        </div>
        <div className="gw">
          <span className="gico" style={{ background: '#E8EEF2' }} aria-hidden="true">
            <T s={'MODE'} />
          </span>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <b style={{ fontWeight: 500 }}>
              <T s={'Payments mode'} />
            </b>
            <div className="tag">
              <T s={'Live needs a payment provider and its keys on the server. Going back to the beta stops new paid checkouts; paid orders carry on.'} />
            </div>
          </div>
          <AdminForm
            endpoint="/api/admin/settings"
            openLabel="Change"
            submit="Save payments mode"
            tone="line"
            fields={[
              {
                name: 'paymentsMode',
                label: tx('Payments mode'),
                kind: 'select',
                options: [
                  [s.paymentsMode, s.paymentsMode === 'beta_free' ? 'Free beta' : 'Live'],
                  [s.paymentsMode === 'beta_free' ? 'live' : 'beta_free', s.paymentsMode === 'beta_free' ? 'Live' : 'Free beta'],
                ],
              },
              why,
            ]}
          />
        </div>
        <div className="gw">
          <span className="gico" style={{ background: '#DDEAF6' }} aria-hidden="true">
            <T s={'CARD'} />
          </span>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <b style={{ fontWeight: 500 }}>
              <T s={'Card and PayPal'} />
            </b>
            <div className="tag">
              {paypal ? `PayPal · ${process.env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox'} · automatic confirmation` : tx('Test cards only until the PayPal keys are set on the server')}
            </div>
          </div>
          <span className={`status ${paypal ? 'st-ok' : 'st-draft'}`}>{paypal ? (process.env.PAYPAL_ENV === 'live' ? tx('Live') : tx('Test')) : tx('Not set')}</span>
          <Link className="btn sm ghost" href="/admin/settings/launch" prefetch={false}>
            <T s={'Keys & account'} />
          </Link>
          <button type="button" className={live && paypal ? 'sw on' : 'sw'} role="switch" aria-checked={live && paypal} aria-label={tx('Card payments enabled')} disabled />
        </div>
        {methods.map((m) => (
          <div key={m.id} className="gw">
            <span className="gico" style={{ background: m.kind === 'bank_transfer' ? '#DCF0E7' : '#F6E0EA' }} aria-hidden="true">
              {m.kind === 'bank_transfer' ? tx('BANK') : tx('WAL')}
            </span>
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <b style={{ fontWeight: 500 }}>{m.label}</b>
              <div className="tag">
                <T s={'{v0} · {currency} · manual reference check, verify in Orders & payments'} v={{ v0: m.kind.replace('_', ' '), currency: m.currency }} />
              </div>
            </div>
            <AdminForm
              endpoint="/api/admin/payments/methods"
              fixed={{ id: m.id, kind: m.kind }}
              openLabel="Keys & account"
              submit="Save"
              tone="line"
              fields={[
                { name: 'label', label: tx('Name'), kind: 'text', value: m.label, required: true },
                { name: 'instructions', label: tx('Instructions buyers see'), kind: 'textarea', value: m.instructions, required: true },
                { name: 'currency', label: tx('Currency'), kind: 'text', value: m.currency, required: true },
                {
                  name: 'active',
                  label: tx('Shown to buyers'),
                  kind: 'select',
                  options: [
                    [m.active ? 'on' : 'off', m.active ? 'Shown' : 'Hidden'],
                    [m.active ? 'off' : 'on', m.active ? 'Hidden' : 'Shown'],
                  ],
                },
                why,
              ]}
            />
            <button type="button" className={m.active ? 'sw on' : 'sw'} role="switch" aria-checked={m.active} aria-label={`${m.label} enabled`} disabled />
          </div>
        ))}
        <div className="gw">
          <span className="gico" style={{ background: '#F1E8DD' }} aria-hidden="true">
            <T s={'CASH'} />
          </span>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <b style={{ fontWeight: 500 }}>
              <T s={'Cash (office)'} />
            </b>
            <div className="tag">
              <T s={'POS only · receipt number · open when live payments are on'} />
            </div>
          </div>
          <Link className="btn sm ghost" href="/admin/orders#pos" prefetch={false}>
            <T s={'Open POS'} />
          </Link>
          <button type="button" className={live ? 'sw on' : 'sw'} role="switch" aria-checked={live} aria-label={tx('Cash (office) enabled')} disabled />
        </div>
        <div style={{ marginTop: 12 }}>
          <AdminForm
            endpoint="/api/admin/payments/methods"
            openLabel="Add a bank or wallet"
            submit="Add"
            tone="line"
            fields={[
              {
                name: 'kind',
                label: tx('Kind'),
                kind: 'select',
                options: [
                  ['bank_transfer', 'Business bank transfer'],
                  ['local_wallet', 'Local wallet'],
                ],
              },
              { name: 'label', label: tx('Name'), kind: 'text', required: true },
              { name: 'instructions', label: tx('Instructions buyers see (account details)'), kind: 'textarea', required: true },
              { name: 'currency', label: tx('Currency'), kind: 'text', value: 'USD', required: true },
              {
                name: 'active',
                label: tx('Shown to buyers'),
                kind: 'select',
                options: [
                  ['off', 'Hidden for now'],
                  ['on', 'Shown'],
                ],
              },
              why,
            ]}
          />
        </div>
      </section>

      <section className="glass card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="row">
          <h2>
            <T s={'Platform rules'} />
          </h2>
          <span className="tag" style={{ margin: 0 }}>
            <T s={'Fixed in the code (lib/config.ts); the owner decides changes'} />
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(200px, 100%),1fr))', gap: 14 }}>
          {(
            [
              ['cm', 'Seller share', PLAN_KEEP_TEXT],
              ['mp', 'Minimum website price', `$${CONFIG.sale.priceMinCents / 100}`],
              ['rw', 'Buyer review window', `${REVIEW_HOURS} hours`],
              ['pd', 'Payout day', PAYOUT_TEXT],
              ['cp', 'Coupon discount paid by', 'Platform'],
              ['mt', 'Monthly sales target', 'Not set'],
            ] as const
          ).map(([id, l, v]) => (
            <div key={id} className="field">
              <label htmlFor={id}>{l}</label>
              <input id={id} className="input" value={v} readOnly style={RO} />
            </div>
          ))}
        </div>
        <div className="row" style={{ fontSize: 14 }}>
          <span>
            <T s={'Countries buyers may order from:'} /> <b style={{ fontWeight: 500 }}>{s.allowedCountries.trim() ? s.allowedCountries : tx('Everywhere')}</b>
          </span>
          <AdminForm
            endpoint="/api/admin/settings"
            openLabel="Change"
            submit="Save countries"
            tone="line"
            fields={[{ name: 'allowedCountries', label: tx('Two-letter codes, like US, GB, DE (empty = everywhere)'), kind: 'text', value: s.allowedCountries, max: 800 }, why]}
          />
        </div>
      </section>

      <section className="glass card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="row">
          <h2>
            <T s={'Website & SEO'} />
          </h2>
          <Link className="btn sm ghost" href="/" prefetch={false}>
            <T s={'Open home page'} />
          </Link>
        </div>
        <div className="row" style={{ fontSize: 14 }}>
          <span>
            <T s={'Home headline, words and blocks'} />
          </span>
          <Link className="btn sm ghost" href="/admin/content/pages/edit?key=home" prefetch={false}>
            <T s={'Edit home page'} />
          </Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(260px, 100%),1fr))', gap: 14 }}>
          <div className="row" style={{ fontSize: 14 }}>
            <span>
              <T s={'SEO titles and descriptions'} />
            </span>
            <Link className="btn sm ghost" href="/admin/seo/pages" prefetch={false}>
              <T s={'Every page'} />
            </Link>
          </div>
          <div className="field">
            <label htmlFor="ga">
              <T s={'Google Analytics ID'} />
            </label>
            <input id="ga" className="input" value={GA_ID} readOnly style={RO} />
          </div>
        </div>
        <div style={{ fontSize: 13, color: '#3D5563' }}>
          <T s={'Featured on home: chosen per category in'} />{' '}
          <Link href="/admin/seo/categories" prefetch={false}>
            <T s={'SEO › Categories'} />
          </Link>
          <T s={'. Analytics loads only after a visitor accepts it.'} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(
            [
              ['/admin/seo', 'SEO hub'],
              ['/admin/seo/redirects', 'Redirects'],
              ['/admin/seo/robots', 'robots.txt'],
              ['/admin/seo/navigation', 'Top bar'],
              ['/admin/seo/links', 'Link check'],
              ['/admin/seo/check', 'SEO check'],
            ] as const
          ).map(([h, l]) => (
            <Link key={h} className="btn sm ghost" href={h} prefetch={false}>
              {l}
            </Link>
          ))}
        </div>
      </section>

      <section className="glass" style={{ padding: '8px 8px 4px' }}>
        <div className="row" style={{ padding: '14px 14px 4px' }}>
          <div>
            <h2>
              <T s={'Pages & content'} />
            </h2>
            <div className="tag">
              <T s={'Public pages your team can edit without a developer'} />
            </div>
          </div>
          <Link className="btn sm ghost" href="/admin/content/cms?doc=faq" prefetch={false}>
            <T s={'+ New help article'} />
          </Link>
        </div>
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>
                  <T s={'Page'} />
                </th>
                <th>
                  <T s={'Type'} />
                </th>
                <th>
                  <T s={'Last edited'} />
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
              {(
                [
                  ['Terms, privacy, refunds, licenses, seller agreement', 'Legal', 'Draft', ['st-wait', 'Needs lawyer review'], '/admin/settings/legal', 'Edit'],
                  ['Home, Sell, Help, website pages, top bar, footer', 'Pages', '—', ['st-ok', 'Published'], '/admin/content/pages', 'Edit'],
                  ['Help center questions and emails', 'Help', '—', ['st-ok', 'Published'], '/admin/content/cms', 'Manage'],
                  [`Guides · ${posts.length} posts`, 'Blog', '—', [drafts ? 'st-info' : 'st-ok', drafts ? `${drafts} drafts` : 'Published'], '/admin/content/guides', 'Manage'],
                  ['Menu, footer and page blocks', 'Site builder', '—', ['st-ok', 'Published'], '/admin/content/site', 'Edit'],
                  ['Contact addresses and social links', 'Contact & social', '—', ['st-ok', 'Published'], '/admin/settings/contact', 'Edit'],
                  ['Maintenance mode', 'System', '—', [closed ? 'st-wait' : 'st-draft', closed ? `${closed} closed now` : 'Off'], '/admin/settings/maintenance', 'Open'],
                ] as const
              ).map(([page, type, edited, [tone, status], href, act]) => (
                <tr key={page}>
                  <td style={{ fontWeight: 500 }}>{page}</td>
                  <td>{type}</td>
                  <td>{edited}</td>
                  <td>
                    <span className={`status ${tone}`}>{status}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Link className="btn sm ghost" href={href} prefetch={false}>
                      {act}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid2">
        <section className="glass card" id="dashboard" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2>
            <T s={'Dashboard & language'} />
          </h2>
          <div className="field">
            <label htmlFor="dl">
              <T s={'Default admin language'} />
            </label>
            <select id="dl" className="input" defaultValue="en" disabled>
              <option value="en">
                <T s={'English'} />
              </option>
            </select>
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, marginTop: 6 }}>
            <T s={'Overview widgets'} />
          </div>
          {['KPI cards', 'Quick access', 'Sales trend', 'Monthly target', 'Needs your attention', 'Escrow timers', 'Seller bulletin'].map((w) => (
            <div key={w} className="row" style={{ fontSize: 14, minHeight: 36 }}>
              <span>{w}</span>
              <button type="button" className="sw on" role="switch" aria-checked="true" aria-label={`Show ${w}`} disabled />
            </div>
          ))}
          <div className="tag" style={{ margin: 0 }}>
            <T s={'Every widget is shown; choosing them is not built yet.'} />
          </div>
        </section>
        <section id="health" className="glass card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="row" style={{ marginBottom: 6 }}>
            <h2>
              <T s={'System health & backup'} />
            </h2>
            <Link className="btn sm" href="/admin/system" prefetch={false}>
              <T s={'Server health'} />
            </Link>
          </div>
          {system ? (
            system.services.map((sv) => (
              <div key={sv.key} className="li" style={{ fontSize: 14 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: DOT[sv.tone], flex: 'none' }} />
                <span style={{ flex: 1 }}>{sv.label}</span>
                <span className="muted" style={{ fontSize: 13 }}>
                  {sv.text}
                </span>
              </div>
            ))
          ) : (
            <div className="li" style={{ fontSize: 14 }}>
              <span className="muted">
                <T s={'The checks did not answer in time.'} />
              </span>
            </div>
          )}
          <div className="li" style={{ fontSize: 14 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: DOT.off, flex: 'none' }} />
            <span style={{ flex: 1 }}>
              <T s={'Backups'} />
            </span>
            <span className="muted" style={{ fontSize: 13 }}>
              <T s={'Taken at the database host, not from here'} />
            </span>
          </div>
          {dev && (
            <div style={{ marginTop: 8 }}>
              <ActionButton endpoint="/api/admin/test-email" label="Send a test email to dev@" tone="line" body={{}} />
              <div className="tag">
                <T s={'Development only: the email is written to the terminal.'} />
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="glass card">
        <div className="row" style={{ marginBottom: 6 }}>
          <h2>
            <T s={'Server keys'} />
          </h2>
          <span className="tag" style={{ margin: 0 }}>
            <T s={'Whether each is in place. Values are never shown here.'} />
          </span>
        </div>
        {checks.map((c) => (
          <div key={c.name} className="li" style={{ fontSize: 14 }}>
            <span style={{ flex: 1 }}>{c.name}</span>
            <span className={`status ${c.state === 'ok' ? 'st-ok' : c.state === 'warn' ? 'st-wait' : 'st-bad'}`}>
              {c.state === 'ok' ? tx('Set') : c.state === 'warn' ? tx('Check') : tx('Missing')}
            </span>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {(
            [
              ['/admin/settings/platform', 'Prices, delivery hours, safety check'],
              ['/admin/settings/flags', 'Feature flags'],
              ['/admin/settings/launch', 'Launch check'],
              ['/admin/settings/maintenance', 'Maintenance'],
              ['/admin/settings/contact', 'Contact & social'],
            ] as const
          ).map(([h, l]) => (
            <Link key={h} className="btn sm ghost" href={h} prefetch={false}>
              {l}
            </Link>
          ))}
        </div>
      </section>
    </AdminShell>
  );
}

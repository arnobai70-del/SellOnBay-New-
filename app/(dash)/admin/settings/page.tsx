import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionButton } from '@/components/ActionButton';
import { AdminForm } from '@/components/AdminForm';
import { AdminShell } from '@/components/glass/AdminShell';
import { GlassCard } from '@/components/glass/GlassCard';
import { StatusPill } from '@/components/glass/StatusPill';
import { launchChecks } from '@/lib/launchCheck';
import { getSettings } from '@/lib/settings';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Settings', robots: { index: false } };
export const dynamic = 'force-dynamic';

const why = { name: 'reason', label: 'Why (goes in the audit log)', kind: 'textarea' as const, required: true };
const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? 'G-FEK9C0CM04';

/*
 * Super Admin settings: the payments mode (free beta or live), the countries buyers may order from, and read-only facts: which server keys are set
 * (never their values) and the GA id. Every change needs a reason and is audited. Contact & social has its own page.
 */
export default async function AdminSettings() {
  const viewer = await requireViewer({ path: '/admin/settings', roles: ['admin'], scope: 'super' });
  const [s, checks] = await Promise.all([getSettings(), launchChecks()]);
  const dev = process.env.NODE_ENV === 'development';
  return (
    <AdminShell viewer={viewer} active="settings" title="Settings" subtitle="Every change needs a reason and goes in the audit log.">
      <div className="g-grid2">
        <GlassCard as="section">
          <h2>Payments mode</h2>
          <p style={{ marginTop: 8 }}>
            <StatusPill tone={s.paymentsMode === 'beta_free' ? 'info' : 'ok'}>{s.paymentsMode === 'beta_free' ? 'Free beta: nothing is charged' : 'Live payments'}</StatusPill>
          </p>
          <p className="g-tag" style={{ marginTop: 8 }}>
            Live needs a payment provider and its keys on the server. Going back to the beta stops new paid checkouts; orders already paid carry on.
          </p>
          <div style={{ marginTop: 10 }}>
            <AdminForm
              endpoint="/api/admin/settings"
              openLabel="Change"
              submit="Save payments mode"
              tone="line"
              fields={[
                {
                  name: 'paymentsMode',
                  label: 'Payments mode',
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
        </GlassCard>
        <GlassCard as="section">
          <h2>Countries buyers may order from</h2>
          <p className="g-muted" style={{ marginTop: 8, fontSize: 14 }}>
            {s.allowedCountries.trim() ? s.allowedCountries : 'Everywhere'}
          </p>
          <div style={{ marginTop: 10 }}>
            <AdminForm
              endpoint="/api/admin/settings"
              openLabel="Change"
              submit="Save countries"
              tone="line"
              fields={[{ name: 'allowedCountries', label: 'Two-letter codes, like US, GB, DE (empty = everywhere)', kind: 'text', value: s.allowedCountries, max: 800 }, why]}
            />
          </div>
        </GlassCard>
        <GlassCard as="section">
          <h2>Maintenance</h2>
          <p className="g-muted" style={{ marginTop: 8, fontSize: 14 }}>
            Close the whole site, one area or one page, now or on a schedule.
          </p>
          <p style={{ marginTop: 10 }}>
            <Link href="/admin/settings/maintenance">Open Maintenance</Link>
          </p>
        </GlassCard>
        <GlassCard as="section">
          <h2>Contact & social</h2>
          <p className="g-muted" style={{ marginTop: 8, fontSize: 14 }}>
            The contact addresses, and the social links in the footer, Help and Sell.
          </p>
          <p style={{ marginTop: 10 }}>
            <Link href="/admin/settings/contact">Open Contact & social</Link>
          </p>
        </GlassCard>
        <GlassCard as="section">
          <h2>Analytics</h2>
          <div className="g-li">
            <span style={{ flex: 1 }}>Google Analytics id</span>
            <code>{GA_ID}</code>
          </div>
          <p className="g-tag" style={{ marginTop: 8 }}>
            Loaded only after a visitor accepts analytics. Set in the code, or by NEXT_PUBLIC_GA_ID.
          </p>
          {dev && (
            <div style={{ marginTop: 12 }}>
              <ActionButton endpoint="/api/admin/test-email" label="Send a test email to dev@" tone="line" body={{}} />
              <p className="g-tag">Development only: the email is written to the terminal.</p>
            </div>
          )}
        </GlassCard>
      </div>
      <GlassCard as="section">
        <h2>Server keys</h2>
        <p className="g-tag">Whether each is in place. Values are never shown here.</p>
        {checks.map((c) => (
          <div key={c.name} className="g-li">
            <span style={{ flex: 1 }}>{c.name}</span>
            <StatusPill tone={c.state === 'ok' ? 'ok' : c.state === 'warn' ? 'wait' : 'bad'}>{c.state === 'ok' ? 'Set' : c.state === 'warn' ? 'Check' : 'Missing'}</StatusPill>
          </div>
        ))}
        <p style={{ marginTop: 12 }}>
          <Link href="/dashboard/admin/settings">Prices, delivery hours and the other shop settings</Link>
        </p>
      </GlassCard>
    </AdminShell>
  );
}

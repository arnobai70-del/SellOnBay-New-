import type { Metadata } from 'next';
import { ActionButton } from '@/components/ActionButton';
import { AdminForm, type Field } from '@/components/AdminForm';
import { AdminShell } from '@/components/glass/AdminShell';
import { GlassCard } from '@/components/glass/GlassCard';
import { StatusPill } from '@/components/glass/StatusPill';
import { MODULES, type ModuleKey } from '@/lib/maintenance/config';
import { moduleStates, pageStates } from '@/lib/maintenance/service';
import { readRows } from '@/lib/maintenance/state';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Maintenance', robots: { index: false } };
export const dynamic = 'force-dynamic';

/* The areas the owner listed first (2026-11-08), then the older modules. */
const ORDER: ModuleKey[] = [
  'site',
  'checkout',
  'cart',
  'upload',
  'payouts',
  'domains',
  'guides',
  'help',
  'signup',
  'messaging',
  'search',
  'catalog',
  'orders',
  'auth',
  'buyer',
  'seller',
  'disputes',
  'seo',
  'ai',
  'visitor',
];
const utc = (t: number | null) => (t ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') : '');
const fields = (r: { enabled: boolean; message: string; startAt: number | null; endAt: number | null; bannerMinutes?: number }): Field[] => [
  {
    name: 'enabled',
    label: 'State',
    kind: 'select',
    options: r.enabled
      ? [
          ['on', 'Closed (or planned)'],
          ['off', 'Open'],
        ]
      : [
          ['off', 'Open'],
          ['on', 'Closed (or planned)'],
        ],
  },
  { name: 'message', label: 'Message for visitors (optional)', kind: 'textarea', value: r.message, max: 300 },
  { name: 'startAt', label: 'Start, UTC (YYYY-MM-DD HH:MM; empty = now)', kind: 'text', value: utc(r.startAt) },
  { name: 'endAt', label: 'End, UTC (empty = until opened again)', kind: 'text', value: utc(r.endAt) },
  { name: 'bannerMinutes', label: 'Show a notice this many minutes before the start (0 = none)', kind: 'text', value: String(r.bannerMinutes ?? 0) },
];

/*
 * Admin › Settings › Maintenance (owner, 2026-11-08): close the whole site, one area, or one page by its address, now or on a schedule, with a
 * notice before it starts. Admins and allow-listed addresses can still use a closed area to test it. Visitors get a 503 page with Retry-After.
 */
export default async function MaintenanceSettings() {
  const viewer = await requireViewer({ path: '/admin/settings/maintenance', roles: ['admin'], scope: 'super' });
  const [{ modules }, pages, rows] = await Promise.all([moduleStates(), pageStates(), readRows()]);
  const state = (active: boolean, enabled: boolean) =>
    active ? <StatusPill tone="bad">Closed now</StatusPill> : enabled ? <StatusPill tone="wait">Planned</StatusPill> : <StatusPill tone="ok">Open</StatusPill>;
  return (
    <AdminShell viewer={viewer} active="settings" title="Maintenance" subtitle="Close one area while the rest of the site stays live. Every change is in the audit log.">
      <GlassCard as="section">
        <h2>Areas</h2>
        <p className="tag">The whole site keeps sign-in and the admin dashboard open, so it can always be opened again. Payment webhooks and scheduled jobs never stop.</p>
        {ORDER.map((k) => {
          const m = modules.find((x) => x.key === k)!;
          return (
            <div key={k} className="li" style={{ flexWrap: 'wrap', gap: 8 }}>
              <span style={{ flex: '1 1 220px' }}>
                <b>{MODULES[k].label}</b>
                <span className="tag" style={{ display: 'block' }}>
                  Still works: {MODULES[k].keeps}
                </span>
              </span>
              {state(m.active, m.enabled)}
              <AdminForm endpoint="/api/admin/maintenance/area" openLabel="Change" submit="Save" tone="line" fixed={{ module: k }} fields={fields(m)} />
            </div>
          );
        })}
      </GlassCard>
      <GlassCard as="section">
        <h2>Single pages</h2>
        <p className="tag">An address closes that page and everything under it, for example /domains or /guides/old-post.</p>
        {pages.map((p) => (
          <div key={p.path} className="li" style={{ flexWrap: 'wrap', gap: 8 }}>
            <code style={{ flex: '1 1 200px' }}>{p.path}</code>
            {state(p.active, p.enabled)}
            <AdminForm endpoint="/api/admin/maintenance/page" openLabel="Change" submit="Save" tone="line" fixed={{ path: p.path }} fields={fields(p)} />
            <ActionButton endpoint="/api/admin/maintenance/page" label="Remove" tone="line" body={{ path: p.path, remove: true }} />
          </div>
        ))}
        <div style={{ marginTop: 10 }}>
          <AdminForm
            endpoint="/api/admin/maintenance/page"
            openLabel="Close a page"
            submit="Save"
            tone="line"
            fields={[{ name: 'path', label: 'Page address, starting with /', kind: 'text', required: true }, ...fields({ enabled: true, message: '', startAt: null, endAt: null })]}
          />
        </div>
      </GlassCard>
      <GlassCard as="section">
        <h2>Testers</h2>
        <p className="tag">
          Signed-in Super Admins can always use a closed area. These addresses can too, but only when the host&apos;s address header is trusted (CLIENT_IP_HEADER or TRUSTED_PROXY_HOPS), so nobody can
          pretend to be one.
        </p>
        <p style={{ marginTop: 8 }}>{rows.allowIps.length ? rows.allowIps.join(', ') : 'No addresses.'}</p>
        <AdminForm
          endpoint="/api/admin/maintenance/allow"
          openLabel="Change addresses"
          submit="Save"
          tone="line"
          fields={[{ name: 'ips', label: 'Addresses, one per line', kind: 'textarea', value: rows.allowIps.join('\n') }]}
        />
      </GlassCard>
    </AdminShell>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { DashShell } from '@/components/DashShell';
import { MaintenanceForm } from '@/components/MaintenanceForm';
import { MAINTENANCE_LIMITS, MODULES } from '@/lib/maintenance/config';
import { maintenanceHistory, moduleStates } from '@/lib/maintenance/service';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Maintenance Manager', robots: { index: false } };
export const dynamic = 'force-dynamic';

const when = (ms: number | null) => (ms ? new Date(ms).toUTCString().replace(/:\d\d GMT$/, ' UTC') : '');

/* Admin → System → Maintenance Manager: close one part of the site while the rest keeps working. Never closed itself. */
export default async function MaintenanceManager() {
  const viewer = await requireViewer({ path: '/dashboard/admin/maintenance', roles: ['admin'] });
  const now = Date.now();
  const [{ modules, source }, history] = await Promise.all([moduleStates(now), maintenanceHistory(30)]);
  const closed = modules.filter((m) => m.active);
  const planned = modules.filter((m) => m.enabled && !m.active && m.startAt !== null && m.startAt > now);
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-maintenance" title="Maintenance Manager">
      <div className="dp">
        <div className="hd">
          <div>
            <h2>{closed.length ? `In maintenance now: ${closed.map((m) => MODULES[m.key].label).join(', ')}` : 'Every part of the site is open'}</h2>
            <p className="sub">
              Close one part while you update it; everything else keeps working. Visitors see a short notice, apps get a &ldquo;try again later&rdquo; answer. Payment webhooks, scheduled jobs,
              sign-in, the audit log and this page never close. As an admin you can still open a closed part to test it (not the admin dashboard). Every change goes into the{' '}
              <Link href="/dashboard/admin/audit">audit log</Link>.{planned.length > 0 && ` Planned: ${planned.map((m) => `${MODULES[m.key].label} from ${when(m.startAt)}`).join('; ')}.`}
            </p>
            {source === 'memory' && (
              <p className="form-err">Saved in this server&rsquo;s memory only: the database table is not there yet (run migration 0049), so a restart forgets these settings.</p>
            )}
          </div>
        </div>
        <div className="seo-pages">
          {modules.map((m) => (
            <div className="adm-card" key={m.key} id={`module-${m.key}`}>
              <div className="seo-row">
                <div>
                  <h3>{MODULES[m.key].label}</h3>
                  <small className="muted">Still works while closed: {MODULES[m.key].keeps}</small>
                </div>
                <span className={m.active ? 'chip rose' : m.enabled ? 'chip amber' : 'chip mint'}>
                  <i />
                  {m.active ? 'In maintenance' : m.enabled ? 'Planned' : 'Open'}
                </span>
              </div>
              {(m.startAt || m.endAt) && (
                <small className="muted">
                  {m.startAt ? `From ${when(m.startAt)}` : 'From now'}
                  {m.endAt ? ` until ${when(m.endAt)}` : ' until turned off'}
                </small>
              )}
              <MaintenanceForm
                module={m.key}
                label={MODULES[m.key].label}
                enabled={m.enabled}
                message={m.message}
                startAt={m.startAt}
                endAt={m.endAt}
                max={MAINTENANCE_LIMITS.message}
                othersClosed={closed.filter((c) => c.key !== m.key).length}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="dp">
        <div className="hd">
          <div>
            <h2>History</h2>
            <p className="sub">The last {history.length || ''} changes, newest first. Kept by the database; nobody can edit them.</p>
          </div>
        </div>
        {history.length === 0 ? (
          <p className="muted">No changes yet.</p>
        ) : (
          <ul className="lst">
            {history.map((h, i) => (
              <li key={`${h.key}-${h.updatedAt}-${i}`}>
                <div className="grow">
                  <b>
                    {MODULES[h.key].label}: {h.enabled ? 'maintenance on' : 'open again'}
                  </b>
                  <small>
                    {when(h.updatedAt)}
                    {h.startAt || h.endAt ? ` · window ${h.startAt ? when(h.startAt) : 'now'} to ${h.endAt ? when(h.endAt) : 'off'}` : ''}
                    {h.message ? ` · "${h.message}"` : ''}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashShell>
  );
}

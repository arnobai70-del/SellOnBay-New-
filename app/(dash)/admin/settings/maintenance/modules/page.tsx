import type { Metadata } from 'next';
import Link from 'next/link';
import { DashShell } from '@/components/DashShell';
import { MaintenanceForm } from '@/components/MaintenanceForm';
import { MAINTENANCE_LIMITS, MODULES } from '@/lib/maintenance/config';
import { maintenanceHistory, moduleStates } from '@/lib/maintenance/service';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const metadata: Metadata = { title: 'Maintenance Manager', robots: { index: false } };
export const dynamic = 'force-dynamic';

const when = (ms: number | null) => (ms ? new Date(ms).toUTCString().replace(/:\d\d GMT$/, ' UTC') : '');

/* Admin → System → Maintenance Manager: close one part of the site while the rest keeps working. Never closed itself. */
export default async function MaintenanceManager() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/settings/maintenance/modules', roles: ['admin'], scope: 'super' });
  const now = Date.now();
  const [{ modules, source }, history] = await Promise.all([moduleStates(now), maintenanceHistory(30)]);
  const closed = modules.filter((m) => m.active);
  const planned = modules.filter((m) => m.enabled && !m.active && m.startAt !== null && m.startAt > now);
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-maintenance" title={tx('Maintenance Manager')}>
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>{closed.length ? `In maintenance now: ${closed.map((m) => MODULES[m.key].label).join(', ')}` : tx('Every part of the site is open')}</h2>
            <p className="tag">
              <T
                s={
                  'Close one part while you update it; everything else keeps working. Visitors see a short notice, apps get a “try again later” answer. Payment webhooks, scheduled jobs, sign-in, the audit log and this page never close. As an admin you can still open a closed part to test it (not the admin dashboard). Every change goes into the'
                }
              />{' '}
              <Link href="/admin/security/audit">
                <T s={'audit log'} />
              </Link>
              .{planned.length > 0 && ` Planned: ${planned.map((m) => `${MODULES[m.key].label} from ${when(m.startAt)}`).join('; ')}.`}
            </p>
            {source === 'memory' && (
              <p className="sob-err">
                <T s={'Saved in this server’s memory only: the database table is not there yet (run migration 0049), so a restart forgets these settings.'} />
              </p>
            )}
          </div>
        </div>
        <div className="sob-seo-pages">
          {modules.map((m) => (
            <div className="sob-item" key={m.key} id={`module-${m.key}`}>
              <div className="sob-seo-row">
                <div>
                  <h3>{MODULES[m.key].label}</h3>
                  <small className="muted">
                    <T s={'Still works while closed: {keeps}'} v={{ keeps: MODULES[m.key].keeps }} />
                  </small>
                </div>
                <span className={m.active ? 'status st-bad' : m.enabled ? 'status st-wait' : 'status st-ok'}>
                  <i />
                  {m.active ? tx('In maintenance') : m.enabled ? tx('Planned') : tx('Open')}
                </span>
              </div>
              {(m.startAt || m.endAt) && (
                <small className="muted">
                  {m.startAt ? `From ${when(m.startAt)}` : tx('From now')}
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

      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'History'} />
            </h2>
            <p className="tag">
              <T s={'The last {v0} changes, newest first. Kept by the database; nobody can edit them.'} v={{ v0: history.length || '' }} />
            </p>
          </div>
        </div>
        {history.length === 0 ? (
          <p className="muted">
            <T s={'No changes yet.'} />
          </p>
        ) : (
          <ul className="sob-list">
            {history.map((h, i) => (
              <li key={`${h.key}-${h.updatedAt}-${i}`}>
                <div className="sob-grow">
                  <b>
                    {MODULES[h.key].label}: {h.enabled ? tx('maintenance on') : tx('open again')}
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

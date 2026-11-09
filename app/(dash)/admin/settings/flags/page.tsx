import type { Metadata } from 'next';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { flagStates } from '@/lib/featureFlags';
import { flagDef } from '@/lib/featureFlagRegistry';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Feature flags', robots: { index: false } };
export const dynamic = 'force-dynamic';

const why = { name: 'reason', label: 'Why (goes in the audit log)', kind: 'textarea' as const, required: true };

/* Optional features a Super Admin may switch on or off. Payment checks, release approval, file scanning, storage, permissions and the audit log have no switch here. */
export default async function Flags() {
  const viewer = await requireViewer({ path: '/admin/settings/flags', roles: ['admin'], scope: 'super' });
  const flags = await flagStates();
  const areas = [...new Set(flags.map((f) => f.area))];
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-flags" title="Feature flags">
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>Optional features</h2>
            <p className="tag">
              Turn optional features on or off without a new release. Payment checks, release approval, file scanning, private storage, permissions and the audit log are always on and have no switch.
            </p>
          </div>
        </div>
      </div>
      {areas.map((area) => (
        <div className="glass card sob-sec" key={area}>
          <div className="row sob-hd">
            <div>
              <h2>{area}</h2>
            </div>
          </div>
          {flags
            .filter((f) => f.area === area)
            .map((f) => {
              const locked = flagDef(f.key).locked;
              return (
                <div className="sob-item" key={f.key} data-flag={f.key}>
                  <b>
                    {f.label}{' '}
                    <span className={f.on ? 'status st-ok' : 'status'}>
                      <i />
                      {f.on ? 'On' : 'Off'}
                    </span>
                  </b>
                  {locked && !f.on && <p className="muted">Cannot be turned on yet. {locked}</p>}
                  {f.reason && (
                    <p className="muted">
                      Last change: {f.reason}
                      {f.changedAt ? ` (${new Date(f.changedAt).toUTCString()})` : ''}
                    </p>
                  )}
                  {!(locked && !f.on) && (
                    <AdminForm
                      endpoint="/api/admin/flags"
                      fixed={{ key: f.key, on: !f.on }}
                      fields={[why]}
                      submit={f.on ? 'Turn off' : 'Turn on'}
                      openLabel={f.on ? 'Turn off' : 'Turn on'}
                      tone="line"
                    />
                  )}
                </div>
              );
            })}
        </div>
      ))}
    </DashShell>
  );
}

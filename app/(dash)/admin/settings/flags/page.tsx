import type { Metadata } from 'next';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { flagStates } from '@/lib/featureFlags';
import { flagDef } from '@/lib/featureFlagRegistry';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const metadata: Metadata = { title: 'Feature flags', robots: { index: false } };
export const dynamic = 'force-dynamic';

const why = { name: 'reason', label: 'Why (goes in the audit log)', kind: 'textarea' as const, required: true };

/* Optional features a Super Admin may switch on or off. Payment checks, release approval, file scanning, storage, permissions and the audit log have no switch here. */
export default async function Flags() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/settings/flags', roles: ['admin'], scope: 'super' });
  const flags = await flagStates();
  const areas = [...new Set(flags.map((f) => f.area))];
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-flags" title={tx('Feature flags')}>
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Optional features'} />
            </h2>
            <p className="tag">
              <T
                s={
                  'Turn optional features on or off without a new release. Payment checks, release approval, file scanning, private storage, permissions and the audit log are always on and have no switch.'
                }
              />
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
                      {f.on ? tx('On') : tx('Off')}
                    </span>
                  </b>
                  {locked && !f.on && (
                    <p className="muted">
                      <T s={'Cannot be turned on yet. {locked}'} v={{ locked }} />
                    </p>
                  )}
                  {f.reason && (
                    <p className="muted">
                      <T s={'Last change: {reason}{v1}'} v={{ reason: f.reason, v1: f.changedAt ? ` (${new Date(f.changedAt).toUTCString()})` : '' }} />
                    </p>
                  )}
                  {!(locked && !f.on) && (
                    <AdminForm
                      endpoint="/api/admin/flags"
                      fixed={{ key: f.key, on: !f.on }}
                      fields={[why]}
                      submit={f.on ? tx('Turn off') : tx('Turn on')}
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

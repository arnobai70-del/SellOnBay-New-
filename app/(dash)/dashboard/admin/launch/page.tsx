import type { Metadata } from 'next';
import { DashShell } from '@/components/DashShell';
import { launchChecks } from '@/lib/launchCheck';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Launch check', robots: { index: false } };
export const dynamic = 'force-dynamic';

const CHIP = { ok: ['Done', 'chip mint'], todo: ['To do', 'chip rose'], warn: ['Known gap', 'chip amber'] } as const;

/* What the live server still needs, read from its own settings. Keys are never shown, only whether they are set. */
export default async function LaunchCheck() {
  const viewer = await requireViewer({ path: '/dashboard/admin/launch', roles: ['admin'] });
  const checks = await launchChecks();
  const todo = checks.filter((c) => c.state === 'todo').length;
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-launch" title="Launch check">
      <div className="dp" data-launch>
        <div className="hd">
          <div>
            <h2>{todo ? `${todo} thing${todo === 1 ? '' : 's'} to do before real buyers come` : 'Ready, apart from the known gaps'}</h2>
            <p className="sub">Read from this server. Change a key in the hosting settings, then restart, and this page updates.</p>
          </div>
        </div>
        <ul className="lst">
          {checks.map((c) => (
            <li key={c.name}>
              <div className="grow">
                <b>{c.name}</b>
                <small>{c.note}</small>
              </div>
              <span className={CHIP[c.state][1]}>
                <i />
                {CHIP[c.state][0]}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </DashShell>
  );
}

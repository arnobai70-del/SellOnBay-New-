import type { Metadata } from 'next';
import { DashShell } from '@/components/DashShell';
import { launchChecks } from '@/lib/launchCheck';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
import type { Tx } from '@/lib/i18n/tx';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Launch check'), robots: { index: false } });
export const dynamic = 'force-dynamic';

const CHIP = (tx: Tx) => ({ ok: ['Done', 'status st-ok'], todo: [tx('To do'), 'status st-bad'], warn: [tx('Known gap'), 'status st-wait'] }) as const;

/* What the live server still needs, read from its own settings. Keys are never shown, only whether they are set. */
export default async function LaunchCheck() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/settings/launch', roles: ['admin'], scope: 'super' });
  const checks = await launchChecks();
  const todo = checks.filter((c) => c.state === 'todo').length;
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-launch" title={tx('Launch check')}>
      <div className="glass card sob-sec" data-launch>
        <div className="row sob-hd">
          <div>
            <h2>{todo ? `${todo} thing${todo === 1 ? '' : 's'} to do before real buyers come` : tx('Ready, apart from the known gaps')}</h2>
            <p className="tag">
              <T s={'Read from this server. Change a key in the hosting settings, then restart, and this page updates.'} />
            </p>
          </div>
        </div>
        <ul className="sob-list">
          {checks.map((c) => (
            <li key={c.name}>
              <div className="sob-grow">
                <b>{c.name}</b>
                <small>{c.note}</small>
              </div>
              <span className={CHIP(tx)[c.state][1]}>
                <i />
                {CHIP(tx)[c.state][0]}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </DashShell>
  );
}

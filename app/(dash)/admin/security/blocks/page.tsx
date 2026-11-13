import type { Metadata } from 'next';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { CONFIG } from '@/lib/config';
import { activeBlocks, clusters, recentLimitHits } from '@/lib/guard';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Security'), robots: { index: false } });
export const dynamic = 'force-dynamic';

const when = (t: number) => new Date(t).toISOString().slice(0, 16).replace('T', ' ');
const reasonField = [{ name: 'reason', label: 'Why (goes in the audit log)', kind: 'textarea' as const, required: true }];

export default async function Security() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/security/blocks', roles: ['admin'], scope: 'super' });
  const [groups, hits, blocks] = await Promise.all([clusters(), recentLimitHits(), activeBlocks()]);
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-security" title={tx('Security')}>
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Shared connections and devices'} />
            </h2>
            <p className="tag">
              <T
                s={
                  'Several accounts that used the same connection or device in the last {hours} hours. Offices and families share connections, so look before you block. Only a hash is stored, never the address.'
                }
                v={{ hours: CONFIG.limits.cluster.hours }}
              />
            </p>
          </div>
        </div>
        {groups.length === 0 && (
          <p className="muted">
            <T s={'Nothing shared right now.'} />
          </p>
        )}
        {groups.map((g) => (
          <div className="sob-item" key={g.kind + g.key}>
            <b>
              {g.kind === 'ip' ? tx('Connection') : tx('Device')} {g.key.slice(0, 8)}
            </b>{' '}
            <small className="muted">
              <T s={'{length} accounts, last seen {v1} UTC'} v={{ length: g.accounts.length, v1: when(g.last) }} />
            </small>
            <p>{g.accounts.map((a) => a.name).join(', ')}</p>
            {g.blocked ? (
              <span className="status st-bad">
                <i />
                <T s={'Blocked'} />
              </span>
            ) : (
              <AdminForm
                endpoint="/api/admin/security/block"
                fixed={{ kind: g.kind, key: g.key }}
                fields={reasonField}
                submit="Block it"
                openLabel={g.kind === 'ip' ? 'Block connection' : 'Block device'}
                tone="dark"
              />
            )}
          </div>
        ))}
      </div>

      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Refused by a limit (last 24 hours)'} />
            </h2>
            <p className="tag">
              <T s={'Connections that hit a rate limit or tried while blocked.'} />
            </p>
          </div>
        </div>
        {hits.length === 0 && (
          <p className="muted">
            <T s={'No one hit a limit.'} />
          </p>
        )}
        {hits.map((h) => (
          <div className="sob-item" key={h.ipHash}>
            <b>
              <T s={'Connection {v0}'} v={{ v0: h.ipHash.slice(0, 8) }} />
            </b>{' '}
            <small className="muted">
              <T s={'{total} refused, last {v1} UTC'} v={{ total: h.total, v1: when(h.last) }} />
            </small>
            <p>
              {Object.entries(h.actions)
                .map(([a, n]) => `${a} ${n}`)
                .join(', ')}
            </p>
            {h.blocked ? (
              <span className="status st-bad">
                <i />
                <T s={'Blocked'} />
              </span>
            ) : (
              <AdminForm endpoint="/api/admin/security/block" fixed={{ kind: 'ip', key: h.ipHash }} fields={reasonField} submit="Block it" openLabel="Block connection" tone="dark" />
            )}
          </div>
        ))}
      </div>

      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Block an email address'} />
            </h2>
            <p className="tag">
              <T s={'Stops that mailbox from signing up or signing in again (a +tag, capital letters and, for Gmail, dots do not get around it). Only a hash of the address is stored.'} />
            </p>
          </div>
        </div>
        <AdminForm
          endpoint="/api/admin/security/block"
          fixed={{ kind: 'email' }}
          fields={[{ name: 'email', label: tx('Email address'), kind: 'text', required: true }, ...reasonField]}
          submit="Block it"
          openLabel="Block an email"
          tone="dark"
        />
      </div>

      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Active blocks'} />
            </h2>
            <p className="tag">
              <T s={'A blocked connection, device or email cannot sign up, sign in, order, list, hire or open a dispute. Banning one account is on the Accounts page.'} />
            </p>
          </div>
        </div>
        {blocks.length === 0 && (
          <p className="muted">
            <T s={'Nothing is blocked.'} />
          </p>
        )}
        {blocks.map((b) => (
          <div className="sob-item" key={b.id}>
            <b>
              {b.kind === 'ip' ? tx('Connection') : b.kind === 'email' ? tx('Email') : tx('Device')} {b.key.slice(0, 8)}
            </b>{' '}
            <small className="muted">
              <T s={'since {v0} UTC'} v={{ v0: when(b.createdAt) }} />
            </small>
            <p>{b.reason}</p>
            <AdminForm
              endpoint={`/api/admin/security/blocks/${b.id}/lift`}
              fields={[{ name: 'note', label: tx('Why (goes in the audit log)'), kind: 'textarea', required: true }]}
              submit="Lift it"
              openLabel="Lift the block"
              tone="line"
            />
          </div>
        ))}
      </div>
    </DashShell>
  );
}

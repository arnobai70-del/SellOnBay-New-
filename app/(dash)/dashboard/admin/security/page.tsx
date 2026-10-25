import type { Metadata } from 'next';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { CONFIG } from '@/lib/config';
import { activeBlocks, clusters, recentLimitHits } from '@/lib/guard';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Security', robots: { index: false } };
export const dynamic = 'force-dynamic';

const when = (t: number) => new Date(t).toISOString().slice(0, 16).replace('T', ' ');
const reasonField = [{ name: 'reason', label: 'Why (goes in the audit log)', kind: 'textarea' as const, required: true }];

export default async function Security() {
  const viewer = await requireViewer({ path: '/dashboard/admin/security', roles: ['admin'] });
  const [groups, hits, blocks] = await Promise.all([clusters(), recentLimitHits(), activeBlocks()]);
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-security" title="Security">
      <div className="dp">
        <div className="hd">
          <div>
            <h2>Shared connections and devices</h2>
            <p className="sub">
              Several accounts that used the same connection or device in the last {CONFIG.limits.cluster.hours} hours. Offices and families share connections, so look before you block. Only a hash is
              stored, never the address.
            </p>
          </div>
        </div>
        {groups.length === 0 && <p className="muted">Nothing shared right now.</p>}
        {groups.map((g) => (
          <div className="adm-card" key={g.kind + g.key}>
            <b>
              {g.kind === 'ip' ? 'Connection' : 'Device'} {g.key.slice(0, 8)}
            </b>{' '}
            <small className="muted">
              {g.accounts.length} accounts, last seen {when(g.last)} UTC
            </small>
            <p>{g.accounts.map((a) => a.name).join(', ')}</p>
            {g.blocked ? (
              <span className="chip rose">
                <i />
                Blocked
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

      <div className="dp">
        <div className="hd">
          <div>
            <h2>Refused by a limit (last 24 hours)</h2>
            <p className="sub">Connections that hit a rate limit or tried while blocked.</p>
          </div>
        </div>
        {hits.length === 0 && <p className="muted">No one hit a limit.</p>}
        {hits.map((h) => (
          <div className="adm-card" key={h.ipHash}>
            <b>Connection {h.ipHash.slice(0, 8)}</b>{' '}
            <small className="muted">
              {h.total} refused, last {when(h.last)} UTC
            </small>
            <p>
              {Object.entries(h.actions)
                .map(([a, n]) => `${a} ${n}`)
                .join(', ')}
            </p>
            {h.blocked ? (
              <span className="chip rose">
                <i />
                Blocked
              </span>
            ) : (
              <AdminForm endpoint="/api/admin/security/block" fixed={{ kind: 'ip', key: h.ipHash }} fields={reasonField} submit="Block it" openLabel="Block connection" tone="dark" />
            )}
          </div>
        ))}
      </div>

      <div className="dp">
        <div className="hd">
          <div>
            <h2>Block an email address</h2>
            <p className="sub">Stops that mailbox from signing up or signing in again (a +tag, capital letters and, for Gmail, dots do not get around it). Only a hash of the address is stored.</p>
          </div>
        </div>
        <AdminForm
          endpoint="/api/admin/security/block"
          fixed={{ kind: 'email' }}
          fields={[{ name: 'email', label: 'Email address', kind: 'text', required: true }, ...reasonField]}
          submit="Block it"
          openLabel="Block an email"
          tone="dark"
        />
      </div>

      <div className="dp">
        <div className="hd">
          <div>
            <h2>Active blocks</h2>
            <p className="sub">A blocked connection, device or email cannot sign up, sign in, order, list, hire or open a dispute. Banning one account is on the Accounts page.</p>
          </div>
        </div>
        {blocks.length === 0 && <p className="muted">Nothing is blocked.</p>}
        {blocks.map((b) => (
          <div className="adm-card" key={b.id}>
            <b>
              {b.kind === 'ip' ? 'Connection' : b.kind === 'email' ? 'Email' : 'Device'} {b.key.slice(0, 8)}
            </b>{' '}
            <small className="muted">since {when(b.createdAt)} UTC</small>
            <p>{b.reason}</p>
            <AdminForm
              endpoint={`/api/admin/security/blocks/${b.id}/lift`}
              fields={[{ name: 'note', label: 'Why (goes in the audit log)', kind: 'textarea', required: true }]}
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

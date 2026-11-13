import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminForm } from '@/components/AdminForm';
import { AdminShell } from '@/components/glass/AdminShell';
import { auditList } from '@/lib/admin/audit';
import { DAY_MS } from '@/lib/config';
import { actionText } from '@/lib/glass/adminOverview';
import { profileNames } from '@/lib/glass/admin';
import { activeBlocks, clusters, recentLimitHits } from '@/lib/guard';
import { blockedList } from '@/lib/presale/service';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Security and logs'), robots: { index: false } });
export const dynamic = 'force-dynamic';

const TABS = [
  ['events', 'Events'],
  ['sessions', 'Sessions'],
  ['protection', 'Protection'],
  ['log', 'Activity log'],
] as const;
const when = (t: number) => new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
const REASON: Record<string, string> = { email: 'email address', phone: 'phone number', contact_channel: 'other contact channel', link: 'link', outside_payment: 'outside payment' };
const reasonField = [{ name: 'reason', label: 'Why (goes in the audit log)', kind: 'textarea' as const, required: true }];

/*
 * design-reference/admin-security.html (Super Admin). Addresses are never stored: only a keyed hash, shortened here (lib/guard.ts). Events are
 * the connections that hit a limit; blocking posts to /api/admin/security/block, lifting to /api/admin/security/blocks/[id]/lift. The activity
 * log is the append-only audit log.
 */
export default async function AdminSecurity({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/security', roles: ['admin'], scope: 'super' });
  const { tab: raw } = await searchParams;
  const tab = TABS.find(([k]) => k === raw)?.[0] ?? 'events';
  const now = Date.now();
  const [hits, groups, blocks, log, blocked] = await Promise.all([recentLimitHits(), clusters(), activeBlocks(), auditList(200), blockedList(30)]);
  const names = await profileNames(log.map((a) => a.adminId));
  const today = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
  const logins = hits.reduce((s, h) => s + (h.actions.login ?? h.actions.signin ?? 0), 0);
  return (
    <AdminShell viewer={viewer} active="security" file="admin-security" title={tx('Security & logs')} head={false}>
      <div className="row">
        <div>
          <h1>
            <T s={'Security & logs'} />
          </h1>
          <div className="tag">
            <T s={'Security events, staff sessions, protection and a full activity log. Addresses are kept only as a keyed hash.'} />
          </div>
        </div>
        <div className="seg" role="tablist" aria-label={tx('Security section')}>
          {TABS.map(([k, l]) => (
            <Link key={k} role="tab" className={k === tab ? 'on' : ''} aria-selected={k === tab} href={k === 'events' ? '/admin/security' : `/admin/security?tab=${k}`} prefetch={false}>
              {l}
            </Link>
          ))}
        </div>
      </div>
      <div className="kpis">
        <div className="glass kpi">
          <div className="l">
            <T s={'Connections at a limit (24h)'} />
          </div>
          <div className="v">{hits.length}</div>
          <div className="s">
            {hits.filter((h) => h.blocked).length} <T s={'blocked'} />
          </div>
        </div>
        <div className="glass kpi">
          <div className="l">
            <T s={'Refused sign-ins (24h)'} />
          </div>
          <div className="v">{logins}</div>
          <div className="s">
            <T s={'{length} active blocks'} v={{ length: blocks.length }} />
          </div>
        </div>
        <div className="glass kpi">
          <div className="l">
            <T s={'Shared devices or connections'} />
          </div>
          <div className="v">{groups.length}</div>
          <div className="s">
            <T s={'Look before you block'} />
          </div>
        </div>
        <div className="glass kpi">
          <div className="l">
            <T s={'Actions logged today'} />
          </div>
          <div className="v">{log.filter((a) => a.at >= today).length}</div>
          <div className="s">
            <T s={'Append-only audit log'} />
          </div>
        </div>
      </div>

      {tab === 'events' && (
        <section className="glass" style={{ padding: '8px 8px 4px' }}>
          <div className="row" style={{ padding: '14px 14px 8px', gap: 10 }}>
            <h2>
              <T s={'Security events'} />
            </h2>
            <Link className="btn sm ghost" href="/admin/security/risk" prefetch={false}>
              <T s={'Risk and the emergency switch'} />
            </Link>
          </div>
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>
                    <T s={'Time'} />
                  </th>
                  <th>
                    <T s={'Severity'} />
                  </th>
                  <th>
                    <T s={'Event'} />
                  </th>
                  <th>
                    <T s={'User'} />
                  </th>
                  <th>
                    <T s={'Connection'} />
                  </th>
                  <th>
                    <T s={'Status'} />
                  </th>
                  <th>
                    <span className="hidden-label">
                      <T s={'Actions'} />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {hits.length ? (
                  hits.slice(0, 50).map((h) => (
                    <tr key={h.ipHash}>
                      <td style={{ whiteSpace: 'nowrap' }}>{when(h.last)}</td>
                      <td>
                        <span className={`status ${h.total >= 20 ? 'st-bad' : h.total >= 5 ? 'st-wait' : 'st-info'}`}>{h.total >= 20 ? tx('High') : h.total >= 5 ? tx('Medium') : tx('Low')}</span>
                      </td>
                      <td style={{ fontWeight: 500 }}>
                        {Object.entries(h.actions)
                          .map(([k, n]) => `${n} × ${k.replace(/_/g, ' ')}`)
                          .join(', ')}{' '}
                        <T s={'refused'} />
                      </td>
                      <td>—</td>
                      <td className="muted">{h.ipHash.slice(0, 10)}…</td>
                      <td>
                        <span className={`status ${h.blocked ? 'st-bad' : 'st-wait'}`}>{h.blocked ? tx('Blocked') : tx('Open')}</span>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {!h.blocked && <AdminForm endpoint="/api/admin/security/block" fixed={{ kind: 'ip', key: h.ipHash }} fields={reasonField} submit="Block it" openLabel="Block" tone="line" />}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="muted">
                      <T s={'No connection hit a limit in the last 24 hours.'} />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'sessions' && (
        <section className="glass card">
          <h2>
            <T s={'Staff sessions'} />
          </h2>
          <div className="li" style={{ fontSize: 14 }}>
            <span style={{ flex: 1 }}>
              <T s={'Every admin page asks for the authenticator code (aal2), checked on the server.'} />
            </span>
            <span className="status st-ok">
              <T s={'On'} />
            </span>
          </div>
          <div className="li" style={{ fontSize: 14 }}>
            <span style={{ flex: 1 }}>
              <T s={'A list of open sessions per admin is not kept by the app yet. Sign-ins are in the activity log.'} />
            </span>
            <Link className="btn sm ghost" href="/admin/security?tab=log" prefetch={false}>
              <T s={'Activity log'} />
            </Link>
          </div>
        </section>
      )}

      {tab === 'protection' && (
        <>
          <section className="glass card">
            <div className="row" style={{ marginBottom: 6 }}>
              <h2>
                <T s={'Active blocks ({length})'} v={{ length: blocks.length }} />
              </h2>
              <Link className="btn sm ghost" href="/admin/security/blocks" prefetch={false}>
                <T s={'Block a connection, device or email'} />
              </Link>
            </div>
            {blocks.length ? (
              blocks.map((b) => (
                <div key={b.id} className="li" style={{ fontSize: 14 }}>
                  <span className="status st-bad">{b.kind}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {b.key.slice(0, 12)}… · {b.reason} <span className="muted">· {when(b.createdAt)}</span>
                  </span>
                  <AdminForm endpoint={`/api/admin/security/blocks/${b.id}/lift`} fields={reasonField} submit="Lift it" openLabel="Lift" tone="line" />
                </div>
              ))
            ) : (
              <p className="muted" style={{ margin: '8px 0 0', fontSize: 14 }}>
                <T s={'Nothing is blocked.'} />
              </p>
            )}
          </section>
          <section className="glass card">
            <h2>
              <T s={'Shared devices or connections ({length})'} v={{ length: groups.length }} />
            </h2>
            {groups.length ? (
              groups.slice(0, 30).map((g) => (
                <div key={g.kind + g.key} className="li" style={{ fontSize: 14 }}>
                  <span className="status st-wait">{g.kind}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {g.accounts.map((a) => a.name).join(', ')} <span className="muted">· {when(g.last)}</span>
                  </span>
                  {g.blocked ? (
                    <span className="status st-bad">
                      <T s={'Blocked'} />
                    </span>
                  ) : (
                    <AdminForm
                      endpoint="/api/admin/security/block"
                      fixed={{ kind: g.kind, key: g.key }}
                      fields={reasonField}
                      submit="Block it"
                      openLabel={g.kind === 'ip' ? 'Block connection' : 'Block device'}
                      tone="line"
                    />
                  )}
                </div>
              ))
            ) : (
              <p className="muted" style={{ margin: '8px 0 0', fontSize: 14 }}>
                <T s={'No accounts share a device or connection.'} />
              </p>
            )}
          </section>
          <section className="glass card">
            <div className="row" style={{ marginBottom: 6 }}>
              <h2>
                <T s={'Blocked messages'} />
              </h2>
              <span className="tag" style={{ margin: 0 }}>
                <T s={'Three in 30 days warn the person, five suspend the account'} />
              </span>
            </div>
            {blocked.length ? (
              blocked.map((m) => (
                <div key={m.id} className="li" style={{ fontSize: 14, alignItems: 'flex-start' }}>
                  <span className="status st-bad">
                    <T s={'Blocked'} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontWeight: 500 }}>
                      {m.sender_name || 'User ' + String(m.sender_id).slice(0, 8)} · {REASON[m.reason] ?? m.reason}
                    </b>
                    <span className="tag" style={{ display: 'block' }}>
                      {m.context === 'presale' ? tx('Pre-sale question') : m.context === 'presale_reply' ? tx('Seller reply') : tx('Order chat')}
                      {m.product_key ? ` on ${m.product_key}` : ''}: “{(m.body ?? '').slice(0, 140)}”
                    </span>
                  </span>
                </div>
              ))
            ) : (
              <p className="muted" style={{ margin: '8px 0 0', fontSize: 14 }}>
                <T s={'No blocked messages yet.'} />
              </p>
            )}
          </section>
        </>
      )}

      {tab === 'log' && (
        <section className="glass" style={{ padding: '8px 8px 4px' }}>
          <div className="row" style={{ padding: '14px 14px 8px' }}>
            <h2>
              <T s={'Activity log'} />
            </h2>
            <Link className="btn sm ghost" href="/admin/security/audit" prefetch={false}>
              <T s={'Full log with filters'} />
            </Link>
          </div>
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>
                    <T s={'Time'} />
                  </th>
                  <th>
                    <T s={'Who'} />
                  </th>
                  <th>
                    <T s={'Action'} />
                  </th>
                  <th>
                    <T s={'On'} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {log.length ? (
                  log.slice(0, 100).map((a) => (
                    <tr key={a.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{when(a.at)}</td>
                      <td>{a.adminId ? (names.get(a.adminId) ?? tx('Admin')) : tx('System')}</td>
                      <td style={{ fontWeight: 500 }}>{actionText(a.action)}</td>
                      <td className="muted">
                        {a.targetType} {a.targetRef.slice(0, 24)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="muted">
                      <T s={'Nothing logged yet.'} />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {tab === 'events' && log.filter((a) => a.at >= now - DAY_MS).length > 0 && (
        <section className="glass card">
          <div className="row" style={{ marginBottom: 6 }}>
            <h2>
              <T s={'Last 24 hours in the log'} />
            </h2>
            <Link className="tag" style={{ margin: 0 }} href="/admin/security?tab=log" prefetch={false}>
              <T s={'Activity log'} />
            </Link>
          </div>
          {log
            .filter((a) => a.at >= now - DAY_MS)
            .slice(0, 8)
            .map((a) => (
              <div key={a.id} className="li" style={{ fontSize: 14 }}>
                <span style={{ flex: 1 }}>
                  {a.adminId ? (names.get(a.adminId) ?? tx('Admin')) : tx('System')}: {actionText(a.action)}
                </span>
                <span className="tag" style={{ margin: 0 }}>
                  {when(a.at)}
                </span>
              </div>
            ))}
        </section>
      )}
    </AdminShell>
  );
}

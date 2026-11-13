'use client';
import { useEffect, useState } from 'react';
import type { SystemSnapshot, Tone } from '@/lib/admin/system';

import { useTx } from '@/components/i18n/TxProvider';
import { T } from '@/components/i18n/T';
import type { Tx } from '@/lib/i18n/tx';
const TONE_LABEL = (tx: Tx): Record<Tone, string> => ({ ok: 'Healthy', warn: tx('Needs a look'), bad: tx('Needs attention'), off: tx('Not set up') });
const OVERALL = (tx: Tx): Record<Tone, string> => ({ ok: tx('Server healthy'), warn: tx('Needs a look'), bad: tx('Needs attention'), off: tx('Server healthy') });
const when = (t: number | null) => (t ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'never');
const ago = (t: number | null, now: number) => {
  if (!t) return 'never';
  const m = Math.round((now - t) / 60_000);
  return m < 1 ? 'just now' : m < 120 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
const span = (s: number) => (s < 3600 ? `${Math.round(s / 60)} min` : s < 172_800 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86_400)} days`);
/* amber from 70%, pink from 85% */
const meterTone = (pct: number): Tone => (pct >= 85 ? 'bad' : pct >= 70 ? 'warn' : 'ok');

/*
 * The "Server and system" page, read only. It starts from what the server read for the page, then asks /api/admin/system again every
 * 30 seconds while the tab is open, and right away when the tab is shown again. There are no buttons that change anything.
 */
export function SystemLive({ initial }: { initial: SystemSnapshot }) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const [s, setS] = useState(initial);
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const load = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch('/api/admin/system', { cache: 'no-store' });
        if (!r.ok) return setStale(true);
        setS(await r.json());
        setStale(false);
      } catch {
        setStale(true);
      }
    };
    const t = setInterval(load, 30_000);
    const shown = () => !document.hidden && void load();
    document.addEventListener('visibilitychange', shown);
    return () => (clearInterval(t), document.removeEventListener('visibilitychange', shown));
  }, []);

  const conns = s.database.connections !== null && s.database.maxConnections ? Math.round((s.database.connections / s.database.maxConnections) * 100) : null;
  const peak = Math.max(1, ...(s.errors?.counts.byHour ?? [0]));
  return (
    <>
      <div className="glass card sob-sec sob-sys-head">
        <span className={`sob-sys-chip ${s.overall}`}>
          <i />
          {OVERALL(tx)[s.overall]}
        </span>
        <small role="status">
          <T s={'Updated {v0} UTC{v1} · refreshes every 30 seconds'} v={{ v0: new Date(s.at).toISOString().slice(11, 19), v1: stale ? ' · could not refresh, showing the last reading' : '' }} />
        </small>
      </div>

      <div className="sob-sys-grid" aria-label={tx('Services')}>
        {s.services.map((v) => (
          <div key={v.key} className={`sob-sys-tile ${v.tone}`}>
            <span className="sob-sys-tile-h">
              <i className={`dot ${v.tone}`} aria-hidden="true" />
              {v.label}
            </span>
            <b>{TONE_LABEL(tx)[v.tone]}</b>
            <small>{v.text}</small>
          </div>
        ))}
      </div>

      <div className="sob-sys-two">
        <div className="glass card sob-sec">
          <h2>
            <T s={'This app'} />
          </h2>
          <p className="tag">
            <T s={"The site's own process. Shared hosting does not show the host's CPU, load or disk, so they are not listed."} />
          </p>
          <dl className="sob-sys-dl">
            <dt>
              <T s={'Memory in use'} />
            </dt>
            <dd>
              <T s={'{rssMb} MB'} v={{ rssMb: s.app.rssMb }} />
            </dd>
            <dt>
              <T s={'JavaScript heap'} />
            </dt>
            <dd>
              <T s={'{heapMb} MB'} v={{ heapMb: s.app.heapMb }} />
            </dd>
            <dt>
              <T s={'Running for'} />
            </dt>
            <dd>{span(s.app.uptimeS)}</dd>
            <dt>
              <T s={'Node.js'} />
            </dt>
            <dd>{s.app.node}</dd>
            <dt>
              <T s={'Build'} />
            </dt>
            <dd>{s.build.commit ? <code title={s.build.commit}>{s.build.commit.slice(0, 7)}</code> : tx('Not recorded')}</dd>
            <dt>
              <T s={'Built at'} />
            </dt>
            <dd>{s.build.builtAt ? when(Date.parse(s.build.builtAt)) : tx('Not recorded')}</dd>
          </dl>
        </div>
        <div className="glass card sob-sec">
          <h2>
            <T s={'Database'} />
          </h2>
          <dl className="sob-sys-dl">
            <dt>
              <T s={'Answers in'} />
            </dt>
            <dd>{s.database.latencyMs === null ? tx('Not answering') : `${s.database.latencyMs} ms`}</dd>
            <dt>
              <T s={'Size'} />
            </dt>
            <dd>{s.database.sizeMb === null ? tx('Not recorded (migration 0073)') : `${s.database.sizeMb} MB`}</dd>
            <dt>
              <T s={'Connections'} />
            </dt>
            <dd>
              {conns === null ? (
                tx('Not recorded (migration 0073)')
              ) : (
                <span className="sob-sys-meter">
                  <span className={`bar ${meterTone(conns)}`} style={{ width: `${Math.min(100, conns)}%` }} />
                  <span>
                    <T s={'{connections} of {maxConnections} ({conns}%)'} v={{ connections: s.database.connections, maxConnections: s.database.maxConnections, conns }} />
                  </span>
                </span>
              )}
            </dd>
            <dt>
              <T s={'Advisors'} />
            </dt>
            <dd>
              {s.database.advisors === null
                ? tx('Not answering')
                : s.database.advisors === 'not connected'
                  ? tx('Not connected (set SUPABASE_ACCESS_TOKEN on the server)')
                  : `${s.database.advisors.security} security, ${s.database.advisors.performance} performance`}
            </dd>
          </dl>
        </div>
      </div>

      <div className="glass card sob-sec">
        <h2>
          <T s={'Errors'} />
        </h2>
        {!s.errors ? (
          <p className="tag">
            <T s={'Not recorded yet: apply migration 0072.'} />
          </p>
        ) : (
          <>
            <div className="sob-sys-nums">
              <span>
                <b>{s.errors.counts.lastHour}</b> <T s={'last hour'} />
              </span>
              <span>
                <b>{s.errors.counts.lastDay}</b> <T s={'last 24 hours'} />
              </span>
              <span>
                <b>{s.errors.counts.lastWeek}</b> <T s={'last 7 days'} />
              </span>
            </div>
            <div className="sob-sys-chart" role="img" aria-label={tx('Errors per hour over the last 24 hours, {lastDay} in all', { lastDay: s.errors.counts.lastDay })}>
              {s.errors.counts.byHour.map((n, i) => (
                <span key={i} style={{ height: `${Math.max(2, (n / peak) * 100)}%` }} className={n ? 'on' : ''} title={`${n} errors, ${23 - i} h ago`} />
              ))}
            </div>
            {s.errors.kinds.length > 0 && (
              <div className="tbl">
                <table className="">
                  <thead>
                    <tr>
                      <th>
                        <T s={'Where'} />
                      </th>
                      <th>
                        <T s={'Message'} />
                      </th>
                      <th>
                        <T s={'Times'} />
                      </th>
                      <th>
                        <T s={'Last seen'} />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.errors.kinds.map((k) => (
                      <tr key={k.fingerprint}>
                        <td>
                          <code>{k.route}</code>
                        </td>
                        <td>{k.message}</td>
                        <td>{k.count}</td>
                        <td>{ago(k.lastSeen, s.at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <div className="glass card sob-sec">
        <h2>
          <T s={'Scheduled jobs'} />
        </h2>
        <ul className="sob-list">
          {s.jobs.map((j) => (
            <li key={j.job}>
              <div className="sob-grow">
                <b>{j.job === 'orders' ? tx('Orders (every few minutes)') : tx('Payouts (weekly)')}</b>
                <small>
                  <T s={'Last good run {v0}'} v={{ v0: ago(j.lastGoodAt, s.at) }} />
                </small>
              </div>
              <span className={`status ${j.stale ? 'st-bad' : j.lastGoodAt ? 'st-ok' : 'st-draft'}`}>
                <i />
                {j.stale ? tx('Stopped') : j.lastGoodAt ? tx('On time') : tx('Not run yet')}
              </span>
            </li>
          ))}
        </ul>
        {s.runs === null ? (
          <p className="tag">
            <T s={'Run history is not recorded yet: apply migration 0071.'} />
          </p>
        ) : s.runs.length > 0 ? (
          <div className="tbl">
            <table className="">
              <thead>
                <tr>
                  <th>
                    <T s={'Job'} />
                  </th>
                  <th>
                    <T s={'Started'} />
                  </th>
                  <th>
                    <T s={'Took'} />
                  </th>
                  <th>
                    <T s={'Result'} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {s.runs.map((r) => (
                  <tr key={r.id}>
                    <td>{r.job}</td>
                    <td>{when(r.startedAt)}</td>
                    <td>{r.finishedAt ? `${Math.max(0, Math.round((r.finishedAt - r.startedAt) / 100) / 10)} s` : 'running'}</td>
                    <td>{r.ok === null ? 'running' : r.ok ? 'OK' : `Failed: ${r.error ?? ''}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="tag">
            <T s={'No runs recorded yet.'} />
          </p>
        )}
      </div>

      <div className="glass card sob-sec">
        <h2>
          <T s={'Domain and safety'} />
        </h2>
        <dl className="sob-sys-dl">
          <dt>
            <T s={'Certificate'} />
          </dt>
          <dd>{s.safety.sslDays === null ? tx('Not checked (no https address)') : `${s.safety.sslDays} days left`}</dd>
          <dt>
            <T s={'Required settings'} />
          </dt>
          <dd>
            <T
              s={'{keysSet} of {keysTotal} set{v2}'}
              v={{ keysSet: s.safety.keysSet, keysTotal: s.safety.keysTotal, v2: s.safety.missingKeys.length ? `. Missing: ${s.safety.missingKeys.join(', ')}` : '' }}
            />
          </dd>
          <dt>
            <T s={'Maintenance'} />
          </dt>
          <dd>{s.safety.closedModules.length ? tx('Closed now: {v0}', { v0: s.safety.closedModules.join(', ') }) : tx('Every module open')}</dd>
        </dl>
      </div>
    </>
  );
}

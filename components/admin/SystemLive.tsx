'use client';
import { useEffect, useState } from 'react';
import type { SystemSnapshot, Tone } from '@/lib/admin/system';

const TONE_LABEL: Record<Tone, string> = { ok: 'Healthy', warn: 'Needs a look', bad: 'Needs attention', off: 'Not set up' };
const OVERALL: Record<Tone, string> = { ok: 'Server healthy', warn: 'Needs a look', bad: 'Needs attention', off: 'Server healthy' };
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
      <div className="glass card sob-sec sys-head">
        <span className={`sys-chip ${s.overall}`}>
          <i />
          {OVERALL[s.overall]}
        </span>
        <small role="status">
          Updated {new Date(s.at).toISOString().slice(11, 19)} UTC{stale ? ' · could not refresh, showing the last reading' : ''} · refreshes every 30 seconds
        </small>
      </div>

      <div className="sys-grid" aria-label="Services">
        {s.services.map((v) => (
          <div key={v.key} className={`sys-tile ${v.tone}`}>
            <span className="sys-tile-h">
              <i className={`dot ${v.tone}`} aria-hidden="true" />
              {v.label}
            </span>
            <b>{TONE_LABEL[v.tone]}</b>
            <small>{v.text}</small>
          </div>
        ))}
      </div>

      <div className="sys-two">
        <div className="glass card sob-sec">
          <h2>This app</h2>
          <p className="tag">The site&apos;s own process. Shared hosting does not show the host&apos;s CPU, load or disk, so they are not listed.</p>
          <dl className="sys-dl">
            <dt>Memory in use</dt>
            <dd>{s.app.rssMb} MB</dd>
            <dt>JavaScript heap</dt>
            <dd>{s.app.heapMb} MB</dd>
            <dt>Running for</dt>
            <dd>{span(s.app.uptimeS)}</dd>
            <dt>Node.js</dt>
            <dd>{s.app.node}</dd>
            <dt>Build</dt>
            <dd>{s.build.commit ? <code title={s.build.commit}>{s.build.commit.slice(0, 7)}</code> : 'Not recorded'}</dd>
            <dt>Built at</dt>
            <dd>{s.build.builtAt ? when(Date.parse(s.build.builtAt)) : 'Not recorded'}</dd>
          </dl>
        </div>
        <div className="glass card sob-sec">
          <h2>Database</h2>
          <dl className="sys-dl">
            <dt>Answers in</dt>
            <dd>{s.database.latencyMs === null ? 'Not answering' : `${s.database.latencyMs} ms`}</dd>
            <dt>Size</dt>
            <dd>{s.database.sizeMb === null ? 'Not recorded (migration 0073)' : `${s.database.sizeMb} MB`}</dd>
            <dt>Connections</dt>
            <dd>
              {conns === null ? (
                'Not recorded (migration 0073)'
              ) : (
                <span className="sys-meter">
                  <span className={`bar ${meterTone(conns)}`} style={{ width: `${Math.min(100, conns)}%` }} />
                  <span>
                    {s.database.connections} of {s.database.maxConnections} ({conns}%)
                  </span>
                </span>
              )}
            </dd>
            <dt>Advisors</dt>
            <dd>
              {s.database.advisors === null
                ? 'Not answering'
                : s.database.advisors === 'not connected'
                  ? 'Not connected (set SUPABASE_ACCESS_TOKEN on the server)'
                  : `${s.database.advisors.security} security, ${s.database.advisors.performance} performance`}
            </dd>
          </dl>
        </div>
      </div>

      <div className="glass card sob-sec">
        <h2>Errors</h2>
        {!s.errors ? (
          <p className="tag">Not recorded yet: apply migration 0072.</p>
        ) : (
          <>
            <div className="sys-nums">
              <span>
                <b>{s.errors.counts.lastHour}</b> last hour
              </span>
              <span>
                <b>{s.errors.counts.lastDay}</b> last 24 hours
              </span>
              <span>
                <b>{s.errors.counts.lastWeek}</b> last 7 days
              </span>
            </div>
            <div className="sys-chart" role="img" aria-label={`Errors per hour over the last 24 hours, ${s.errors.counts.lastDay} in all`}>
              {s.errors.counts.byHour.map((n, i) => (
                <span key={i} style={{ height: `${Math.max(2, (n / peak) * 100)}%` }} className={n ? 'on' : ''} title={`${n} errors, ${23 - i} h ago`} />
              ))}
            </div>
            {s.errors.kinds.length > 0 && (
              <div className="tbl">
                <table className="">
                  <thead>
                    <tr>
                      <th>Where</th>
                      <th>Message</th>
                      <th>Times</th>
                      <th>Last seen</th>
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
        <h2>Scheduled jobs</h2>
        <ul className="sob-list">
          {s.jobs.map((j) => (
            <li key={j.job}>
              <div className="sob-grow">
                <b>{j.job === 'orders' ? 'Orders (every few minutes)' : 'Payouts (weekly)'}</b>
                <small>Last good run {ago(j.lastGoodAt, s.at)}</small>
              </div>
              <span className={`status ${j.stale ? 'st-bad' : j.lastGoodAt ? 'st-ok' : 'st-draft'}`}>
                <i />
                {j.stale ? 'Stopped' : j.lastGoodAt ? 'On time' : 'Not run yet'}
              </span>
            </li>
          ))}
        </ul>
        {s.runs === null ? (
          <p className="tag">Run history is not recorded yet: apply migration 0071.</p>
        ) : s.runs.length > 0 ? (
          <div className="tbl">
            <table className="">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Started</th>
                  <th>Took</th>
                  <th>Result</th>
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
          <p className="tag">No runs recorded yet.</p>
        )}
      </div>

      <div className="glass card sob-sec">
        <h2>Domain and safety</h2>
        <dl className="sys-dl">
          <dt>Certificate</dt>
          <dd>{s.safety.sslDays === null ? 'Not checked (no https address)' : `${s.safety.sslDays} days left`}</dd>
          <dt>Required settings</dt>
          <dd>
            {s.safety.keysSet} of {s.safety.keysTotal} set{s.safety.missingKeys.length ? `. Missing: ${s.safety.missingKeys.join(', ')}` : ''}
          </dd>
          <dt>Maintenance</dt>
          <dd>{s.safety.closedModules.length ? `Closed now: ${s.safety.closedModules.join(', ')}` : 'Every module open'}</dd>
        </dl>
      </div>
    </>
  );
}

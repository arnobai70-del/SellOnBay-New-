import type { Product } from '@/lib/data';
import { SHELVES, platformOf } from '@/lib/apps';

/*
 * A drawn phone with the app's own colours and content, in the style of an iPhone or an Android phone.
 * Everything is sized in container units, so the same markup works as a tiny card picture or a big preview.
 */
function Ring({ pct }: { pct: number }) {
  const r = 38,
    c = 2 * Math.PI * r;
  return (
    <svg className="ap-ring" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--ac)" strokeOpacity=".18" strokeWidth="11" />
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--ac)" strokeWidth="11" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 50 50)" />
    </svg>
  );
}

export function AppScreen({ p, screen = 0 }: { p: Product; screen?: number }) {
  const a = p.app!;
  const ios = platformOf(p) === 'ios';
  const tab = Math.min(screen, 2);
  return (
    <div className="ap-ui">
      <div className="ap-status">
        <span>9:41</span>
        <i />
      </div>
      <div className="ap-head">
        <span className="ap-icon">{a.glyph}</span>
        <b>{screen === 1 ? 'Browse' : screen === 2 ? 'Stats' : a.headline}</b>
        <span className="ap-av" />
      </div>

      {screen === 0 && (
        <>
          <div className="ap-hero">
            <div className="ap-ringbox">
              <Ring pct={a.metric.pct} />
              <b>{a.metric.value}</b>
            </div>
            <div>
              <small>{a.metric.label}</small>
              <span>On track today</span>
            </div>
          </div>
          <ul className="ap-rows">
            {a.rows.map(([l, v]) => (
              <li key={l}>
                <i />
                <span>{l}</span>
                <em>{v}</em>
              </li>
            ))}
          </ul>
        </>
      )}
      {screen === 1 && (
        <>
          <div className="ap-search">Search</div>
          <div className="ap-chips">
            <span className="on">All</span>
            <span>New</span>
            <span>Saved</span>
          </div>
          <ul className="ap-rows">
            {[...a.rows, ...a.rows.slice(0, 2)].map(([l, v], i) => (
              <li key={l + i}>
                <i />
                <span>{l}</span>
                <em>{v}</em>
              </li>
            ))}
          </ul>
        </>
      )}
      {screen === 2 && (
        <>
          <div className="ap-chart">
            {a.bars.map((h, i) => (
              <i key={i} style={{ height: h + '%' }} className={i === 5 ? 'hi' : ''} />
            ))}
          </div>
          <div className="ap-kpi">
            <small>{a.metric.label}</small>
            <b>{a.metric.value}</b>
          </div>
          <ul className="ap-rows">
            {a.rows.slice(0, 2).map(([l, v]) => (
              <li key={l}>
                <i />
                <span>{l}</span>
                <em>{v}</em>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className={'ap-cta' + (ios ? ' ios' : '')}>{a.cta}</div>
      <nav className="ap-tabs" aria-hidden="true">
        {a.tabs.map((t, i) => (
          <span key={t} className={i === tab ? 'on' : ''}>
            <i />
            {t}
          </span>
        ))}
      </nav>
      <div className={ios ? 'ap-home' : 'ap-nav'} />
    </div>
  );
}

export function AppPhone({ p, screen = 0, className = '' }: { p: Product; screen?: number; className?: string }) {
  if (!p.app) return null;
  const ios = platformOf(p) === 'ios';
  const style = { '--ac': p.app.accent, '--bg': p.app.bg, '--ink': p.app.ink } as React.CSSProperties;
  return (
    <div className={`ap ${ios ? 'ios' : 'android'} ${className}`} style={style}>
      <div className="ap-body">
        <span className={ios ? 'ap-island' : 'ap-punch'} />
        <AppScreen p={p} screen={screen} />
      </div>
    </div>
  );
}

/* A web app in a browser window, or a desktop app in an operating system window. Sidebar, header, one metric and a chart or table. */
export function AppWindow({ p, screen = 0, className = '' }: { p: Product; screen?: number; className?: string }) {
  if (!p.app) return null;
  const a = p.app;
  const desktop = platformOf(p) === 'desktop';
  const style = { '--ac': a.accent, '--bg': a.bg, '--ink': a.ink } as React.CSSProperties;
  const tab = Math.min(screen, a.tabs.length - 1);
  return (
    <div className={`aw ${desktop ? 'desktop' : 'webapp'} ${className}`} style={style}>
      <div className="aw-bar">
        <i />
        <i />
        <i />
        {desktop ? <b>{p.name}</b> : <span>app.{p.name.toLowerCase().replace(/[^a-z]/g, '')}.com</span>}
      </div>
      <div className="aw-body">
        <aside className="aw-side">
          <span className="aw-logo">{a.glyph}</span>
          {a.tabs.map((t, i) => (
            <span key={t} className={i === tab ? 'on' : ''}>
              <i />
              {t}
            </span>
          ))}
        </aside>
        <div className="aw-main">
          <div className="aw-head">
            <b>{screen === 1 ? a.tabs[1] : screen === 2 ? a.tabs[2] : a.headline}</b>
            <span className="aw-btn">{a.cta}</span>
          </div>
          {screen === 0 && (
            <>
              <div className="aw-kpis">
                <div>
                  <small>{a.metric.label}</small>
                  <b>{a.metric.value}</b>
                </div>
                <div>
                  <small>Last week</small>
                  <b>{Math.round(a.metric.pct * 100)}%</b>
                </div>
              </div>
              <div className="aw-chart">
                {a.bars.map((h, i) => (
                  <i key={i} style={{ height: h + '%' }} className={i === 5 ? 'hi' : ''} />
                ))}
              </div>
            </>
          )}
          {screen === 1 && (
            <ul className="aw-rows">
              {[...a.rows, ...a.rows.slice(0, 2)].map(([l, v], i) => (
                <li key={l + i}>
                  <i />
                  <span>{l}</span>
                  <em>{v}</em>
                </li>
              ))}
            </ul>
          )}
          {screen === 2 && (
            <div className="aw-cards">
              {a.rows.map(([l, v]) => (
                <div key={l}>
                  <small>{l}</small>
                  <b>{v}</b>
                </div>
              ))}
              <div className="aw-wide">
                <div className="aw-chart sm">
                  {a.bars.map((h, i) => (
                    <i key={i} style={{ height: h + '%' }} className={i === 3 ? 'hi' : ''} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* One entry point: a phone for the store shelves, a window for web and desktop apps. */
export function AppArt({ p, screen = 0, className = '' }: { p: Product; screen?: number; className?: string }) {
  const pl = platformOf(p);
  if (pl === 'web') return null;
  if (pl === 'digital') return <DigitalArt p={p} screen={screen} className={className} />;
  return SHELVES[pl].delivery === 'store' ? <AppPhone p={p} screen={screen} className={className} /> : <AppWindow p={p} screen={screen} className={className} />;
}

/* Digital products: a drawn "package" with the files inside, what you get, and how to start. */
export function DigitalArt({ p, screen = 0, className = '' }: { p: Product; screen?: number; className?: string }) {
  if (!p.app) return null;
  const style = { '--ac': p.app.accent, '--bg': p.app.bg, '--ink': p.app.ink } as React.CSSProperties;
  return (
    <div className={`dg ${className}`} style={style}>
      <div className="dg-top">
        <span className="dg-g">{p.app.glyph}</span>
        <div>
          <b>{p.name}</b>
          <small>
            {p.stack} · {p.cat}
          </small>
        </div>
      </div>
      <div className="dg-body">
        {screen === 0 && (
          <ul className="dg-files">
            {p.app.rows.map(([n, sz]) => (
              <li key={n}>
                <i />
                <span>{n}</span>
                <em>{sz}</em>
              </li>
            ))}
          </ul>
        )}
        {screen === 1 && (
          <ul className="dg-inc">
            {p.inc.slice(0, 5).map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        )}
        {screen === 2 && (
          <ol className="dg-steps">
            <li>Download the files</li>
            <li>Open them in {p.stack}</li>
            <li>Add your own details and keys</li>
          </ol>
        )}
      </div>
      <div className="dg-foot">
        <span className="dg-btn">{p.app.cta}</span>
        <small>
          {p.app.metric.label}: {p.app.metric.value}
        </small>
      </div>
    </div>
  );
}

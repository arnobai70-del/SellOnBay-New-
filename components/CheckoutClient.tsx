'use client';
import Link from 'next/link';
import { useState } from 'react';
import { imageFor, money, pkgCost, pkgOffered, type Pkg, type Product } from '@/lib/data';
import { deliveryOf, platformOf, storeOf } from '@/lib/apps';
import { AppArt } from './AppPhone';
import { Frame } from './MiniSite';
import { TLDS } from '@/lib/domains';
import { CONFIG, REVIEW_HOURS } from '@/lib/config';
import { GITHUB_NAME, deliveryTypeOf, expressOf } from '@/lib/handover';
import { EXPRESS_LABEL } from '@/lib/orders/machine';
import { DIGITAL_REFUND_SHORT } from '@/lib/refundText';

const PKG_LABEL: Record<'web' | 'app', Record<Pkg, string>> = {
  web: { asis: '', setup: ' with setup help', custom: ' with customisation' },
  app: { asis: '', setup: ' rebranded and built', custom: ' with customisation' },
};

export function CheckoutClient({ p, pkg: asked, domain, newDomainsEnabled = false }: { p: Product; pkg: Pkg; domain?: string; newDomainsEnabled?: boolean }) {
  const pkg: Pkg = pkgOffered(p, asked) ? asked : 'asis'; // a package the seller does not offer falls back to as is
  const pl = platformOf(p);
  const app = pl !== 'web';
  const dv = deliveryOf(p);
  const store = storeOf(p);
  const installer = dv === 'installer';
  const download = dv === 'download';
  const repo = deliveryTypeOf(p) === 'repo_access';
  const [github, setGithub] = useState('');
  const [oses, setOses] = useState<string[]>(['Windows', 'macOS']);

  const [mode, setMode] = useState<'own' | 'new'>('own');
  const [own, setOwn] = useState(domain ?? '');
  const [search, setSearch] = useState('');
  const [pick, setPick] = useState<number | null>(null);
  const [ai, setAi] = useState(false);
  const [host, setHost] = useState(false);
  const [express, setExpress] = useState(false);
  const [acct, setAcct] = useState<'have' | 'help'>('have');
  const [appName, setAppName] = useState('');
  const [listing, setListing] = useState(false);
  const [done] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const base =
    search
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '') || 'mybusiness';
  const picked = pick === null ? null : { name: base + TLDS[pick][0], price: TLDS[pick][1] };

  const lines: [string, number][] = [[p.name + PKG_LABEL[app ? 'app' : 'web'][pkg], p.price + pkgCost(p, pkg)]];
  if (dv !== 'store' && !installer && !download && mode === 'new' && picked) lines.push([`Domain ${picked.name} (1 year)`, picked.price]);
  const expressPrice = expressOf(p);
  const instantNow = download && pkg === 'asis' && !repo;
  if (expressPrice && !instantNow && express) lines.push([EXPRESS_LABEL, expressPrice]);
  if (!app && ai) lines.push(['AI content and SEO', 3]);
  if ((!app || dv === 'host') && host) lines.push(['Managed hosting, first month', 4]);
  if (dv === 'store' && listing) lines.push([`${store} listing pack`, 9]);
  if (installer && listing) lines.push(['Installer and auto-update setup', 15]);
  const total = lines.reduce((s, l) => s + l[1], 0);

  const span = p.days === 1 ? '1 day' : '1 to ' + p.days + ' days';
  const testWay = pl === 'ios' ? 'TestFlight' : dv === 'host' ? 'a private test link' : installer ? 'the installers' : 'a test build or Google Play internal test link';

  return (
    <div className="wrap" data-checkout>
      <div className="page-head" style={{ paddingBottom: 20 }}>
        <h1>Checkout</h1>
      </div>
      <div className="checkout">
        <div>
          {done ? (
            <div className="done">
              <span className="chip mint">
                <i />
                Payment held safely
              </span>
              <h2 style={{ marginTop: 16 }}>Order placed. We&apos;re setting up {done}.</h2>
              <p className="muted" style={{ marginTop: 10 }}>
                Your seller has been told to start. Expect {dv === 'store' ? 'your test build' : installer ? 'your installers' : dv === 'host' ? 'your app live' : 'your site'} in {span}.
                {dv === 'store' && ` ${store} reviews the app after that, so approval time is up to them.`}
              </p>
              <ul className="tl">
                <li className="on">
                  <b>Payment received</b>
                  <small>Held until you accept the {app ? 'app' : 'site'}</small>
                </li>
                <li className="now">
                  <b>{app ? (dv === 'host' ? 'Seller is rebranding and deploying your app' : 'Seller is rebranding and building your app') : 'Seller is setting up your site'}</b>
                  <small>Due within {p.days === 1 ? '24 hours' : p.days * 24 + ' hours'}</small>
                </li>
                <li>
                  <b>{app ? `You try it via ${testWay}` : 'You review and accept'}</b>
                  <small>You have {REVIEW_HOURS} hours after delivery</small>
                </li>
                <li>
                  <b>{dv === 'store' ? 'You accept, the seller sends it to the store' : app ? 'You accept and the seller is paid' : 'Seller is paid'}</b>
                  <small>{app ? 'Your source files are ready to download as soon as you pay' : 'In the weekly payout, 7 days after you accept'}</small>
                </li>
                {app && (
                  <li>
                    <b>Seller is paid</b>
                    <small>In the weekly payout, 7 days after you accept</small>
                  </li>
                )}
              </ul>
              <div style={{ marginTop: 28, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <Link className="btn btn-blue" href="/dashboard/buyer">
                  Go to my orders
                </Link>
                <Link className="btn btn-line" href="/messages">
                  Message the seller
                </Link>
              </div>
            </div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setErr('');
                if (repo && !GITHUB_NAME.test(github.trim().replace(/^@/, ''))) return setErr('Enter your GitHub username, like octocat.');
                if ((dv === null || dv === 'host') && mode === 'new' && !picked) return setErr('Pick a domain from the list, or choose I have a domain.');
                setBusy(true);
                const res = await fetch('/api/demo/orders', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({
                    kind: 'site',
                    productId: p.id,
                    pkg,
                    domainMode: mode,
                    own,
                    domainName: picked?.name,
                    ai,
                    host,
                    listing,
                    appName,
                    oses,
                    github,
                    express: !!expressPrice && !instantNow && express,
                  }),
                });
                const body = await res.json().catch(() => ({}));
                if (!res.ok) {
                  setBusy(false);
                  return setErr(body.error ?? 'Something went wrong. Try again.');
                }
                window.location.assign(body.pay);
              }}
            >
              {dv === 'store' ? (
                <div className="panel">
                  <h2 style={{ fontSize: '1.5rem' }}>Your app on {store}</h2>
                  <div className="field">
                    <label htmlFor="app-name">App name</label>
                    <input id="app-name" value={appName} onChange={(e) => setAppName(e.target.value)} required maxLength={30} placeholder={`Your ${p.cat.toLowerCase()} app`} autoComplete="off" />
                    <small>This is the name people see on {store}.</small>
                  </div>
                  <div className="seg" style={{ marginTop: 16 }} role="group" aria-label="Store account">
                    <button type="button" aria-pressed={acct === 'have'} onClick={() => setAcct('have')}>
                      I have a developer account
                    </button>
                    <button type="button" aria-pressed={acct === 'help'} onClick={() => setAcct('help')}>
                      Help me set one up
                    </button>
                  </div>
                  <div className="note" style={{ marginTop: 16 }}>
                    <span>
                      {acct === 'have' ? (
                        <>
                          After payment you invite your seller to your {pl === 'ios' ? 'App Store Connect' : 'Play Console'} account with limited access. <b>Never share your password.</b>
                        </>
                      ) : (
                        <>{pl === 'ios' ? 'Apple' : 'Google'} charges its own developer fee, paid to them, not to SellOnBay. Your seller walks you through creating the account in your name.</>
                      )}
                    </span>
                  </div>
                </div>
              ) : installer ? (
                <div className="panel">
                  <h2 style={{ fontSize: '1.5rem' }}>Your desktop app</h2>
                  <div className="field">
                    <label htmlFor="app-name">App name</label>
                    <input id="app-name" value={appName} onChange={(e) => setAppName(e.target.value)} required maxLength={30} placeholder={`Your ${p.cat.toLowerCase()} app`} autoComplete="off" />
                    <small>This is the name on the installer and in the window title.</small>
                  </div>
                  <fieldset className="oses">
                    <legend>Which computers?</legend>
                    {['Windows', 'macOS', 'Linux'].map((o) => (
                      <label key={o}>
                        <input type="checkbox" checked={oses.includes(o)} onChange={(e) => setOses((v) => (e.target.checked ? [...v, o] : v.filter((x) => x !== o)))} />
                        {o}
                      </label>
                    ))}
                  </fieldset>
                  <div className="note" style={{ marginTop: 16 }}>
                    <span>
                      You get installers for the computers you pick. Signing them (and Apple notarisation for Mac) uses your own accounts and their fees, paid to those providers.{' '}
                      <b>Never share a password.</b>
                    </span>
                  </div>
                </div>
              ) : download ? (
                <div className="panel">
                  <h2 style={{ fontSize: '1.5rem' }}>What you get</h2>
                  <ul className="checks" style={{ marginTop: 8 }}>
                    {p.inc.slice(0, 5).map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                  {repo && (
                    <div className="field">
                      <label htmlFor="gh-user">Your GitHub username</label>
                      <input id="gh-user" value={github} onChange={(e) => setGithub(e.target.value)} required maxLength={40} placeholder="octocat" autoComplete="off" />
                      <small>After you pay, the seller invites this account to a private repository. Never share a password or a token.</small>
                    </div>
                  )}
                  <div className="note" style={{ marginTop: 16 }}>
                    <span>
                      {repo
                        ? 'After you pay, the seller invites your GitHub account. You confirm you can open it, then your review time starts.'
                        : pkg === 'asis'
                          ? 'After you pay you get your files at once.'
                          : 'The seller works on it after you pay and sends it for review.'}{' '}
                      No domain needed. Payment is held in escrow until then.
                    </span>
                  </div>
                  <p className="muted" style={{ marginTop: 12, fontSize: 14 }} data-refund>
                    {DIGITAL_REFUND_SHORT} <Link href="/refunds#digital-products">Refunds</Link>
                  </p>
                </div>
              ) : (
                <div className="panel">
                  <h2 style={{ fontSize: '1.5rem' }}>Where should it go live?</h2>
                  {dv === 'host' && (
                    <div className="field">
                      <label htmlFor="app-name">App name</label>
                      <input id="app-name" value={appName} onChange={(e) => setAppName(e.target.value)} required maxLength={30} placeholder={`Your ${p.cat.toLowerCase()} app`} autoComplete="off" />
                    </div>
                  )}
                  <div className="seg" style={{ marginTop: 16 }} role="group" aria-label="Domain choice">
                    <button type="button" aria-pressed={mode === 'own'} onClick={() => setMode('own')}>
                      I have a domain
                    </button>
                    <button type="button" aria-pressed={mode === 'new'} disabled={!newDomainsEnabled} onClick={() => setMode('new')}>
                      I need a domain
                    </button>
                  </div>
                  {!newDomainsEnabled && <p className="muted" role="status" style={{ marginTop: 10 }}>New domain purchases are not available yet. Please use a domain you already own.</p>}
                  {mode === 'own' ? (
                    <div>
                      <div className="field">
                        <label htmlFor="own-domain">Your domain</label>
                        <input id="own-domain" value={own} onChange={(e) => setOwn(e.target.value)} placeholder="mybusiness.com" autoComplete="off" />
                        <small>After payment we show you two DNS settings to change. It takes about 5 minutes.</small>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="field">
                        <label htmlFor="d-search">Search a name</label>
                        <input
                          id="d-search"
                          value={search}
                          onChange={(e) => {
                            setSearch(e.target.value);
                            setPick(null);
                          }}
                          placeholder="mybusiness"
                          autoComplete="off"
                        />
                      </div>
                      <div className="dom-list">
                        {TLDS.map(([t, pr], i) => {
                          const taken = base.length < 5 && t === '.com';
                          return (
                            <label key={t} className={taken ? 'taken' : ''}>
                              <input type="radio" name="dom" checked={pick === i} disabled={taken} onChange={() => setPick(i)} />
                              <b>
                                {base}
                                {t}
                              </b>
                              {taken ? <em>Taken</em> : <em>{money(pr)}/yr</em>}
                            </label>
                          );
                        })}
                      </div>
                      <small className="muted" style={{ display: 'block', marginTop: 10 }}>
                        Registered in your name. Renews yearly and you can move it any time.
                      </small>
                    </div>
                  )}
                </div>
              )}

              {!download && (
                <div className="panel" style={{ marginTop: 20 }}>
                  <h2 style={{ fontSize: '1.5rem' }}>Extras</h2>
                  {dv === 'store' ? (
                    <label className="addon">
                      <input type="checkbox" checked={listing} onChange={(e) => setListing(e.target.checked)} />
                      <div style={{ flex: 1 }}>
                        <b>
                          {store} listing pack <span>$9</span>
                        </b>
                        <span className="muted">We write the store description and keywords, and prepare your screenshots.</span>
                      </div>
                    </label>
                  ) : installer ? (
                    <label className="addon">
                      <input type="checkbox" checked={listing} onChange={(e) => setListing(e.target.checked)} />
                      <div style={{ flex: 1 }}>
                        <b>
                          Installer and auto-update setup <span>$15</span>
                        </b>
                        <span className="muted">We set up installers that update themselves when you release a new version.</span>
                      </div>
                    </label>
                  ) : dv === 'host' ? (
                    <label className="addon">
                      <input type="checkbox" checked={host} onChange={(e) => setHost(e.target.checked)} />
                      <div style={{ flex: 1 }}>
                        <b>
                          Managed hosting <span>$4/mo</span>
                        </b>
                        <span className="muted">We host and update your app. Includes SSL and daily backups. Cancel any time.</span>
                      </div>
                    </label>
                  ) : (
                    <>
                      <label className="addon">
                        <input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} />
                        <div style={{ flex: 1 }}>
                          <b>
                            AI content and SEO <span>$3</span>
                          </b>
                          <span className="muted">Answer 3 questions and we write your page text and search descriptions.</span>
                        </div>
                      </label>
                      <label className="addon">
                        <input type="checkbox" checked={host} onChange={(e) => setHost(e.target.checked)} />
                        <div style={{ flex: 1 }}>
                          <b>
                            Managed hosting <span>$4/mo</span>
                          </b>
                          <span className="muted">We host and update your site. Includes SSL and daily backups. Cancel any time.</span>
                        </div>
                      </label>
                    </>
                  )}
                </div>
              )}
              {expressPrice && !instantNow && (
                <div className="panel" style={{ marginTop: 20 }}>
                  <label className="addon">
                    <input type="checkbox" checked={express} onChange={(e) => setExpress(e.target.checked)} />
                    <div style={{ flex: 1 }}>
                      <b>
                        Express delivery, within 24 hours <span>${expressPrice}</span>
                      </b>
                      <span className="muted">
                        The seller delivers within {CONFIG.delivery.expressHours} hours instead of {span}. Same escrow and review.
                      </span>
                    </div>
                  </label>
                </div>
              )}
              <div className="panel" style={{ marginTop: 20 }}>
                <h2 style={{ fontSize: '1.5rem' }}>Your details</h2>
                <div className="row2">
                  <div className="field">
                    <label htmlFor="c-name-in">Full name</label>
                    <input id="c-name-in" required autoComplete="name" />
                  </div>
                  <div className="field">
                    <label htmlFor="c-mail">Email</label>
                    <input id="c-mail" type="email" required autoComplete="email" />
                  </div>
                </div>
                <label style={{ display: 'flex', gap: 10, marginTop: 20, alignItems: 'start' }}>
                  <input type="checkbox" required style={{ accentColor: '#2B3DFF', marginTop: 5 }} />
                  <span className="muted">I agree to the terms. Once I accept the {app ? 'app' : 'site'}, the order is final.</span>
                </label>
              </div>
              {err && (
                <p className="form-err" role="alert">
                  {err}
                </p>
              )}
              <button className="btn btn-blue btn-lg" style={{ marginTop: 24, width: '100%' }} type="submit" disabled={busy}>
                {busy ? 'One moment…' : 'Continue to payment · ' + money(total)}
              </button>
            </form>
          )}
        </div>
        {!done && (
          <aside className="sum">
            <div style={{ width: app ? (dv === 'store' ? 96 : 190) : 140 }}>{app ? <AppArt p={p} /> : <Frame theme={p.theme} image={imageFor(p.id)} sizes="140px" />}</div>
            <h2 style={{ fontSize: '1.5rem', marginTop: 16 }}>{p.name}</h2>
            <div style={{ marginTop: 12 }}>
              {lines.map(([l, v]) => (
                <div className="line" key={l}>
                  <span>{l}</span>
                  <b>{money(v)}</b>
                </div>
              ))}
            </div>
            <div className="tot">
              <span>Total</span>
              <span>{money(total)}</span>
            </div>
            <div className="note">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
                <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
              <span>Your payment is held by SellOnBay and only released to the seller after you accept.</span>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

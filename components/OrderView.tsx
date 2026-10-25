'use client';
import Link from 'next/link';
import { OrderChat } from './OrderChat';
import { useCallback, useEffect, useState } from 'react';
import { DEMO, type OrderView as View } from '@/lib/commerce/types';
import { ACCEPT_TEXT } from '@/lib/consentText';

type Kind = 'web' | 'host' | 'store' | 'installer' | 'hire' | 'download' | 'repo';
const money = (c: number) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0 });
const day = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, '0')).join(':');
};

const NOTE: Record<string, [string, string]> = {
  overdue: ['Delivery is late.', 'The delivery time has passed. You can cancel for a full refund.'],
  disputed: ['A dispute is open.', 'Payment for this order is held while it is decided.'],
  fix_requested: ['A fix was requested.', 'The seller is fixing the problem and will deliver again.'],
  cancelled: ['This order was cancelled.', 'Nothing more will be charged.'],
  refunded: ['This order was refunded.', 'The money goes back to your card.'],
};

export function OrderView({ initial, kind, paidNow, files = [], realtime = false }: { initial: View; kind: Kind; paidNow: boolean; files?: [string, string][]; realtime?: boolean }) {
  const [o, setO] = useState(initial);
  const [skew, setSkew] = useState(initial.now - Date.now());
  const [now, setNow] = useState(initial.now);
  const [busy, setBusy] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [err, setErr] = useState('');
  const [dlink, setDlink] = useState<{ url: string; expiresAt: string; licenseKey: string } | null>(null);
  async function getFiles() {
    setBusy('files');
    setErr('');
    const r = await fetch(`/api/demo/orders/${initial.id}/download`, { method: 'POST' });
    const body = await r.json().catch(() => ({}));
    if (r.ok) setDlink(body);
    else setErr(body.error ?? 'Could not prepare your files.');
    setBusy('');
  }

  const load = useCallback(async () => {
    const r = await fetch(`/api/demo/orders/${initial.id}`, { cache: 'no-store' });
    if (!r.ok) return;
    const v: View = await r.json();
    setO(v);
    setSkew(v.now - Date.now());
  }, [initial.id]);
  const stage = o.progress.stage;
  useEffect(() => {
    if (stage === 'accepted') return;
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [load, stage]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + skew), 500);
    return () => clearInterval(t);
  }, [skew]);

  async function act(path: 'accept' | 'skip' | 'cancel' | 'confirm-access') {
    setBusy(path);
    setErr('');
    const r = await fetch(
      `/api/demo/orders/${initial.id}/${path}`,
      path === 'accept' ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ consent: true }) } : { method: 'POST' },
    );
    if (!r.ok) setErr((await r.json().catch(() => ({}))).error ?? 'Something went wrong.');
    await load();
    setBusy('');
  }

  async function extraAct(id: string, action: 'approve' | 'decline') {
    setBusy('extra:' + id);
    setErr('');
    const r = await fetch(`/api/demo/orders/${initial.id}/extra/${id}/${action}`, { method: 'POST' });
    const j = (await r.json().catch(() => ({}))) as { error?: string; url?: string };
    if (j.url && /^https:\/\/([a-z0-9-]+\.)*paypal\.com\//.test(j.url)) {
      window.location.assign(j.url); // a real order: the extra work is paid at PayPal
      return;
    }
    if (!r.ok) setErr(j.error ?? 'Something went wrong.');
    await load();
    setBusy('');
  }
  const [reason, setReason] = useState('not_as_described');
  const [detail, setDetail] = useState('');
  const [showDispute, setShowDispute] = useState(false);
  async function openDispute() {
    setBusy('dispute');
    setErr('');
    const r = await fetch(`/api/demo/orders/${initial.id}/dispute`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason, detail }) });
    if (!r.ok) setErr((await r.json().catch(() => ({}))).error ?? 'Something went wrong.');
    else setShowDispute(false);
    await load();
    setBusy('');
  }
  const [stars, setStars] = useState(5);
  const [note, setNote] = useState('');
  async function sendReview() {
    setBusy('review');
    setErr('');
    const r = await fetch(`/api/demo/orders/${initial.id}/review`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rating: stars, body: note }) });
    if (!r.ok) setErr((await r.json().catch(() => ({}))).error ?? 'Something went wrong.');
    await load();
    setBusy('');
  }
  async function demoExtra() {
    setBusy('demo-extra');
    setErr('');
    const r = await fetch(`/api/demo/orders/${initial.id}/extra`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Add a contact form and a gallery page', priceCents: 2500, addDays: 1 }),
    });
    if (!r.ok) setErr((await r.json().catch(() => ({}))).error ?? 'Something went wrong.');
    await load();
    setBusy('');
  }

  const p = o.progress,
    hire = kind === 'hire',
    first = hire ? 'The developer' : 'The seller',
    dl = kind === 'download',
    repo = kind === 'repo',
    invited = o.events.some((e) => e.event === 'repo_invited');
  const rank = { awaiting_payment: 0, queued: 1, building: 2, delivered: 3, accepted: 4, cancelled: 0 }[stage];
  const build = Math.min(100, Math.max(0, Math.round(((now - (o.paidAt ?? now) - DEMO.startMs) / DEMO.buildMs) * 100)));
  const left = (p.reviewEndsAt ?? 0) - now;
  const domain = o.domain;
  const live = domain ? 'https://' + domain.name : null;

  type S = { t: string; d: string; state: 'done' | 'now' | 'next'; extra?: React.ReactNode };
  const steps: S[] = [{ t: 'Payment held safely', d: o.paidAt ? `${day(o.paidAt)}. Released only after you accept.` : '', state: 'done' }];
  if (domain)
    steps.push(
      domain.source === 'new'
        ? { t: 'Domain registered in your name', d: `${domain.name}, renews ${domain.expires ?? ''}`, state: 'done' }
        : { t: `Your domain ${domain.name}`, d: rank >= 3 ? 'Connected' : `${first} connects it while building`, state: rank >= 3 ? 'done' : 'now' },
    );
  if (repo) {
    steps.push({
      t: invited ? 'Seller sent your GitHub invite' : 'Seller is sending your GitHub invite',
      d: invited ? `To ${o.github ?? 'your account'}. Check your GitHub notifications.` : 'This usually takes a few hours.',
      state: invited || rank >= 3 ? 'done' : 'now',
    });
    steps.push({
      t: 'You confirm access',
      d: rank >= 3 ? 'Confirmed' : 'Open the repository, then confirm here.',
      state: rank >= 3 ? 'done' : invited ? 'now' : 'next',
      extra:
        invited && rank < 3 ? (
          <button className="btn btn-blue btn-sm" disabled={busy === 'confirm-access'} onClick={() => act('confirm-access')}>
            {busy === 'confirm-access' ? 'One moment...' : 'I can open the repository'}
          </button>
        ) : null,
    });
  } else {
    steps.push({
      t:
        dl && o.instant
          ? 'Your files are ready'
          : dl
            ? `${first} ${rank >= 3 ? 'finished setting it up' : 'is setting it up'}`
            : `${first} ${rank >= 3 ? 'finished building' : rank === 2 ? 'is building' : 'is starting'}`,
      d: rank >= 3 ? 'Delivered' : rank === 2 ? `${build}% done` : `Starting in a few seconds. Real orders are due in ${o.days === 1 ? '24 hours' : o.days * 24 + ' hours'}.`,
      state: rank >= 3 ? 'done' : 'now',
      extra:
        rank === 2 || rank === 1 ? (
          <div className="ord-bar" role="progressbar" aria-valuenow={build} aria-valuemin={0} aria-valuemax={100}>
            <i style={{ width: (rank === 1 ? 4 : Math.max(4, build)) + '%' }} />
          </div>
        ) : null,
    });
    steps.push({
      t: hire ? 'Delivery ready' : dl ? 'Check your files' : kind === 'store' ? 'Test build ready' : kind === 'installer' ? 'Installers ready' : 'Your site is live',
      d: rank >= 3 ? (live ? live : 'Check it and accept, or ask for a fix') : 'Next',
      state: rank === 3 ? 'now' : rank > 3 ? 'done' : 'next',
    });
  }
  steps.push({
    t: 'You review',
    d:
      rank === 3
        ? dl
          ? `${clock(left)} left to check your files. Then it is accepted for you.`
          : `${clock(left)} left. Then it is accepted for you.`
        : rank > 3
          ? p.autoAccepted
            ? 'Accepted automatically after 48 hours'
            : 'You accepted'
          : '48 hours after delivery',
    state: rank === 3 ? 'now' : rank > 3 ? 'done' : 'next',
  });
  steps.push({ t: `${first} is paid`, d: rank === 4 && p.payoutAfter ? `In the weekly payout after ${day(p.payoutAfter)}` : '7 days after you accept', state: rank === 4 ? 'done' : 'next' });

  return (
    <div className="wrap ord">
      {paidNow && (
        <div className="ord-ok" role="status">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12l5 5 9-10" />
          </svg>
          <div>
            <b>Payment received</b>
            <span>{money(o.totalCents)} is held safely until you accept.</span>
          </div>
        </div>
      )}
      <div className="ord-head">
        <div>
          <span className={'chip ' + (stage === 'accepted' ? 'mint' : stage === 'delivered' ? 'amber' : 'blue')}>
            <i />
            {
              {
                awaiting_payment: 'Waiting for payment',
                queued: 'Starting',
                building: 'Building',
                delivered: 'Ready to review',
                accepted: 'Accepted',
                cancelled: o.state === 'refunded' ? 'Refunded' : 'Cancelled',
              }[stage]
            }
          </span>
          <h1>{o.title}</h1>
          <p className="muted">
            Order {o.id.slice(0, 8).toUpperCase()}
            {domain ? ` · ${domain.name}` : ''}
          </p>
        </div>
      </div>
      <div className="ord-grid">
        <div>
          <ol className="ord-tl">
            {steps.map((s) => (
              <li key={s.t} className={'st-' + s.state}>
                <i aria-hidden="true">
                  {s.state === 'done' ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12l5 5 9-10" />
                    </svg>
                  ) : null}
                </i>
                <div>
                  <b>{s.t}</b>
                  <small>{s.d}</small>
                  {s.extra}
                </div>
              </li>
            ))}
          </ol>

          {rank >= 3 && (
            <div className="ord-live">
              {live && !hire ? (
                <>
                  <div className="ord-win">
                    <i />
                    <i />
                    <i />
                    <span>{live}</span>
                  </div>
                  <div className="ord-live-b">
                    <b>{kind === 'host' ? 'Your app is live' : 'Your site is live'}</b>
                    <p>Open it, click around, and make sure it is what you paid for.</p>
                    <Link className="btn btn-blue btn-sm" href={`/preview/${o.productId}`} target="_blank">
                      Open the site
                    </Link>
                  </div>
                </>
              ) : (
                <div className="ord-live-b">
                  <b>{hire ? 'Your delivery' : dl ? 'Your files' : kind === 'store' ? 'Your test build' : 'Your installers'}</b>
                  {dl && files.length > 0 && (
                    <ul className="ord-files">
                      {files.map(([n, sz]) => (
                        <li key={n}>
                          <i />
                          {n}
                          <em>{sz}</em>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p>
                    {hire
                      ? 'Files and notes are shared in messages.'
                      : dl
                        ? 'Your files are ready now. The download link works for 24 hours, and you can get a new one any time. Keep your licence key.'
                        : kind === 'store'
                          ? 'Install it from the test link in messages. After you accept, the seller sends it to the store.'
                          : `Download links for ${(o.oses ?? []).join(', ') || 'your computers'} are in messages.`}
                  </p>
                  {dl && (
                    <div className="ord-dl">
                      {dlink ? (
                        <>
                          <a className="btn btn-blue btn-sm" href={dlink.url}>
                            Download
                          </a>
                          <code className="ord-key" aria-label="Licence key">
                            {dlink.licenseKey}
                          </code>
                          <small>Link expires {new Date(dlink.expiresAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.</small>
                        </>
                      ) : null}
                      <button className="btn btn-line btn-sm" type="button" disabled={busy === 'files'} onClick={getFiles}>
                        {busy === 'files' ? 'One moment…' : dlink ? 'Get a new link' : 'Get my files'}
                      </button>
                    </div>
                  )}
                  <Link className={dl ? 'link-u' : 'btn btn-blue btn-sm'} href="/messages">
                    {dl ? 'Ask the seller a question' : 'Open messages'}
                  </Link>
                </div>
              )}
            </div>
          )}

          {stage === 'delivered' && (
            <div className="ord-act">
              <label className="check" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexBasis: '100%', margin: '0 0 10px' }}>
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 4 }} />
                <span className="muted">{ACCEPT_TEXT}</span>
              </label>
              <button className="btn btn-gold btn-lg" disabled={busy === 'accept' || !agreed} onClick={() => act('accept')}>
                {busy === 'accept' ? 'Accepting…' : 'Accept and release payment'}
              </button>
              <Link className="btn btn-line btn-lg" href="/faq#refunds">
                Something is wrong
              </Link>
            </div>
          )}
          {stage === 'accepted' && (
            <div className="ord-done">
              <b>All done.</b>
              <p>Your source files are released and you have a 7-day bug-fix guarantee{p.bugfixUntil ? ` until ${day(p.bugfixUntil)}` : ''}.</p>
              {o.certificate && (
                <a className="btn btn-line btn-sm" href={`/api/demo/orders/${o.id}/certificate`} download>
                  Download your handover certificate
                </a>
              )}
            </div>
          )}
          {NOTE[o.state] && (
            <div className="ord-done" role="status">
              <b>{NOTE[o.state][0]}</b>
              <p>{NOTE[o.state][1]}</p>
              {o.state === 'overdue' && (
                <button className="btn btn-line btn-sm" disabled={busy === 'cancel'} onClick={() => act('cancel')}>
                  {busy === 'cancel' ? 'Cancelling...' : 'Cancel and get a full refund'}
                </button>
              )}
            </div>
          )}
          {o.paidAt && (
            <p className="muted">
              <a className="link-u" href={`/api/demo/orders/${o.id}/evidence`} download>
                Download the full record of this order (PDF)
              </a>
            </p>
          )}
          {o.repo && (o.repo.revoke || (o.repo.invitedAt && o.state === 'in_delivery')) && (
            <div className="panel" data-repo>
              <h2 style={{ fontSize: '1.2rem' }}>Repository access</h2>
              {o.repo.invitedAt && o.state === 'in_delivery' && (
                <p>
                  {o.repo.expired
                    ? 'The GitHub invite has run out. Ask the seller to send it again in the order chat.'
                    : `Accept the GitHub invite before ${day(o.repo.expiresAt!)}. GitHub removes an invite that is not accepted in time. Then confirm here that you can open it.`}
                </p>
              )}
              {o.repo.resends > 0 && o.state === 'in_delivery' && <p className="muted">The seller sent the invite again {o.repo.resends === 1 ? 'once' : `${o.repo.resends} times`}.</p>}
              {o.repo.revoke && (
                <p data-revoke={o.repo.revoke}>
                  <b>Access removal:</b>{' '}
                  {o.repo.revoke === 'pending'
                    ? 'This order ended, so the seller was asked to remove your access to the repository.'
                    : o.repo.revoke === 'seller_done'
                      ? 'The seller says your access was removed. Our team is checking it.'
                      : 'Confirmed by our team: you no longer have access to the repository.'}
                </p>
              )}
            </div>
          )}
          {o.info && (
            <div className="panel" data-info>
              <h2 style={{ fontSize: '1.2rem' }}>About this product</h2>
              <dl className="facts-list">
                <div>
                  <dt>What it needs</dt>
                  <dd>{o.info.requirements ?? 'No special requirements listed.'}</dd>
                </div>
                <div>
                  <dt>Documentation</dt>
                  <dd>
                    {o.info.docsUrl ? (
                      <a className="link-u" href={o.info.docsUrl} target="_blank" rel="noopener noreferrer nofollow">
                        Read the guide
                      </a>
                    ) : (
                      'No separate guide.'
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Support</dt>
                  <dd>{o.info.supportUntil ? `Until ${day(o.info.supportUntil)}, in the order chat${o.info.supportUntil < Date.now() ? ' (ended)' : ''}` : 'None. You got the product as it is.'}</dd>
                </div>
                {o.info.versions.isNew && (
                  <div data-new-version>
                    <dt>New version</dt>
                    <dd>
                      Version {o.info.versions.current} is ready. Use &quot;Get my files&quot; above to download it.
                      {o.info.versions.list[0] ? ` What changed: ${o.info.versions.list[0].changelog}` : ''}
                    </dd>
                  </div>
                )}
                <div>
                  <dt>Updates</dt>
                  <dd>{o.info.updateUntil ? `New versions until ${day(o.info.updateUntil)}${o.info.updateUntil < Date.now() ? ' (ended)' : ''}` : 'None. You got the version you bought.'}</dd>
                </div>
              </dl>
              {o.info.versions.list.length > 0 && (
                <details className="muted" style={{ marginTop: 12 }}>
                  <summary>Version history</summary>
                  <ul>
                    {o.info.versions.list.map((v) => (
                      <li key={v.version}>
                        <b>{v.version}</b> ({day(v.at)}): {v.changelog}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
          {o.held && (
            <p className="panel" role="status">
              This order is waiting for a short safety check by our team. Your money is safe in escrow. The seller starts, and your files are released, as soon as it is cleared. The delivery timer is
              paused until then.
            </p>
          )}
          {err && (
            <p className="form-err" role="alert">
              {err}
            </p>
          )}

          {o.canReview && (
            <div className="panel ord-dispute">
              <h2 style={{ fontSize: '1.2rem' }}>Leave a review</h2>
              <p className="muted">Only buyers can review, so other people can trust it. Keep contact details and links out.</p>
              <div className="field">
                <label htmlFor="rv-stars">Stars</label>
                <select id="rv-stars" value={stars} onChange={(e) => setStars(+e.target.value)}>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? 'star' : 'stars'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="rv-note">What was it like? (optional)</label>
                <textarea id="rv-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
              </div>
              <button className="btn btn-blue btn-sm" type="button" disabled={busy === 'review'} onClick={sendReview}>
                {busy === 'review' ? 'Sending...' : 'Post review'}
              </button>
            </div>
          )}
          {o.review && (
            <div className="ord-done" role="status">
              <b>Thanks for your review.</b>
              <p>
                {'★'.repeat(o.review.rating)} {o.review.body}
              </p>
            </div>
          )}
          {o.dispute && (
            <div className="ord-done" role="status">
              <b>{o.dispute.status === 'decided' ? 'Problem decided' : 'Problem reported'}</b>
              <p>
                {o.dispute.status === 'decided'
                  ? `Decision: ${(o.dispute.decision ?? '').replace(/_/g, ' ')}.`
                  : o.dispute.status === 'seller_replied'
                    ? 'The seller replied. An admin is looking at it and decides within 5 days. Payment is held.'
                    : 'The seller has 48 hours to reply, then an admin decides within 5 days. Payment is held.'}
              </p>
            </div>
          )}
          {o.canDispute && !showDispute && (
            <button className="btn btn-line btn-sm" type="button" onClick={() => setShowDispute(true)}>
              Report a problem
            </button>
          )}
          {showDispute && (
            <div className="panel ord-dispute">
              <h2 style={{ fontSize: '1.2rem' }}>Report a problem</h2>
              <p className="muted">Payment stays held while we look. Say what is wrong in your own words. Keep contact details out, we decide here.</p>
              <div className="field">
                <label htmlFor="d-reason">What is wrong</label>
                <select id="d-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
                  <option value="not_as_described">It is not as described</option>
                  <option value="not_working">It does not work</option>
                  <option value="malware">It has harmful code</option>
                  <option value="copyright">It copies someone else&apos;s work</option>
                  <option value="other">Something else</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="d-detail">What happened (at least 20 characters)</label>
                <textarea id="d-detail" rows={4} value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={2000} />
              </div>
              <div className="ord-extra-btns">
                <button className="btn btn-blue btn-sm" type="button" disabled={busy === 'dispute' || detail.trim().length < 20} onClick={openDispute}>
                  {busy === 'dispute' ? 'Sending...' : 'Send report'}
                </button>
                <button className="btn btn-line btn-sm" type="button" onClick={() => setShowDispute(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {o.extras.length > 0 && (
            <div className="ord-extras" aria-label="Extra work">
              <b>Extra work</b>
              {o.extras.map((x) => (
                <div className="ord-extra" key={x.id}>
                  <div>
                    <span>{x.title}</span>
                    <small>
                      {money(x.priceCents)} and {x.addDays} more {x.addDays === 1 ? 'day' : 'days'} ·{' '}
                      {{ pending: 'waiting for you', funded: 'paid into escrow', declined: 'declined', cancelled: 'taken back' }[x.state] ?? x.state}
                    </small>
                  </div>
                  {x.state === 'pending' && (
                    <div className="ord-extra-btns">
                      <button className="btn btn-blue btn-sm" disabled={busy === 'extra:' + x.id} onClick={() => extraAct(x.id, 'approve')}>
                        Approve and pay {money(x.priceCents)}
                      </button>
                      <button className="btn btn-line btn-sm" disabled={busy === 'extra:' + x.id} onClick={() => extraAct(x.id, 'decline')}>
                        Decline
                      </button>
                    </div>
                  )}
                </div>
              ))}
              <small className="muted">The seller starts extra work only after it shows as paid into escrow.</small>
            </div>
          )}

          {o.paidAt && o.state !== 'cancelled' && o.state !== 'refunded' && (
            <OrderChat endpoint={`/api/demo/orders/${o.id}/messages`} orderId={o.id} me="buyer" open={o.state !== 'paid_out'} live={realtime} />
          )}

          {o.events.length > 0 && (
            <details className="ord-log">
              <summary>Order history</summary>
              <ul>
                {o.events.map((e, i) => (
                  <li key={i}>
                    <span>{new Date(e.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span> {e.event.replace(/_/g, ' ')}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {!o.real && stage !== 'accepted' && stage !== 'awaiting_payment' && stage !== 'cancelled' && (
            <div className="ord-demo">
              <div>
                <b>Demo controls</b>
                <span>Real {hire ? 'developers' : 'sellers'} take 1 to 7 days and you get 48 hours to review. Here you can jump ahead.</span>
              </div>
              {['funded', 'in_delivery', 'overdue'].includes(o.state) && o.kind === 'site' && (
                <button className="btn btn-line btn-sm" disabled={busy === 'demo-extra'} onClick={demoExtra}>
                  Pretend the seller asks for extra work
                </button>
              )}
              <button className="btn btn-line btn-sm" disabled={busy === 'skip'} onClick={() => act('skip')}>
                {stage === 'delivered' ? 'Skip the 48 hours' : 'Skip to delivery'}
              </button>
            </div>
          )}
        </div>

        <aside className="panel sum ord-rcpt" aria-label="Receipt">
          <h2>Receipt</h2>
          {o.lines.map(([l, c]) => (
            <div className="line" key={l}>
              <span>{l}</span>
              <b>{money(c)}</b>
            </div>
          ))}
          <div className="tot">
            <span>Total</span>
            <b>{money(o.totalCents)}</b>
          </div>
          {o.payment && (
            <p className="ord-pay">
              Paid with {o.payment.brand} ending {o.payment.last4}
              <br />
              <small>{o.payment.ref}</small>
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

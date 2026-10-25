'use client';
import Link from 'next/link';
import { useState } from 'react';
import { isBlocked } from '@/lib/chatFilter';
import { trialOf, type Dev } from '@/lib/developers';
import { DevAvatar } from './DevParts';

export function HireForm({ dev, start, live }: { dev: Dev; start: number; live: boolean }) {
  const [i, setI] = useState(start);
  const [brief, setBrief] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [paying, setPaying] = useState(false);
  const all = [...dev.packs, trialOf(dev)];
  const p = all[i];
  const blocked = isBlocked(brief);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (brief.trim().length < 20) return setErr('Tell the developer what you need in at least 20 characters.');
    if (blocked) return setErr('Keep emails, phone numbers and outside payment talk out of the brief. Everything stays on SellOnBay so you are protected.');
    if (!ok) return setErr('Please agree to the terms.');
    if (live) {
      setBusy(true);
      const res = await fetch('/api/hire', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dev: dev.id, pack: p.name, brief: brief.trim() }) });
      setBusy(false);
      if (!res.ok) return setErr((await res.json().catch(() => ({}))).error ?? 'Something went wrong. Try again.');
    }
    setDone(true);
  }

  async function fund() {
    setPaying(true);
    setErr('');
    const res = await fetch('/api/demo/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'hire', dev: dev.id, pack: p.name, brief: brief.trim() }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPaying(false);
      return setErr(body.error ?? 'Something went wrong.');
    }
    window.location.assign(body.pay);
  }

  if (done)
    return (
      <div className="wrap" style={{ maxWidth: 680, padding: '56px 20px' }}>
        <div className="done">
          <h2>Request sent to {dev.name.split(' ')[0]}</h2>
          <p className="muted">
            {p.name === 'Trial' ? 'Paid trial' : `${p.name} package`}, ${p.price}, {p.days} {p.days === 1 ? 'day' : 'days'}. Here is what happens next.
          </p>
          <ol className="tl">
            <li>
              <b>{dev.name.split(' ')[0]} reads your brief</b> and replies, usually in about {dev.respond}.
            </li>
            <li>
              <b>You fund escrow</b> to start. Work does not begin before payment is held.
            </li>
            <li>
              <b>They deliver</b> in {p.days} {p.days === 1 ? 'day' : 'days'}. You have 48 hours to review, then it is accepted.
            </li>
          </ol>
          {err && (
            <p className="form-err" role="alert">
              {err}
            </p>
          )}
          <div className="done-btns">
            <button className="btn btn-gold" type="button" onClick={fund} disabled={paying}>
              {paying ? 'One moment…' : `Fund escrow now · $${p.price}`}
            </button>
            <Link className="btn btn-blue" href="/messages">
              Open messages
            </Link>
            <Link className="btn btn-line" href="/developers">
              More developers
            </Link>
          </div>
        </div>
      </div>
    );

  return (
    <div className="wrap dv-hire">
      <p className="crumbs">
        <Link href="/developers">Developers</Link> / <Link href={`/developers/${dev.id}`}>{dev.name}</Link> / Order
      </p>
      <h1>Tell {dev.name.split(' ')[0]} what you need</h1>
      <form className="dv-hire-grid" onSubmit={submit} noValidate>
        <div className="panel">
          <h2>1. Pick a package</h2>
          <div className="dv-opts">
            {all.map((k, n) => (
              <label key={k.name} className={'dv-opt' + (n === i ? ' on' : '')}>
                <input type="radio" name="pack" checked={n === i} onChange={() => setI(n)} />
                <span>
                  <b>{k.name}</b>
                  <small>{k.blurb}</small>
                </span>
                <em>
                  ${k.price}
                  <small>{k.days}d</small>
                </em>
              </label>
            ))}
          </div>
          <h2 style={{ marginTop: 26 }}>2. Your brief</h2>
          <label className="field">
            <span>What should they do?</span>
            <textarea
              rows={7}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              maxLength={2000}
              placeholder="Which template or site? What should change? Any deadline or things to avoid?"
              aria-invalid={blocked}
            />
          </label>
          {blocked && <p className="field-err">That looks like an email, phone number or outside payment. Please remove it.</p>}
          <p className="muted" style={{ fontSize: 13.5 }}>
            Share links to your template or files here. Never share passwords.
          </p>
          <label className="check">
            <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
            <span>
              I agree to the <Link href="/terms">terms</Link>. Work starts after payment is held in escrow.
            </span>
          </label>
          {err && (
            <p className="form-err" role="alert">
              {err}
            </p>
          )}
        </div>
        <aside className="panel sum">
          <div className="dv-sum-who">
            <DevAvatar dev={dev} size={42} />
            <div>
              <b>{dev.name}</b>
              <small>{dev.gig}</small>
            </div>
          </div>
          <div className="line">
            <span>{p.name === 'Trial' ? 'Paid trial' : p.name + ' package'}</span>
            <b>${p.price}</b>
          </div>
          <div className="line">
            <span>Delivery</span>
            <b>
              {p.days} {p.days === 1 ? 'day' : 'days'}
            </b>
          </div>
          <div className="tot">
            <span>Total</span>
            <b>${p.price}</b>
          </div>
          <button className="btn btn-blue btn-lg" type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Send request'}
          </button>
          <p className="dv-safe">You pay nothing yet. Money goes into escrow only after {dev.name.split(' ')[0]} accepts, and is released when you accept the work.</p>
        </aside>
      </form>
    </div>
  );
}

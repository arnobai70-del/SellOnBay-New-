'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { CONFIG, SELLER_KEEP_TEXT, pct, sellerNetCents } from '@/lib/config';
import { imageFor, money } from '@/lib/data';

type Mode = 'buy' | 'sell';

const BARS = [38, 56, 44, 72, 64, 100, 80];

function Visual({ mode, n }: { mode: Mode; n: number }) {
  const a = imageFor('saffron-table');
  const b = imageFor('clinic-desk');
  if (mode === 'buy' && n === 0) {
    return (
      <div className="hv hv-stack" aria-hidden="true">
        {b && (
          <div className="hv-img back">
            <Image src={b.src} alt="" fill sizes="160px" style={{ objectFit: 'cover', objectPosition: 'top' }} />
          </div>
        )}
        {a && (
          <div className="hv-img front">
            <Image src={a.src} alt="" fill sizes="180px" style={{ objectFit: 'cover', objectPosition: 'top' }} />
          </div>
        )}
        <span className="chip mint hv-chip">
          <i />
          12 sites ready
        </span>
      </div>
    );
  }
  if (mode === 'buy' && n === 1) {
    return (
      <div className="hv hv-domain" aria-hidden="true">
        <div className="hv-url">
          <span className="hv-type">yourbusiness.com</span>
        </div>
        <span className="chip mint hv-live">
          <i />
          Live on your domain
        </span>
      </div>
    );
  }
  if (mode === 'buy') {
    return (
      <div className="hv" aria-hidden="true">
        <div className="hv-card">
          <div className="hv-row">
            <b>Saffron Table</b>
            <span className="chip amber">
              <i />
              Ready to review
            </span>
          </div>
          <div className="hv-timer">47:59:12</div>
          <small className="muted">left to check it</small>
          <span className="btn btn-gold btn-sm">Accept site</span>
        </div>
      </div>
    );
  }
  if (n === 0) {
    return (
      <div className="hv" aria-hidden="true">
        <div className="hv-card">
          <div className="hv-row">
            <b>Your price</b>
            <b>{money(39)}</b>
          </div>
          <div className="hv-slider">
            <i />
          </div>
          <div className="hv-row">
            <span className="muted">You keep {pct(10_000 - CONFIG.fees.saleBps)}</span>
            <b className="hv-green">{money(sellerNetCents(3900, 'sale') / 100)}</b>
          </div>
        </div>
      </div>
    );
  }
  if (n === 1) {
    return (
      <div className="hv hv-checks" aria-hidden="true">
        <span className="chip mint">
          <i />
          Checked
        </span>
        <span className="chip mint">
          <i />
          Original: 97%
        </span>
        <span className="chip mint">
          <i />
          Demo works
        </span>
        <span className="chip blue">
          <i />
          Approved in 24 hours
        </span>
      </div>
    );
  }
  return (
    <div className="hv" aria-hidden="true">
      <div className="hv-card">
        <small className="muted">Available to withdraw</small>
        <div className="hv-timer">{money(642)}</div>
        <div className="hv-bars">
          {BARS.map((h, i) => (
            <i key={i} style={{ height: h + '%' }} />
          ))}
        </div>
        <span className="chip blue">
          <i />
          Paid every Sunday
        </span>
      </div>
    </div>
  );
}

const STEPS: Record<Mode, { t: string; d: string }[]> = {
  buy: [
    { t: 'Choose a site', d: 'Open the live demo, check it on your phone, and pick the one that fits.' },
    { t: 'Add your domain', d: 'Already own one? Paste it. If not, buy it here in one click.' },
    { t: 'Review and accept', d: 'Your seller sets it up within 1 to 7 days. You check it, then accept.' },
  ],
  sell: [
    { t: 'List your site', d: `Upload it once and set your price. You keep ${SELLER_KEEP_TEXT} of every sale.` },
    { t: 'We check it', d: 'We check for copied content and look at the files, and reply within 24 hours.' },
    { t: 'Get paid weekly', d: 'Earnings are paid out 7 days after the buyer accepts.' },
  ],
};

export function HowItWorks({ initial = 'buy', toggle = true, title = 'Live in three steps' }: { initial?: Mode; toggle?: boolean; title?: string }) {
  const [mode, setMode] = useState<Mode>(initial);
  return (
    <div className="hiw">
      <div className="hiw-head">
        <h2>{title}</h2>
        {toggle && (
          <div className="seg hiw-seg" role="group" aria-label="Who is this for">
            <button type="button" aria-pressed={mode === 'buy'} onClick={() => setMode('buy')}>
              I&apos;m buying
            </button>
            <button type="button" aria-pressed={mode === 'sell'} onClick={() => setMode('sell')}>
              I&apos;m selling
            </button>
          </div>
        )}
      </div>
      <div className="hiw-grid" key={mode}>
        {STEPS[mode].map((s, n) => (
          <div className="hiw-card" key={s.t} style={{ animationDelay: n * 70 + 'ms' }}>
            <div className="hiw-vis">
              <Visual mode={mode} n={n} />
            </div>
            <div className="hiw-txt">
              <span className="hiw-n">{n + 1}</span>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="hiw-cta">
        {mode === 'buy' ? (
          <Link className="btn btn-blue" href="/">
            Find a template
          </Link>
        ) : (
          <Link className="btn btn-blue" href="/sell/new">
            List your first site
          </Link>
        )}
      </div>
    </div>
  );
}

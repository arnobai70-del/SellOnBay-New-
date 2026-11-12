'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { CONFIG, pct, planNetCents } from '@/lib/config';
import { BUILT_IN_STEPS } from '@/lib/howSteps';
import { imageFor, money } from '@/lib/data';

import { T } from '@/components/i18n/T';
import { useTx } from '@/components/i18n/TxProvider';
type Mode = 'buy' | 'sell';

const BARS = [38, 56, 44, 72, 64, 100, 80];

function Visual({ mode, n }: { mode: Mode; n: number }) {
  const a = imageFor('saffron-table');
  const b = imageFor('clinic-desk');
  if (mode === 'buy' && n === 0) {
    return (
      <div className="sob-hv sob-hv-stack" aria-hidden="true">
        {b && (
          <div className="sob-hv-img back">
            <Image src={b.src} alt="" fill sizes="160px" style={{ objectFit: 'cover', objectPosition: 'top' }} />
          </div>
        )}
        {a && (
          <div className="sob-hv-img front">
            <Image src={a.src} alt="" fill sizes="180px" style={{ objectFit: 'cover', objectPosition: 'top' }} />
          </div>
        )}
        <span className="chip mint sob-hv-chip">
          <i />
          <T s={'12 sites ready'} />
        </span>
      </div>
    );
  }
  if (mode === 'buy' && n === 1) {
    return (
      <div className="sob-hv sob-hv-domain" aria-hidden="true">
        <div className="sob-hv-url">
          <span className="sob-hv-type">
            <T s={'yourbusiness.com'} />
          </span>
        </div>
        <span className="chip mint sob-hv-live">
          <i />
          <T s={'Live on your domain'} />
        </span>
      </div>
    );
  }
  if (mode === 'buy') {
    return (
      <div className="sob-hv" aria-hidden="true">
        <div className="sob-hv-card">
          <div className="sob-hv-row">
            <b>
              <T s={'Saffron Table'} />
            </b>
            <span className="status st-wait">
              <i />
              <T s={'Ready to review'} />
            </span>
          </div>
          <div className="sob-hv-timer">47:59:12</div>
          <small className="muted">
            <T s={'left to check it'} />
          </small>
          <span className="btn sm">
            <T s={'Accept site'} />
          </span>
        </div>
      </div>
    );
  }
  if (n === 0) {
    return (
      <div className="sob-hv" aria-hidden="true">
        <div className="sob-hv-card">
          <div className="sob-hv-row">
            <b>
              <T s={'Your price'} />
            </b>
            <b>{money(39)}</b>
          </div>
          <div className="sob-hv-slider">
            <i />
          </div>
          <div className="sob-hv-row">
            <span className="muted">
              <T s={'You keep {v0} (free plan)'} v={{ v0: pct(10_000 - CONFIG.plans.free.commissionBps) }} />
            </span>
            <b className="sob-hv-green">{money(planNetCents(3900) / 100)}</b>
          </div>
        </div>
      </div>
    );
  }
  if (n === 1) {
    return (
      <div className="sob-hv sob-hv-checks" aria-hidden="true">
        <span className="status st-ok">
          <i />
          <T s={'Checked'} />
        </span>
        <span className="status st-ok">
          <i />
          <T s={'Original: 97%'} />
        </span>
        <span className="status st-ok">
          <i />
          <T s={'Demo works'} />
        </span>
        <span className="status st-info">
          <i />
          <T s={'Approved in 24 hours'} />
        </span>
      </div>
    );
  }
  return (
    <div className="sob-hv" aria-hidden="true">
      <div className="sob-hv-card">
        <small className="muted">
          <T s={'Available to withdraw'} />
        </small>
        <div className="sob-hv-timer">{money(642)}</div>
        <div className="sob-hv-bars">
          {BARS.map((h, i) => (
            <i key={i} style={{ height: h + '%' }} />
          ))}
        </div>
        <span className="status st-info">
          <i />
          <T s={'Paid every Thursday'} />
        </span>
      </div>
    </div>
  );
}

export function HowItWorks({
  initial = 'buy',
  toggle = true,
  title = 'Live in three steps',
  steps = BUILT_IN_STEPS,
}: {
  initial?: Mode;
  toggle?: boolean;
  title?: string;
  steps?: Record<Mode, { t: string; d: string }[]>;
}) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const [mode, setMode] = useState<Mode>(initial);
  return (
    <div className="sob-hiw">
      <div className="sob-hiw-head">
        <h2>{title}</h2>
        {toggle && (
          <div className="seg sob-hiw-seg" role="group" aria-label={tx('Who is this for')}>
            <button type="button" aria-pressed={mode === 'buy'} onClick={() => setMode('buy')}>
              <T s={"I'm buying"} />
            </button>
            <button type="button" aria-pressed={mode === 'sell'} onClick={() => setMode('sell')}>
              <T s={"I'm selling"} />
            </button>
          </div>
        )}
      </div>
      <div className="sob-hiw-grid" key={mode}>
        {steps[mode].map((s, n) => (
          <div className="sob-hiw-card" key={s.t} style={{ animationDelay: n * 70 + 'ms' }}>
            <div className="sob-hiw-vis">
              <Visual mode={mode} n={n} />
            </div>
            <div className="sob-hiw-txt">
              <span className="sob-hiw-n">{n + 1}</span>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="sob-hiw-cta">
        {mode === 'buy' ? (
          <Link className="btn" href="/">
            <T s={'Find a template'} />
          </Link>
        ) : (
          <Link className="btn" href="/sell/new">
            <T s={'List your first site'} />
          </Link>
        )}
      </div>
    </div>
  );
}

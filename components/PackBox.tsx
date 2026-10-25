'use client';
import Link from 'next/link';
import { useState } from 'react';
import { trialOf, type Pack } from '@/lib/developers';
import { CONFIG, REVIEW_HOURS } from '@/lib/config';

/* Basic / Standard / Premium, like a gig: pick a tier, see exactly what is in it. */
export function PackBox({
  id,
  packs,
  canHire,
  example = false,
  creditTrial = false,
  trial,
}: {
  id: string;
  packs: Pack[];
  canHire: boolean;
  example?: boolean;
  creditTrial?: boolean;
  trial?: { price: number; days: number };
}) {
  const [i, setI] = useState(1);
  const p = packs[i];
  return (
    <aside className="dv-pack" aria-label="Packages">
      <div className="dv-tabs" role="tablist">
        {packs.map((k, n) => (
          <button key={k.name} type="button" role="tab" aria-selected={n === i} onClick={() => setI(n)}>
            {k.name}
          </button>
        ))}
      </div>
      <div className="dv-pack-body">
        <div className="dv-pack-top">
          <b>{p.blurb}</b>
          <span className="dv-price">${p.price}</span>
        </div>
        <p className="dv-days">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          {p.days} {p.days === 1 ? 'day' : 'days'} delivery
        </p>
        <ul className="dv-feat">
          {p.features.map((f) => (
            <li key={f}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12l5 5 9-10" />
              </svg>
              {f}
            </li>
          ))}
        </ul>
        {canHire ? (
          <Link className="btn btn-blue btn-lg" href={`/developers/${id}/hire?pack=${p.name}`}>
            Continue (${p.price})
          </Link>
        ) : (
          <button type="button" className="btn btn-line btn-lg" disabled>
            {example ? 'Example profile, cannot be hired' : 'Not taking orders now'}
          </button>
        )}
        <p className="dv-safe">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
          </svg>
          Payment is held in escrow until you accept. You have 48 hours to review.
        </p>
      </div>
      {canHire && (
        <div className="dv-trial">
          <div>
            <b>Not sure yet? Start with a paid trial</b>
            <span>
              A small test job, {trialOf({ packs, trial }).days} days, ${trialOf({ packs, trial }).price}. Same escrow and {REVIEW_HOURS}-hour review.
              {creditTrial ? ` If you then start a full project within ${CONFIG.trial.creditWindowDays} days of accepting it, the trial fee comes off the price.` : ''}
            </span>
          </div>
          <Link className="btn btn-line btn-sm" href={`/developers/${id}/hire?pack=Trial`}>
            Start trial (${trialOf({ packs, trial }).price})
          </Link>
        </div>
      )}
    </aside>
  );
}

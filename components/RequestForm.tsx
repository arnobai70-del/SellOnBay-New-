'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BUYER_TIERS, TIER_TEXT, type RequestedTier } from '@/lib/licenceTiers';
import { REQUEST_CONSENT_TEXT } from '@/lib/requests/rules';

import { T } from '@/components/i18n/T';
import { useTx } from '@/components/i18n/TxProvider';
type Pkg = 'asis' | 'setup' | 'custom';
export type RequestProduct = {
  slug: string;
  name: string;
  priceCents: number;
  setupCents: number | null;
  customCents: number | null;
  expressCents: number | null;
  delivery: string;
  needsDomain: boolean;
  needsAppName: boolean;
  needsOses: boolean;
  needsGithub: boolean;
};
const money = (c: number) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0 });

/*
 * The full-page purchase request (owner decision D-E). It sends what the buyer wants and how they will use it; it never sends a price.
 * SellOnBay reviews it and replies with a quotation or a question. The server checks every field again.
 */
export function RequestForm({ p, initialPkg }: { p: RequestProduct; initialPkg: Pkg }) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const router = useRouter();
  const pkgs: [Pkg, string, number | null][] = [
    ['asis', 'As is', 0],
    ['setup', 'With setup help', p.setupCents],
    ['custom', 'With customisation', p.customCents],
  ];
  const offered = pkgs.filter(([k, , c]) => k === 'asis' || !!c);
  const [pkg, setPkg] = useState<Pkg>(offered.some(([k]) => k === initialPkg) ? initialPkg : 'asis');
  const [tier, setTier] = useState<RequestedTier>('single_project');
  const [use, setUse] = useState('');
  const [reqs, setReqs] = useState('');
  const [express, setExpress] = useState(false);
  const [domain, setDomain] = useState('');
  const [appName, setAppName] = useState('');
  const [oses, setOses] = useState<string[]>([]);
  const [github, setGithub] = useState('');
  const [company, setCompany] = useState('');
  const [country, setCountry] = useState('');
  const [taxId, setTaxId] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const listed = p.priceCents + (pkg === 'setup' ? (p.setupCents ?? 0) : pkg === 'custom' ? (p.customCents ?? 0) : 0) + (express && p.expressCents ? p.expressCents : 0);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const r = await fetch('/api/requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        product: p.slug,
        licenceTier: tier,
        package: pkg,
        intendedUse: use,
        requirements: reqs,
        express,
        delivery: { domain, appName, oses, github },
        business: { company, country, taxId },
        consent,
      }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error ?? 'Could not send the request.');
    router.push(`/dashboard/buyer/requests/${j.id}`);
  }

  return (
    <form className="sob-req-form" onSubmit={send} data-request-form>
      <section className="sob-req-sec">
        <h2>
          <T s={'What you want'} />
        </h2>
        <fieldset>
          <legend>
            <T s={'Package'} />
          </legend>
          {offered.map(([k, label, c]) => (
            <label className="opt" key={k}>
              <input type="radio" name="pkg" value={k} checked={pkg === k} onChange={() => setPkg(k)} />
              <span>
                {label} <small className="muted">{k === 'asis' ? money(p.priceCents) : `+${money(c ?? 0)}`}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>
            <T s={'Licence'} />
          </legend>
          {[...BUYER_TIERS, 'exclusive_review' as const].map((t) => (
            <label className="opt" key={t}>
              <input type="radio" name="tier" value={t} checked={tier === t} onChange={() => setTier(t)} />
              <span>
                {TIER_TEXT[t].label}
                <small className="muted">{TIER_TEXT[t].terms}</small>
              </span>
            </label>
          ))}
        </fieldset>
        {p.expressCents ? (
          <label className="opt">
            <input type="checkbox" checked={express} onChange={(e) => setExpress(e.target.checked)} />
            <span>
              <T s={'Ask for express delivery'} />{' '}
              <small className="muted">
                <T s={'+{v0}, if SellOnBay can confirm it'} v={{ v0: money(p.expressCents) }} />
              </small>
            </span>
          </label>
        ) : null}
      </section>

      <section className="sob-req-sec">
        <h2>
          <T s={'How you will use it'} />
        </h2>
        <label htmlFor="rq-use">
          <T s={'Your business and what the product is for'} />
        </label>
        <textarea id="rq-use" required minLength={10} maxLength={1000} rows={4} value={use} onChange={(e) => setUse(e.target.value)} />
        <label htmlFor="rq-reqs">
          <T s={'Anything you need changed or added (optional)'} />
        </label>
        <textarea id="rq-reqs" maxLength={4000} rows={5} value={reqs} onChange={(e) => setReqs(e.target.value)} />
        <small className="muted">
          <T s={'Please do not include email addresses or phone numbers. SellOnBay handles all messages.'} />
        </small>
      </section>

      {(p.needsDomain || p.needsAppName || p.needsOses || p.needsGithub) && (
        <section className="sob-req-sec">
          <h2>
            <T s={'Delivery details'} />
          </h2>
          {p.needsDomain && (
            <>
              <label htmlFor="rq-domain">
                <T s={'Your domain (optional now)'} />
              </label>
              <input id="rq-domain" placeholder={tx('mybusiness.com')} value={domain} onChange={(e) => setDomain(e.target.value)} />
            </>
          )}
          {p.needsAppName && (
            <>
              <label htmlFor="rq-app">
                <T s={'App name'} />
              </label>
              <input id="rq-app" maxLength={30} value={appName} onChange={(e) => setAppName(e.target.value)} />
            </>
          )}
          {p.needsOses && (
            <fieldset>
              <legend>
                <T s={'Computers'} />
              </legend>
              {['Windows', 'macOS', 'Linux'].map((o) => (
                <label className="opt" key={o}>
                  <input type="checkbox" checked={oses.includes(o)} onChange={(e) => setOses(e.target.checked ? [...oses, o] : oses.filter((x) => x !== o))} />
                  <span>{o}</span>
                </label>
              ))}
            </fieldset>
          )}
          {p.needsGithub && (
            <>
              <label htmlFor="rq-gh">
                <T s={'GitHub username (for repository access)'} />
              </label>
              <input id="rq-gh" placeholder={tx('octocat')} value={github} onChange={(e) => setGithub(e.target.value)} />
            </>
          )}
        </section>
      )}

      <section className="sob-req-sec">
        <h2>
          <T s={'Business details (optional)'} />
        </h2>
        <div className="sob-req-grid">
          <div>
            <label htmlFor="rq-co">
              <T s={'Company'} />
            </label>
            <input id="rq-co" maxLength={120} value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          <div>
            <label htmlFor="rq-cc">
              <T s={'Country code'} />
            </label>
            <input id="rq-cc" maxLength={2} placeholder={tx('BD')} value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} />
          </div>
          <div>
            <label htmlFor="rq-tax">
              <T s={'Tax or VAT number'} />
            </label>
            <input id="rq-tax" maxLength={40} value={taxId} onChange={(e) => setTaxId(e.target.value)} />
          </div>
        </div>
      </section>

      <section className="sob-req-sec sob-req-sum">
        <dl className="sob-kv">
          <dt>
            <T s={'Listed price for this choice'} />
          </dt>
          <dd>{tier === 'single_project' ? money(listed) : 'Quoted by SellOnBay'}</dd>
          <dt>
            <T s={'Delivery'} />
          </dt>
          <dd>{p.delivery}</dd>
        </dl>
        <label className="opt">
          <input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>{REQUEST_CONSENT_TEXT}</span>
        </label>
        {error && (
          <p className="note warn" role="alert">
            <span>{error}</span>
          </p>
        )}
        <button className="btn" type="submit" disabled={busy || !consent}>
          {busy ? 'Sending...' : 'Send request'}
        </button>
      </section>
    </form>
  );
}

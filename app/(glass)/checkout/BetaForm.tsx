'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BETA_NOTICE_TEXT } from '@/lib/config';
import { COUNTRIES } from '@/lib/countries';
import { clearCart } from '@/lib/glass/cart';
import { useTx } from '@/components/i18n/TxProvider';

const SR: React.CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' };

/*
 * The checkout of design-reference/checkout.html in the free beta: your details, the domain, and in the payment card an honest notice instead of a
 * card form (nothing is charged), the summary beside it with the terms box and Send request (/api/beta/requests).
 */
export function BetaForm({ ids, name, email, summary, steps }: { ids: string[]; name: string; email: string; summary: React.ReactNode; steps: string[] }) {
  const router = useRouter();
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  // country names in the page's language from the browser (Intl), after the first paint so the server's English matches; English if it cannot
  const [names, setNames] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    const lang = document.documentElement.lang || 'en';
    if (lang === 'en') return;
    try {
      const d = new Intl.DisplayNames([lang], { type: 'region' });
      setNames(Object.fromEntries(COUNTRIES.map((c) => [c.code, d.of(c.code) ?? c.name])));
    } catch {
      /* this browser cannot name regions: English stays */
    }
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [own, setOwn] = useState(false);
  return (
    <form
      style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        const form = Object.fromEntries(new FormData(e.currentTarget));
        delete form.agree;
        delete form.own;
        const res = await fetch('/api/beta/requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...form, ids }) }).catch(() => null);
        const data = ((await res?.json().catch(() => null)) ?? {}) as { error?: string; orders?: string[] };
        if (res?.ok && data.orders?.length) {
          clearCart();
          router.push(`/checkout/success?order=${data.orders[0]}&n=${data.orders.length}`);
          return;
        }
        setBusy(false);
        setError(data.error ?? tx('Could not send your request. Please try again.'));
      }}
    >
      <div style={{ flex: '999 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="glass" style={{ padding: 26, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 style={{ fontSize: 20 }}>{tx('Your details')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 14 }}>
            <div className="field">
              <label htmlFor="n">{tx('Full name')}</label>
              <input id="n" name="name" className="input" placeholder={tx('Your name')} required maxLength={100} defaultValue={name} autoComplete="name" />
            </div>
            <div className="field">
              <label htmlFor="e">{tx('Email')}</label>
              <input id="e" name="email" className="input" type="email" placeholder="you@example.com" required maxLength={254} defaultValue={email} autoComplete="email" />
            </div>
            <div className="field">
              <label htmlFor="ct">{tx('Country')}</label>
              <select id="ct" name="country" className="input" required defaultValue="" autoComplete="country">
                <option value="" disabled>
                  {tx('Choose your country')}
                </option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {names?.[c.code] ?? c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="co">{tx('Company (optional)')}</label>
              <input id="co" name="company" className="input" maxLength={120} autoComplete="organization" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="uf">{tx('What will you use it for?')}</label>
            <textarea id="uf" name="useFor" className="input" required minLength={3} maxLength={1000} />
          </div>
        </div>
        <div className="glass" style={{ padding: 26, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <h2 style={{ fontSize: 20 }}>{tx('Domain')}</h2>
            <div className="muted" style={{ fontSize: 14, marginTop: 6 }}>
              {tx('Registered in your own name. You own it, not the seller. We check availability by hand.')}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label htmlFor="d" style={SR}>
              {tx('Domain name')}
            </label>
            <input id="d" name="domain" className="input" placeholder="yourbrand.com" maxLength={253} style={{ flex: '1 1 240px' }} />
            <Link className="btn ghost" href="/domains" prefetch={false}>
              {tx('Find a domain')}
            </Link>
          </div>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, color: '#3D5563', minHeight: 40 }}>
            <input type="checkbox" name="own" checked={own} onChange={(e) => setOwn(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#3F8F77' }} /> {tx('I already have a domain')}
          </label>
          {own && <div className="tag">{tx('Write the domain you own above; the seller connects it for you.')}</div>}
        </div>
        <div className="glass" style={{ padding: 26, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 style={{ fontSize: 20 }}>{tx('Payment method')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(160px, 100%), 1fr))', gap: 12 }}>
            <div className="pay on">
              <span style={{ fontWeight: 500 }}>{tx('Free beta')}</span>
              <span className="tag">{tx('Nothing is charged')}</span>
            </div>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
            {BETA_NOTICE_TEXT}
          </p>
        </div>
      </div>
      <aside style={{ flex: '1 1 300px', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="glass" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {summary}
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: '#3D5563', lineHeight: 1.5 }}>
            <input type="checkbox" name="agree" required style={{ width: 18, height: 18, accentColor: '#3F8F77', marginTop: 1, flex: 'none' }} />
            <span>
              {tx('I agree to the')} <Link href="/legal/terms">{tx('Terms')}</Link>, <Link href="/legal/refunds">{tx('Refund policy')}</Link> {tx('and')}{' '}
              <Link href="/legal/licenses">{tx('License')}</Link>
            </span>
          </label>
          <button className="btn" type="submit" style={{ width: '100%' }} disabled={busy}>
            {busy ? tx('Sending') : tx('Send request')}
          </button>
          {error && (
            <div className="tag" style={{ margin: 0, color: '#7A2E24' }} role="alert">
              {error}
            </div>
          )}
          <Link href="/cart" style={{ fontSize: 13, textAlign: 'center' }} prefetch={false}>
            {tx('Back to cart')}
          </Link>
        </div>
        <div className="glass" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontWeight: 500 }}>{tx('What happens next')}</div>
          {steps.map((s, i) => (
            <div key={s} className="tl">
              <i style={i ? { background: ['#A9D4C5', '#CDE6DD', '#DCEBE5'][i - 1] } : undefined} /> <span>{s}</span>
            </div>
          ))}
        </div>
      </aside>
    </form>
  );
}

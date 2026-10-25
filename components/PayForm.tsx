'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DEMO_OTP, TEST_CARDS } from '@/lib/commerce/testcards';
import type { Line } from '@/lib/commerce/types';

const money = (c: number) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0 });
const group = (v: string) =>
  v
    .replace(/\D/g, '')
    .slice(0, 16)
    .replace(/(.{4})/g, '$1 ')
    .trim();
const expFmt = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? d.slice(0, 2) + ' / ' + d.slice(2) : d;
};

export function PayForm({ id, title, lines, totalCents, back }: { id: string; title: string; lines: Line[]; totalCents: number; back: string }) {
  const router = useRouter();
  const [num, setNum] = useState('');
  const [exp, setExp] = useState('');
  const [cvc, setCvc] = useState('');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'card' | 'otp'>('card');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const fill = (n: string) => {
    setNum(group(n));
    setExp('12 / 34');
    setCvc('123');
    setName('Test Buyer');
    setErr('');
    setStep('card');
  };
  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    const digits = num.replace(/\D/g, '');
    // Real card numbers never leave the browser: only the test cards are sent.
    if (!TEST_CARDS[digits]) return setErr('This is a demo gateway. Use one of the test cards below, never a real card.');
    setBusy(true);
    const res = await fetch(`/api/demo/orders/${id}/pay`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ card: { number: digits, exp, cvc, name }, otp: step === 'otp' ? otp : undefined }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.status === 202) {
      setStep('otp');
      return;
    }
    if (!res.ok) return setErr(body.error ?? 'Payment failed. Try again.');
    router.push(`/orders/${id}?paid=1`);
  }

  return (
    <div className="pay">
      <div className="pay-bar">
        <Link href={back} className="pay-back">
          &lsaquo; Back
        </Link>
        <span className="pay-test">Demo gateway. No real money moves.</span>
      </div>
      <div className="pay-grid">
        <aside className="pay-sum" aria-label="Order summary">
          <p className="pay-for">Pay SellOnBay</p>
          <p className="pay-total">{money(totalCents)}</p>
          <h1>{title}</h1>
          <ul>
            {lines.map(([l, c]) => (
              <li key={l}>
                <span>{l}</span>
                <b>{money(c)}</b>
              </li>
            ))}
          </ul>
          <div className="pay-hold">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
            </svg>
            <span>Example only: payment and escrow are simulated. No real money or seller payout occurs.</span>
          </div>
        </aside>

        <form className="pay-form" onSubmit={pay} noValidate>
          <h2>Pay with card</h2>
          <div className="pay-tests" role="group" aria-label="Test cards">
            <span>Try a test card</span>
            {Object.entries(TEST_CARDS).map(([n, t]) => (
              <button key={n} type="button" onClick={() => fill(n)} title={t.note}>
                {t.label}
              </button>
            ))}
          </div>
          {step === 'card' ? (
            <>
              <label className="field">
                <span>Card number</span>
                <input inputMode="numeric" autoComplete="off" placeholder="4242 4242 4242 4242" value={num} onChange={(e) => setNum(group(e.target.value))} aria-label="Card number" />
              </label>
              <div className="two">
                <label className="field">
                  <span>Expiry</span>
                  <input inputMode="numeric" autoComplete="off" placeholder="MM / YY" value={exp} onChange={(e) => setExp(expFmt(e.target.value))} aria-label="Expiry" />
                </label>
                <label className="field">
                  <span>Security code</span>
                  <input inputMode="numeric" autoComplete="off" placeholder="123" maxLength={4} value={cvc} onChange={(e) => setCvc(e.target.value.replace(/\D/g, ''))} aria-label="Security code" />
                </label>
              </div>
              <label className="field">
                <span>Name on card</span>
                <input autoComplete="off" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name on card" />
              </label>
            </>
          ) : (
            <div className="pay-otp">
              <b>Confirm with your bank</b>
              <p>
                Your bank sent a code. In this demo the code is <code>{DEMO_OTP}</code>.
              </p>
              <label className="field">
                <span>Code</span>
                <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} aria-label="Bank code" autoFocus />
              </label>
            </div>
          )}
          {err && (
            <p className="form-err" role="alert">
              {err}
            </p>
          )}
          <button className="btn btn-blue btn-lg" type="submit" disabled={busy}>
            {busy ? 'Processing…' : step === 'otp' ? 'Confirm and pay ' + money(totalCents) : 'Pay ' + money(totalCents)}
          </button>
          <p className="pay-fine">Demo only. We refuse real card numbers.</p>
        </form>
      </div>
    </div>
  );
}

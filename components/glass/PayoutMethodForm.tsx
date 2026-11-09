'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const HINT: Record<string, [label: string, hint: string]> = {
  paypal: ['PayPal email', 'The email of your PayPal account'],
  payoneer: ['Payoneer email', 'The email of your Payoneer account'],
  wise: ['Wise email', 'The email of your Wise account'],
  bank: ['Bank details', 'IBAN or account number, bank name and account holder'],
  bkash: ['bKash number', 'Personal or merchant number'],
};

/*
 * "Payout method" of design-reference/seller-payouts.html: the design's .pm tiles for the methods open to the seller's country (lib/payoutDetails.ts),
 * the account, and Save (/api/seller/payout, the same as before; we email the seller whenever it changes).
 */
export function PayoutMethodForm({ methods, current }: { methods: [string, string][]; current: string | null }) {
  const router = useRouter();
  const [method, setMethod] = useState(methods[0]?.[0] ?? '');
  const [account, setAccount] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [label, hint] = HINT[method] ?? ['Account', 'Where to send it'];
  return (
    <section className="glass card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2>Payout method</h2>
      <div className="tag" style={{ margin: 0 }}>
        Now: {current ?? 'not set yet. Add it so your weekly payouts can be sent.'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }} role="radiogroup" aria-label="How you want to be paid">
        {methods.map(([m, l]) => (
          <button key={m} type="button" className={m === method ? 'pm on' : 'pm'} role="radio" aria-checked={m === method} onClick={() => setMethod(m)}>
            <b style={{ fontWeight: 500 }}>{l}</b>
            <span className="tag" style={{ margin: 0 }}>
              {HINT[m]?.[1] ?? ''}
            </span>
          </button>
        ))}
      </div>
      <div className="field">
        <label htmlFor="ac">{label}</label>
        <input id="ac" className="input" value={account} onChange={(e) => setAccount(e.target.value)} placeholder={hint} maxLength={300} />
      </div>
      <div style={{ padding: '12px 14px', borderRadius: 12, background: '#FBF3E3', border: '1px solid #F0DDB4', fontSize: 13, color: '#6E4B12' }}>
        We email you whenever these details change, so nobody can move your money quietly.
      </div>
      <button
        className="btn"
        type="button"
        style={{ alignSelf: 'flex-start' }}
        disabled={busy || !method || account.trim().length < 3}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          const r = await fetch('/api/seller/payout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method, account }) }).catch(() => null);
          const j = r ? await r.json().catch(() => ({})) : {};
          setBusy(false);
          if (!r?.ok) return setMsg({ ok: false, text: j.error ?? 'Could not save. Try again.' });
          setMsg({ ok: true, text: 'Saved.' });
          setAccount('');
          router.refresh();
        }}
      >
        {busy ? 'Saving' : 'Save payout method'}
      </button>
      {msg && (
        <p className="tag" style={{ margin: 0, color: msg.ok ? '#1A5444' : '#7A2E24' }} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}
    </section>
  );
}

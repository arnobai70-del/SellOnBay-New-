'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { T } from '@/components/i18n/T';
import { useTx } from '@/components/i18n/TxProvider';
/*
 * "POS · Manual order" of design-reference/admin-orders.html. It posts to the same cash desk as before (/api/admin/pos, Finance, live payments
 * only): the buyer's account email, the listing, the cash taken and the receipt number. The split shown is the flat fee from lib/config.ts.
 */
export function PosForm({ items, keepBps, reviewHours, open }: { items: { key: string; name: string; priceCents: number }[]; keepBps: number; reviewHours: number; open: boolean }) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [key, setKey] = useState(items[0]?.key ?? '');
  const [amount, setAmount] = useState(items[0] ? (items[0].priceCents / 100).toFixed(2) : '');
  const [receipt, setReceipt] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const cents = Math.round(Number(amount) * 100) || 0;
  const seller = Math.round((cents * keepBps) / 10_000);
  const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
  async function send() {
    setBusy(true);
    setMsg(null);
    const r = await fetch('/api/admin/pos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ buyerEmail: email, productKey: key, amount, receipt }) }).catch(
      () => null,
    );
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) return setMsg({ ok: false, text: j.error ?? 'Could not reach SellOnBay. Try again.' });
    setMsg({ ok: true, text: 'Cash recorded and the order created.' });
    setEmail('');
    setReceipt('');
    router.refresh();
  }
  return (
    <section id="pos" className="glass card" style={{ flex: '1 1 340px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h2>
          <T s={'POS · Manual order'} />
        </h2>
        <div className="tag">{open ? tx('For cash taken in person. Cash is held like a verified transfer.') : tx('Opens when live payments are on. In the free beta nothing is charged.')}</div>
      </div>
      <div className="field">
        <label htmlFor="be">
          <T s={'Buyer email'} />
        </label>
        <input id="be" className="input" placeholder="buyer@example.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!open} />
      </div>
      <div className="field">
        <label htmlFor="it">
          <T s={'Website or domain'} />
        </label>
        <select
          id="it"
          className="input"
          value={key}
          disabled={!open || !items.length}
          onChange={(e) => {
            setKey(e.target.value);
            const p = items.find((i) => i.key === e.target.value);
            if (p) setAmount((p.priceCents / 100).toFixed(2));
          }}
        >
          {items.length ? (
            items.map((i) => (
              <option key={i.key} value={i.key}>
                {i.name} · {usd(i.priceCents)}
              </option>
            ))
          ) : (
            <option value="">
              <T s={'No live websites yet'} />
            </option>
          )}
        </select>
      </div>
      <div>
        <div style={{ fontSize: 13, color: '#3D5563', marginBottom: 6 }}>
          <T s={'Payment method'} />
        </div>
        <div className="seg">
          <button type="button" className="on" aria-pressed="true">
            <T s={'Cash'} />
          </button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
        <div className="field">
          <label htmlFor="am">
            <T s={'Amount'} />
          </label>
          <input id="am" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={!open} />
        </div>
        <div className="field">
          <label htmlFor="tx">
            <T s={'Receipt number'} />
          </label>
          <input id="tx" className="input" placeholder="e.g. R-1001" maxLength={40} value={receipt} onChange={(e) => setReceipt(e.target.value)} disabled={!open} />
        </div>
      </div>
      <div style={{ padding: 14, borderRadius: 14, background: 'rgba(255,255,255,.7)', border: '1px solid #DCE7EC', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
        <div className="row">
          <span className="muted">
            <T s={'Seller gets ({v0}%)'} v={{ v0: keepBps / 100 }} />
          </span>
          <span>{usd(seller)}</span>
        </div>
        <div className="row">
          <span className="muted">
            <T s={'Platform share ({v0}%)'} v={{ v0: 100 - keepBps / 100 }} />
          </span>
          <span>{usd(cents - seller)}</span>
        </div>
        <div className="row">
          <span className="muted">
            <T s={'Escrow'} />
          </span>
          <span>
            <T s={'{reviewHours}-hour review starts on delivery'} v={{ reviewHours }} />
          </span>
        </div>
      </div>
      <button className="btn" type="button" onClick={send} disabled={!open || busy || !email || !key || !receipt}>
        {busy ? tx('One moment...') : tx('Create order')}
      </button>
      {msg && (
        <p className="tag" style={{ color: msg.ok ? '#1A5444' : '#7A2E24' }} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}
    </section>
  );
}

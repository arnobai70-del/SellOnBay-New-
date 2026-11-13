'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useTx } from '@/components/i18n/TxProvider';
import { T } from '@/components/i18n/T';
type Method = { id: string; label: string; kind: string; instructions: string; currency: string };

/*
 * The buyer reports a bank transfer or wallet payment they made. This is a report, not a payment: SellOnBay's Finance team checks it against
 * the money that actually arrived before the order counts as paid. The server checks every field again.
 */
export function ManualPayForm({ orderId, methods, dueCents, code }: { orderId: string; methods: Method[]; dueCents: number; code: string }) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const router = useRouter();
  const [methodId, setMethodId] = useState(methods[0]?.id ?? '');
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState((dueCents / 100).toFixed(2));
  const [paidOn, setPaidOn] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const method = methods.find((m) => m.id === methodId);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (proof && proof.size > 5 * 1024 * 1024) return setMsg({ ok: false, text: 'The proof can be at most 5 MB.' });
    setBusy(true);
    const body = new FormData();
    body.append('methodId', methodId);
    body.append('reference', reference);
    body.append('amountCents', String(Math.round(Number(amount) * 100)));
    body.append('paidOn', paidOn);
    if (proof) body.append('proof', proof);
    const r = await fetch(`/api/orders/${orderId}/payments`, { method: 'POST', body });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: j.error ?? 'Could not send the payment report.' });
    setReference('');
    setProof(null);
    setMsg({ ok: true, text: 'Thank you. SellOnBay will check the payment against the money received and tell you.' });
    router.refresh();
  }

  if (!methods.length)
    return (
      <p className="note warn" role="note">
        <span>
          <T s={'No payment method is open yet. SellOnBay will contact you with payment instructions.'} />
        </span>
      </p>
    );
  return (
    <form className="sob-req-sec" onSubmit={send} data-manual-pay>
      <h2>
        <T s={'Pay and tell us'} />
      </h2>
      <label htmlFor="mp-method">
        <T s={'How you pay'} />
      </label>
      <select id="mp-method" value={methodId} onChange={(e) => setMethodId(e.target.value)}>
        {methods.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      {method && (
        <div className="sob-pay-instr">
          <p style={{ whiteSpace: 'pre-wrap' }}>{method.instructions}</p>
          <p>
            <T s={'Write'} /> <b>{code}</b> <T s={'as the payment reference or note, and send'} /> <b>{(dueCents / 100).toFixed(2)}</b> {method.currency}.
          </p>
        </div>
      )}
      <label htmlFor="mp-ref">
        <T s={'Transaction reference from your bank or wallet'} />
      </label>
      <input id="mp-ref" required minLength={3} maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} />
      <div className="sob-req-grid">
        <div>
          <label htmlFor="mp-amount">
            <T s={'Amount you sent'} />
          </label>
          <input id="mp-amount" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <label htmlFor="mp-date">
            <T s={'Date you paid'} />
          </label>
          <input id="mp-date" type="date" required value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </div>
      </div>
      <label htmlFor="mp-proof">
        <T s={'Receipt or screenshot (PNG, JPEG, WebP or PDF, up to 5 MB; optional)'} />
      </label>
      <input id="mp-proof" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => setProof(e.target.files?.[0] ?? null)} />
      <button className="btn sm" type="submit" disabled={busy}>
        {busy ? tx('Sending...') : tx('Send payment report')}
      </button>
      {msg && (
        <p className={msg.ok ? 'note' : 'note warn'} role={msg.ok ? 'status' : 'alert'}>
          <span>{msg.text}</span>
        </p>
      )}
    </form>
  );
}

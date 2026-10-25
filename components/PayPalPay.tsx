'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Line } from '@/lib/commerce/types';

const money = (c: number) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0 });

/* The real payment page: what the buyer pays for, then PayPal. The price shown is the one the server holds; PayPal gets it from the server too. */
export function PayPalPay({ id, title, lines, totalCents, back, notice }: { id: string; title: string; lines: Line[]; totalCents: number; back: string; notice?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(notice ?? '');
  const pay = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await fetch('/api/paypal/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: id }) });
      const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string; already?: boolean };
      if (j.url) {
        window.location.assign(j.url);
        return;
      }
      if (j.already) {
        router.push(`/orders/${id}`);
        return;
      }
      setErr(j.error ?? 'Something went wrong. Nothing was charged.');
    } catch {
      setErr('Could not reach the payment page. Nothing was charged.');
    }
    setBusy(false);
  };
  return (
    <div className="wrap" style={{ paddingBlock: 60, maxWidth: 640 }}>
      <h1>Pay for your order</h1>
      <p className="muted" style={{ marginTop: 12 }}>
        {title}
      </p>
      <ul className="lst" style={{ marginTop: 16 }}>
        {lines.map(([label, cents]) => (
          <li key={label}>
            <div className="grow">{label}</div>
            <b>{money(cents)}</b>
          </li>
        ))}
        <li>
          <div className="grow">
            <b>Total</b>
          </div>
          <b>{money(totalCents)}</b>
        </li>
      </ul>
      <p className="muted" style={{ marginTop: 12 }}>
        You pay with PayPal. The money is held until you accept the work, and only then is it released to the seller.
      </p>
      {err && (
        <p className="err" role="alert" style={{ marginTop: 12 }}>
          {err}
        </p>
      )}
      <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
        <button className="btn btn-blue" type="button" onClick={pay} disabled={busy}>
          {busy ? 'Opening PayPal…' : 'Pay with PayPal'}
        </button>
        <Link className="btn btn-line" href={back}>
          Back
        </Link>
      </div>
    </div>
  );
}

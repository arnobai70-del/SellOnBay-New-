'use client';
import { useState } from 'react';
import { CONFIG, PLAN_KEEP_TEXT, planNetCents } from '@/lib/config';

const money = (cents: number) => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* The design's .calc card (design-reference/sell.html), worked out with the same function the rest of the site uses for the seller's share. */
export function Earnings() {
  const min = CONFIG.sale.priceMinCents / 100;
  const [price, setPrice] = useState(String(Math.max(49, min)));
  const [sales, setSales] = useState('10');
  const p = Math.max(0, Math.round((Number(price.replace(/[$,]/g, '')) || 0) * 100));
  const n = Math.max(0, Math.floor(Number(sales) || 0));
  const each = planNetCents(p);
  return (
    <div className="glass calc" style={{ flex: '1 1 340px' }} aria-label="Earnings calculator">
      <div style={{ fontWeight: 500 }}>Earnings calculator</div>
      <div className="field">
        <label htmlFor="pr">Your website price (USD, from ${min})</label>
        <input id="pr" className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="sl">Sales per month</label>
        <input id="sl" className="input" inputMode="numeric" value={sales} onChange={(e) => setSales(e.target.value)} />
      </div>
      <div style={{ borderTop: '1px solid #DEE8ED', paddingTop: 14 }} aria-live="polite">
        <div className="tag" style={{ margin: 0 }}>
          You earn per month
        </div>
        <div className="big">{money(each * n)}</div>
        <div className="tag">
          {money(each)} per sale · {PLAN_KEEP_TEXT} share · before any fee your bank or payout provider charges
        </div>
      </div>
    </div>
  );
}

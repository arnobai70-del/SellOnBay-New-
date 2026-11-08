'use client';
import { useState } from 'react';
import { Field } from '@/components/glass/Field';
import { GlassCard } from '@/components/glass/GlassCard';
import { CONFIG, PLAN_KEEP_TEXT, planNetCents } from '@/lib/config';

const money = (cents: number) => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* The earnings calculator. Worked out with the same function the rest of the site uses for the seller's share. */
export function Earnings() {
  const min = CONFIG.sale.priceMinCents / 100;
  const [price, setPrice] = useState(String(Math.max(49, min)));
  const [sales, setSales] = useState('10');
  const p = Math.max(0, Math.round((Number(price) || 0) * 100));
  const n = Math.max(0, Math.floor(Number(sales) || 0));
  const each = planNetCents(p);
  return (
    <GlassCard as="section" rise={false} aria-label="Earnings calculator">
      <h2>Earnings calculator</h2>
      <div className="g-grid2" style={{ marginTop: 14 }}>
        <Field label="Your website price (USD)" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} hint={`From $${min}`} />
        <Field label="Sales per month" inputMode="numeric" value={sales} onChange={(e) => setSales(e.target.value)} />
      </div>
      <div style={{ marginTop: 14 }} aria-live="polite">
        <div className="g-tag">You earn per month</div>
        <div style={{ fontSize: 32, fontWeight: 300 }}>{money(each * n)}</div>
        <div className="g-tag">
          {money(each)} per sale · {PLAN_KEEP_TEXT} share · before any fee your bank or payout provider charges
        </div>
      </div>
    </GlassCard>
  );
}

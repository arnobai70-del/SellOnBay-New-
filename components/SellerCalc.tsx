'use client';
import { useState } from 'react';
import { money } from '@/lib/data';
import { sellerNetCents } from '@/lib/config';

/* The seller keeps the price minus the sale fee from lib/config.ts. */
export function SellerCalc() {
  const [price, setPrice] = useState(39);
  const [sales, setSales] = useState(10);
  return (
    <div className="calc" id="calc">
      <label htmlFor="calc-range">
        If you price a site at <b>{money(price)}</b>
      </label>
      <input id="calc-range" type="range" min={9} max={150} value={price} onChange={(e) => setPrice(+e.target.value)} />
      <label htmlFor="calc-n">
        and sell it <b>{sales}</b> times a month
      </label>
      <input id="calc-n" type="range" min={1} max={60} value={sales} onChange={(e) => setSales(+e.target.value)} />
      <p className="muted" style={{ marginTop: 6 }}>
        you earn
      </p>
      <div className="big">
        <span>{'$' + ((sellerNetCents(price * 100, 'sale') * sales) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        <span style={{ fontSize: '1.1rem', fontWeight: 600, letterSpacing: 0 }}> a month</span>
      </div>
    </div>
  );
}

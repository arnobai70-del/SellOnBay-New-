'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { addToCart, removeFromCart, useCart } from '@/lib/glass/cart';

export type CartItem = { id: string; name: string; seller: string; priceCents: number; wasCents?: number | null; priceNote?: string | null; requestable: boolean };
const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const TINTS = ['#D3EEE4', '#DDEAF6', '#E6E2F4', '#F1E8DD'];

/*
 * design-reference/cart.html. The cart lives in this browser (lib/glass/cart.ts); names and prices come from the server (/api/cart). Only
 * websites that can be requested go on to checkout. In the free beta nothing is charged.
 */
export function CartClient({ add, reviewHours }: { add?: string; reviewHours: number }) {
  const ids = useCart();
  const [loaded, setLoaded] = useState<{ key: string; items: CartItem[]; beta: boolean } | null>(null);
  const key = ids.join(',');
  useEffect(() => {
    if (add) addToCart(add);
  }, [add]);
  useEffect(() => {
    let live = true;
    fetch('/api/cart', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: key ? key.split(',') : [] }) })
      .then((r) => r.json())
      .then((d: { items?: CartItem[]; beta?: boolean }) => {
        if (live) setLoaded({ key, items: d.items ?? [], beta: !!d.beta });
      })
      .catch(() => {
        if (live) setLoaded({ key, items: [], beta: true });
      });
    return () => {
      live = false;
    };
  }, [key]);
  const items = loaded?.items ?? [];
  const beta = loaded?.beta ?? true;
  const ready = items.filter((i) => i.requestable);
  const total = ready.reduce((s, i) => s + i.priceCents, 0);
  return (
    <>
      <header className="pagehead">
        <h1>Your cart</h1>
        <div className="tag">{loaded ? `${items.length} ${items.length === 1 ? 'item' : 'items'} · checkout with escrow protection` : 'Loading your cart…'}</div>
      </header>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '999 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <section className="glass card" style={{ padding: '8px 24px' }}>
            {!loaded ? (
              <p className="muted" style={{ margin: '14px 0' }}>
                Loading your cart.
              </p>
            ) : items.length ? (
              items.map((i, n) => (
                <div key={i.id} className="it">
                  <span className="th" aria-hidden="true">
                    <span style={{ width: 16, borderRadius: 3, background: '#EAF1F4' }} />
                    <span style={{ flex: 1, borderRadius: 3, background: TINTS[n % TINTS.length] }} />
                  </span>
                  <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>{i.name}</div>
                    <div className="tag">
                      Standard license · by {i.seller}
                      {!i.requestable ? ' · available after beta' : ''}
                    </div>
                    {i.priceNote && <div className="tag">{i.priceNote}</div>}
                  </div>
                  <div style={{ fontWeight: 500, width: 90, textAlign: 'right' }}>
                    {i.wasCents ? (
                      <s className="muted" style={{ display: 'block', fontWeight: 400, fontSize: 13 }}>
                        {money(i.wasCents)}
                      </s>
                    ) : null}
                    {money(i.priceCents)}
                  </div>
                  <button className="btn sm ghost" type="button" onClick={() => removeFromCart(i.id)} aria-label={`Remove ${i.name}`}>
                    Remove
                  </button>
                </div>
              ))
            ) : (
              <div className="it">
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>Your cart is empty</div>
                  <div className="tag">Add a website from its page.</div>
                </div>
                <Link className="btn sm" href="/websites">
                  Browse websites
                </Link>
              </div>
            )}
          </section>
          <section className="glass card" style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1A5444" strokeWidth="1.7" aria-hidden="true">
              <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            <div style={{ flex: '1 1 260px' }}>
              <div style={{ fontWeight: 500 }}>Protected by escrow</div>
              <div className="muted" style={{ fontSize: 14, lineHeight: 1.55, marginTop: 4 }}>
                The seller is paid only after your {reviewHours}-hour review. <Link href="/buyer-protection">How it works</Link>
              </div>
            </div>
          </section>
        </div>
        <aside className="glass card" style={{ flex: '1 1 320px', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ fontSize: 20 }}>Summary</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <label htmlFor="cp" className="hidden-label">
              Coupon code
            </label>
            <input id="cp" className="input" placeholder="Coupon code" disabled={beta} />
            <button className="btn ghost" type="button" disabled>
              Apply
            </button>
          </div>
          <div className="tag" style={{ margin: 0 }}>
            {beta ? 'Coupons apply once live payments open. In the beta nothing is charged.' : 'Enter your coupon on the payment step.'}
          </div>
          <div style={{ borderTop: '1px solid #DEE8ED', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="sum">
              <span className="muted">Subtotal</span>
              <span>{money(total)}</span>
            </div>
            {beta && (
              <div className="sum">
                <span className="muted">Free during beta</span>
                <span>−{money(total)}</span>
              </div>
            )}
            <div className="sum">
              <span className="muted">Escrow protection</span>
              <span>Included</span>
            </div>
          </div>
          <div className="sum" style={{ fontSize: 18, borderTop: '1px solid #DEE8ED', paddingTop: 12 }}>
            <span>Total</span>
            <b style={{ fontWeight: 500 }}>{money(beta ? 0 : total)}</b>
          </div>
          {ready.length ? (
            <Link className="btn" href={`/checkout?ids=${encodeURIComponent(ready.map((i) => i.id).join(','))}`} style={{ width: '100%' }} data-track="checkout">
              Go to checkout
            </Link>
          ) : (
            <button className="btn" type="button" disabled style={{ width: '100%' }}>
              {items.length ? 'Available after beta' : 'Go to checkout'}
            </button>
          )}
          <div className="tag" style={{ textAlign: 'center', margin: 0 }}>
            {beta ? 'Beta: free in exchange for your feedback. No payment is taken.' : 'Card or bank transfer'}
          </div>
        </aside>
      </div>
    </>
  );
}

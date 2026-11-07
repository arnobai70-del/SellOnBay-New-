'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/glass/Button';
import { GlassCard } from '@/components/glass/GlassCard';
import { StatusPill } from '@/components/glass/StatusPill';
import { addToCart, removeFromCart, useCart } from '@/lib/glass/cart';

export type CartItem = { id: string; name: string; seller: string; priceCents: number; requestable: boolean };
const money = (c: number) => `$${(c / 100).toFixed(2)}`;

/* Names and prices come from the server. Only websites that can be requested go on to checkout. */
export function CartClient({ add }: { add?: string }) {
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
  if (!loaded) return <p className="g-muted">Loading your cart.</p>;
  const { items, beta } = loaded;
  const ready = items.filter((i) => i.requestable);
  const total = ready.reduce((s, i) => s + i.priceCents, 0);
  if (!items.length)
    return (
      <GlassCard>
        <h2>Your cart is empty</h2>
        <div style={{ marginTop: 14 }}>
          <Button href="/websites">Browse websites</Button>
        </div>
      </GlassCard>
    );
  return (
    <div className="g-layout-buy">
      <div className="g-stack" style={{ minWidth: 0 }}>
        {items.map((i) => (
          <GlassCard key={i.id} as="article" rise={false} className="g-row">
            <div style={{ minWidth: 0 }}>
              <h2>{i.name}</h2>
              <div className="g-tag">Standard licence · by {i.seller}</div>
              {!i.requestable && (
                <p style={{ marginTop: 8 }}>
                  <StatusPill tone="draft">Available after beta</StatusPill>
                </p>
              )}
            </div>
            <div className="g-row">
              <span style={{ fontWeight: 500 }}>{money(i.priceCents)}</span>
              <Button variant="ghost" size="sm" onClick={() => removeFromCart(i.id)} aria-label={`Remove ${i.name}`}>
                Remove
              </Button>
            </div>
          </GlassCard>
        ))}
      </div>
      <GlassCard as="section" rise={false} className="g-sticky">
        <h2>Summary</h2>
        <div className="g-li" style={{ marginTop: 10 }}>
          <span style={{ flex: 1, fontSize: 14 }}>Subtotal</span>
          {money(total)}
        </div>
        {beta && (
          <div className="g-li">
            <span style={{ flex: 1, fontSize: 14 }}>Free during beta</span>−{money(total)}
          </div>
        )}
        <div className="g-li">
          <b style={{ flex: 1, fontWeight: 500 }}>Total</b>
          <b style={{ fontWeight: 500 }}>{money(beta ? 0 : total)}</b>
        </div>
        <div style={{ marginTop: 14 }}>
          {ready.length ? (
            <Button href={`/checkout?ids=${encodeURIComponent(ready.map((i) => i.id).join(','))}`} style={{ width: '100%' }}>
              Go to checkout
            </Button>
          ) : (
            <Button disabled style={{ width: '100%' }}>
              Available after beta
            </Button>
          )}
        </div>
        {beta && (
          <p className="g-tag" style={{ marginTop: 10 }}>
            Beta: free in exchange for your feedback. No payment is taken.
          </p>
        )}
      </GlassCard>
    </div>
  );
}

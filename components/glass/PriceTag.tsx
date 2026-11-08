import type { Product } from '@/lib/data';

const usd = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;

/*
 * A listing's price (owner, 2026-11-08). A real sale shows the struck-through price only when the history allows it (lib/prices/rules.ts), and
 * a launch price shows its note; nothing is ever struck through by hand. `big` is the website page's large price.
 */
export function PriceTag({ p, big = false }: { p: Pick<Product, 'price' | 'sale'>; big?: boolean }) {
  return (
    <span className={`g-price${big ? ' g-price-big' : ''}`}>
      {p.sale?.wasCents && (
        <s className="g-price-was" aria-label={`Was ${usd(p.sale.wasCents)}`}>
          {usd(p.sale.wasCents)}
        </s>
      )}
      <span>${p.price}</span>
      {p.sale?.badge && <span className="status st-ok g-price-badge">{p.sale.badge}</span>}
      {p.sale?.note && <span className="g-price-note">{p.sale.note}</span>}
    </span>
  );
}

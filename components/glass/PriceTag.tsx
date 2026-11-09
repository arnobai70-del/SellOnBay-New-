import type { Product } from '@/lib/data';

const usd = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;

/*
 * A listing's price (owner, 2026-11-08). A real sale shows the struck-through price only when the history allows it (lib/prices/rules.ts), and
 * a launch price shows its note; nothing is ever struck through by hand. `big` is the website page's large price.
 */
export function PriceTag({ p, big = false }: { p: Pick<Product, 'price' | 'sale'>; big?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: big ? 'flex-start' : 'flex-end', gap: 6 }}>
      {p.sale?.wasCents && (
        <s className="muted" style={{ fontWeight: 400, fontSize: big ? 18 : 13 }} aria-label={`Was ${usd(p.sale.wasCents)}`}>
          {usd(p.sale.wasCents)}
        </s>
      )}
      <span style={big ? { fontSize: 34, fontWeight: 300 } : undefined}>${p.price}</span>
      {p.sale?.badge && <span className="status st-ok">{p.sale.badge}</span>}
      {p.sale?.note && (
        <span className="tag" style={{ margin: 0, flexBasis: '100%', textAlign: big ? 'left' : 'right' }}>
          {p.sale.note}
        </span>
      )}
    </span>
  );
}

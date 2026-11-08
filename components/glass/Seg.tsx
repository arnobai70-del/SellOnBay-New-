import Link from 'next/link';

export type SegItem = { key: string; label: string; href?: string };

/*
 * The design's .seg tabs (the chosen one is .on). Give each item an href to keep the choice in the address (works without JavaScript, and in a
 * server component), or give the control an onChange to switch on the spot. Named by `label` for screen readers.
 */
export function Seg({ label, items, value, onChange }: { label: string; items: SegItem[]; value: string; onChange?: (key: string) => void }) {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {items.map((i) =>
        i.href !== undefined ? (
          <Link key={i.key} className={i.key === value ? 'on' : ''} href={i.href} prefetch={false} role="tab" aria-selected={i.key === value}>
            {i.label}
          </Link>
        ) : (
          <button key={i.key} type="button" className={i.key === value ? 'on' : ''} role="tab" aria-selected={i.key === value} onClick={() => onChange?.(i.key)}>
            {i.label}
          </button>
        ),
      )}
    </div>
  );
}

import Link from 'next/link';

export type SegItem = { key: string; label: string; href?: string };

/*
 * The small tabs. Give each item an href to keep the choice in the address (works without JavaScript, and in a server component), or give the control an
 * onChange to switch on the spot. Named by `label` for screen readers.
 */
export function Seg({ label, items, value, onChange }: { label: string; items: SegItem[]; value: string; onChange?: (key: string) => void }) {
  return (
    <div className="g-seg" role="group" aria-label={label}>
      {items.map((i) =>
        i.href !== undefined ? (
          <Link key={i.key} className="g-seg-i" href={i.href} aria-current={i.key === value ? 'true' : undefined}>
            {i.label}
          </Link>
        ) : (
          <button key={i.key} type="button" className="g-seg-i" aria-pressed={i.key === value} onClick={() => onChange?.(i.key)}>
            {i.label}
          </button>
        ),
      )}
    </div>
  );
}

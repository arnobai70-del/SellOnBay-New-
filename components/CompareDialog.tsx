'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { daysLabel, doesFeature, imageFor, money, type Product } from '@/lib/data';
import { APP_FEATURES, FEATURES, isApp } from '@/lib/apps';
import { SHOW_LIST_PRICES } from '@/lib/config';

/* Side-by-side comparison of up to three sites. The best value in each row is marked. */
export function CompareDialog({ items, open, onClose }: { items: Product[]; open: boolean; onClose: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const best = (vals: number[], dir: 'min' | 'max') => {
    const t = dir === 'min' ? Math.min(...vals) : Math.max(...vals);
    return vals.map((v) => v === t && vals.filter((x) => x === t).length < vals.length);
  };
  const cheapest = best(
    items.map((p) => p.price),
    'min',
  );
  const fastest = best(
    items.map((p) => p.days),
    'min',
  );
  const rated = best(
    items.map((p) => (p.reviews ? p.rating : 0)),
    'max',
  );
  const sold = best(
    items.map((p) => p.sold),
    'max',
  );

  const row = (label: string, cells: React.ReactNode[], marks?: boolean[]) => (
    <tr>
      <th scope="row">{label}</th>
      {cells.map((c, i) => (
        <td key={i} className={marks?.[i] ? 'best' : undefined}>
          {c}
          {marks?.[i] && <em>Best</em>}
        </td>
      ))}
    </tr>
  );

  return (
    <dialog
      ref={dlg}
      className="cmpd"
      aria-labelledby="cmp-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dlg.current) onClose();
      }}
    >
      <div className="cmpd-head">
        <h2 id="cmp-title">Compare sites</h2>
        <button type="button" className="pv-x" aria-label="Close comparison" onClick={onClose}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className="cmpd-scroll">
        <table>
          <thead>
            <tr>
              <td />
              {items.map((p) => {
                const img = imageFor(p.id);
                return (
                  <th key={p.id} scope="col">
                    <Link href={`/product/${p.id}`} onClick={onClose}>
                      <span className="cmpd-shot">
                        {isApp(p) ? (
                          <i className="cmpd-app" style={{ background: p.app?.accent }}>
                            {p.app?.glyph}
                          </i>
                        ) : (
                          img && <Image src={img.src} alt="" fill sizes="200px" style={{ objectFit: 'cover', objectPosition: 'top' }} />
                        )}
                      </span>
                      <b>{p.name}</b>
                    </Link>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {SHOW_LIST_PRICES &&
              row(
                'Price',
                items.map((p) => money(p.price)),
                cheapest,
              )}
            {row(
              'Ready in',
              items.map((p) => daysLabel(p.days)),
              fastest,
            )}
            {row(
              'Rating',
              items.map((p) => (p.reviews ? `${p.rating} (${p.reviews})` : 'No reviews yet')),
              rated,
            )}
            {row(
              'Sold',
              items.map((p) => String(p.sold)),
              sold,
            )}
            {row(
              'Category',
              items.map((p) => p.cat),
            )}
            {row(
              'Does',
              items.map(
                (p) =>
                  [...FEATURES, ...APP_FEATURES]
                    .filter((f) => doesFeature(p, f.key))
                    .map((f) => f.label)
                    .join(', ') || p.tag,
              ),
            )}
            {row(
              'Seller',
              items.map((p) => p.seller),
            )}
            {row(
              'Included',
              items.map((p) => (
                <ul key={p.id}>
                  {p.inc.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              )),
            )}
            <tr>
              <th scope="row" />{' '}
              {items.map((p) => (
                <td key={p.id}>
                  <Link className="btn btn-blue btn-sm" href={`/checkout?id=${p.id}&pkg=asis`}>
                    {isApp(p) ? 'Get this app' : 'Get this site'}
                  </Link>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </dialog>
  );
}

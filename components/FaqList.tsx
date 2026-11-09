import type { Faq } from '@/lib/faq';

/* Questions and answers as the design's details.glass items (design-reference/help.html, buyer-protection.html). */
export function FaqList({ items }: { items: Faq[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((f) => (
        <details key={f.q} className="glass">
          <summary>{f.q}</summary>
          <p className="muted" style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.6 }}>
            {f.a}
          </p>
        </details>
      ))}
    </div>
  );
}

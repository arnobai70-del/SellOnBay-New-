import Link from 'next/link';
import { FaqList } from '@/components/FaqList';
import { PostBody } from '@/components/PostBody';
import { TallCard } from '@/components/TallCard';
import { parseMarkdown } from '@/lib/markdown';
import type { Block } from '@/lib/site/content';
import type { Product } from '@/lib/data';

/* Blocks an admin added to a page (Admin > Site builder), in the site's own looks. Text is Markdown (never HTML); addresses were checked when saved. */
export function PageBlocks({ blocks, listings }: { blocks: Block[]; listings: Product[] }) {
  return (
    <>
      {blocks.map((b) => {
        switch (b.type) {
          case 'heading':
            return b.level === 3 ? <h3 key={b.id}>{b.text}</h3> : <h2 key={b.id}>{b.text}</h2>;
          case 'text':
            return (
              <div key={b.id} className="prose">
                <PostBody blocks={parseMarkdown(b.text)} />
              </div>
            );
          case 'image':
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={b.id} src={b.src} alt={b.alt} loading="lazy" style={{ display: 'block', maxWidth: '100%', height: 'auto', borderRadius: 12, margin: '16px 0' }} />
            );
          case 'button': {
            const external = /^https:/.test(b.href);
            return (
              <p key={b.id}>
                {external ? (
                  <a className="btn btn-blue" href={b.href} target="_blank" rel="noopener noreferrer nofollow">
                    {b.label}
                  </a>
                ) : (
                  <Link className="btn btn-blue" href={b.href}>
                    {b.label}
                  </Link>
                )}
              </p>
            );
          }
          case 'listings': {
            const items = b.ids.map((id) => listings.find((p) => p.id === id)).filter((p): p is Product => !!p);
            if (!items.length) return null;
            return (
              <div key={b.id}>
                {b.title && <h2>{b.title}</h2>}
                <div className="grid tall-grid">
                  {items.map((p) => (
                    <TallCard key={p.id} p={p} />
                  ))}
                </div>
              </div>
            );
          }
          case 'faq':
            return (
              <div key={b.id}>
                <FaqList items={b.items} />
              </div>
            );
          case 'divider':
            return <hr key={b.id} style={{ margin: '28px 0', border: 0, borderTop: '1px solid var(--line, #e3e6ef)' }} />;
        }
      })}
    </>
  );
}

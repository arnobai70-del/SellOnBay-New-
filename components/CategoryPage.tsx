import Link from 'next/link';
import { JsonLd } from './JsonLd';
import { TallCard } from './TallCard';
import type { Product } from '@/lib/data';
import type { CategoryCopy } from '@/lib/seo/categories';
import { SITE_URL } from '@/lib/site';

/* A category page: its own words, the real products, questions people ask, and the other categories. Built from one category's copy, never a template with a word swapped. */
export function CategoryPage({
  c,
  products,
  others,
  faq = c.faq,
  productHref = (p) => `/product/${p.id}`,
}: {
  c: CategoryCopy;
  products: Product[];
  others: CategoryCopy[];
  faq?: [string, string][];
  productHref?: (p: Product) => string;
}) {
  const base = c.group === 'websites' ? '/websites' : '/templates';
  const shelf = c.shelfHref ?? (c.group === 'websites' ? `/browse?cat=${encodeURIComponent(c.name)}` : `/apps/digital?cat=${encodeURIComponent(c.name)}`);
  const parent = c.parent ?? (c.group === 'websites' ? { name: 'Websites', href: '/browse' } : { name: 'Templates and code', href: '/apps/digital' });
  const crumbs = [
    { name: 'Home', url: SITE_URL + '/' },
    { name: parent.name, url: SITE_URL + parent.href },
    { name: c.name, url: `${SITE_URL}${base}/${c.slug}` },
  ];
  return (
    <div className="wrap">
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map((x, i) => ({ '@type': 'ListItem', position: i + 1, name: x.name, item: x.url })) }} />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: c.h1,
          itemListElement: products.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE_URL + productHref(p), name: p.name })),
        }}
      />
      {faq.length > 0 && (
        <JsonLd data={{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }} />
      )}
      <div className="crumbs">
        <Link href="/">Home</Link> / <Link href={shelf.split('?')[0]}>{c.shelfName ?? (c.group === 'websites' ? 'Browse sites' : 'Digital products')}</Link> / <span>{c.name}</span>
      </div>
      <div className="page-head">
        <h1>{c.h1}</h1>
        {c.intro.map((t) => (
          <p key={t}>{t}</p>
        ))}
      </div>
      {products.length === 0 && <p className="muted">No templates here yet. Sellers are adding them; meanwhile you can browse everything.</p>}
      <div className="grid tall-grid bl-grid">
        {products.map((p) => (
          <TallCard key={p.id} p={p} href={productHref(p)} />
        ))}
      </div>
      <p style={{ marginTop: 18 }}>
        <Link className="btn btn-line" href={shelf}>
          {c.shelfHref ? 'Browse all sites' : `Filter and compare all ${c.name.toLowerCase()}`}
        </Link>
      </p>
      <div className="prose" style={{ marginTop: 36, paddingBottom: 80 }}>
        <h2>What to look for</h2>
        <ul>
          {c.lookFor.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        {faq.length > 0 && <h2>Questions</h2>}
        {faq.map(([q, a]) => (
          <div key={q}>
            <h3>{q}</h3>
            <p>{a}</p>
          </div>
        ))}
        <h2>Other categories</h2>
        <p>
          {others.map((o, i, a) => (
            <span key={o.slug}>
              <Link href={`${base}/${o.slug}`}>{o.name}</Link>
              {i < a.length - 1 ? ', ' : ''}
            </span>
          ))}
          {others.length > 0 ? '.' : ''}
        </p>
      </div>
    </div>
  );
}

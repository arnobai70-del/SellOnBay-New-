import { FaqList } from '@/components/FaqList';
import { JsonLd } from '@/components/JsonLd';
import { PageBlocks } from '@/components/PageBlocks';
import { PostBody } from '@/components/PostBody';
import { TallCard } from '@/components/TallCard';
import { parseMarkdown } from '@/lib/markdown';
import { notFound } from 'next/navigation';
import { faqJsonLd, isPublic, pageJsonLd, publishedFaqs } from '@/lib/seo/controls';
import { pageControls } from '@/lib/seo/controlStore';
import { realListings } from '@/lib/seo/hubStore';
import { seoPage } from '@/lib/seo/pageList';
import { adminMayPreview } from '@/lib/seo/preview';
import { pageBlocks } from '@/lib/site/contentStore';
import { SITE_URL } from '@/lib/site';

/*
 * What an admin added to a page (SEO and CMS > Edit page), in the site's existing looks: extra text, related listings and questions, with the
 * page's WebPage data and FAQPage data. Renders nothing when nothing is saved, so a page looks exactly as before.
 * The questions on the page and in the data come from the same saved list; the text is Markdown, which never produces HTML.
 */
export async function PageExtras({
  path,
  urlPath,
  name,
  description,
  collection,
  defaultFaqs,
}: {
  path: string;
  urlPath?: string;
  name?: string;
  description?: string;
  collection?: boolean;
  /* Questions the page shows until an admin saves questions of their own (a listing's come from its own facts, lib/seo/productFaq.ts). */
  defaultFaqs?: { q: string; a: string }[];
}) {
  const c = await pageControls(path);
  // The page body is the one place that decides the status code before anything is sent, so a closed page is a real 404 here too (metadata can stream after it).
  if (!isPublic(path, c) && !(await adminMayPreview())) notFound();
  // Saved questions (even only drafts) replace the built-in ones, so an admin can always take them away or rewrite them.
  const own = c.faqs.length > 0;
  const faqs = own ? publishedFaqs(c) : (defaultFaqs ?? []);
  const page = seoPage(path);
  const blocks = c.content ? parseMarkdown(c.content) : [];
  // Blocks from Admin > Site builder: "before" ones come before the page's own extras, "bottom" ones after. "Top" ones are drawn above the whole page (components/TopBlocks.tsx).
  const placed = await pageBlocks(path);
  const top = placed.filter((b) => b.position === 'before');
  const bottom = placed.filter((b) => b.position === 'bottom');
  const blockListings = [...top, ...bottom].some((b) => b.type === 'listings') ? await realListings() : [];
  const related = c.related.length ? (await realListings()).filter((p) => c.related.includes(p.id)) : [];
  const meta = pageJsonLd(c, {
    url: SITE_URL + ((urlPath ?? path) === '/' ? '' : (urlPath ?? path)),
    name: name ?? page?.title ?? path,
    description: description ?? page?.description,
    collection,
    image: c.ogImage ? (c.ogImage.startsWith('/') ? SITE_URL + c.ogImage : c.ogImage) : undefined,
  });
  const faq = faqJsonLd(own ? c : { ...c, faqs: faqs.map((f) => ({ q: f.q, a: f.a })) });
  // The WebPage data is written only when the page has something of its own saved; an untouched page is exactly as it was.
  const touched = top.length + bottom.length > 0 || blocks.length > 0 || related.length > 0 || faqs.length > 0 || !!c.ogImage || !!c.canonical;
  if (!touched) return null;
  return (
    <section className="wrap faq-page" aria-label="More about this page">
      {meta && <JsonLd data={meta} />}
      {faq && <JsonLd data={faq} />}
      {c.ogImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={c.ogImage}
          alt={c.ogImageAlt}
          loading="lazy"
          style={{ display: 'block', width: '100%', height: 'auto', aspectRatio: '1200 / 630', objectFit: 'cover', borderRadius: 12, margin: '0 0 20px' }}
        />
      )}
      <PageBlocks blocks={top} listings={blockListings} />
      {blocks.length > 0 && (
        <div className="prose">
          <PostBody blocks={blocks} />
        </div>
      )}
      {related.length > 0 && (
        <>
          <h2>Related</h2>
          <div className="grid tall-grid">
            {related.map((p) => (
              <TallCard key={p.id} p={p} />
            ))}
          </div>
        </>
      )}
      {faqs.length > 0 && (
        <>
          <h2 id="page-faq-h">Questions and answers</h2>
          <FaqList items={faqs.map((f) => ({ q: f.q, a: f.a }))} />
        </>
      )}
      <PageBlocks blocks={bottom} listings={blockListings} />
    </section>
  );
}

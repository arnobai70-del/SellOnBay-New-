import type { ReactNode } from 'react';
import { PageExtras } from './PageExtras';
import { PostBody } from './PostBody';
import { pageWords } from '@/lib/seo/pageWords';
import { docForPath } from '@/lib/legal/rules';
import { publishedLegal } from '@/lib/legal/service';
import { parseMarkdown } from '@/lib/markdown';

/*
 * A policy page: heading, a stamp, then the text. Which text shows, first match wins:
 *   1. the published version of its legal document (Admin > Legal documents, lib/legal; versioned, published by a Super Admin)
 *   2. the text an admin wrote at /dashboard/admin/seo/pages
 *   3. the built-in text (children)
 */
export async function LegalPage({
  path,
  stamp = '[LAWYER REVIEW] Draft, last updated October 2026. Plain-English text, not final legal advice.',
  children,
}: {
  path: string;
  stamp?: string;
  children: ReactNode;
}) {
  const w = await pageWords(path);
  const key = docForPath(path);
  const doc = key ? await publishedLegal(key) : null;
  const shown = doc
    ? `Version ${doc.version}, published ${new Date(doc.publishedAt ?? doc.updatedAt).toISOString().slice(0, 10)}.${doc.lawyerReviewed ? '' : ' Not yet reviewed by a lawyer.'}`
    : stamp;
  return (
    <>
      <div className="g-head">
        <h1>{w.heading}</h1>
        <p className="g-tag">{shown}</p>
      </div>
      <div className="g-glass g-card g-prose" data-page-text={doc ? `legal-v${doc.version}` : w.body ? 'saved' : 'built-in'}>
        {doc ? <PostBody blocks={parseMarkdown(doc.body)} /> : w.body ? <PostBody blocks={w.body} /> : children}
      </div>
      <PageExtras path={path} />
    </>
  );
}

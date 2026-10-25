import type { ReactNode } from 'react';
import { PageExtras } from './PageExtras';
import { PostBody } from './PostBody';
import { pageWords } from '@/lib/seo/pageWords';

/*
 * A policy page: heading, a draft stamp, then the text. An admin can rewrite the heading and the whole text at /dashboard/admin/seo/pages;
 * the built-in text (children) shows until then.
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
  return (
    <div className="wrap">
      <div className="page-head">
        <h1>{w.heading}</h1>
        <p className="stamp muted">{stamp}</p>
      </div>
      <div className="prose" data-page-text={w.body ? 'saved' : 'built-in'}>
        {w.body ? <PostBody blocks={w.body} /> : children}
      </div>
      <PageExtras path={path} />
    </div>
  );
}

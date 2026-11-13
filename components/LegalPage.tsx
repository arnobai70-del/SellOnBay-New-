import Link from 'next/link';
import type { ReactNode } from 'react';
import { PageExtras } from './PageExtras';
import { PostBody } from './PostBody';
import { PublicFrame } from './glass/PublicFrame';
import { pageWords } from '@/lib/seo/pageWords';
import { docForPath } from '@/lib/legal/rules';
import { publishedLegal } from '@/lib/legal/service';
import { parseMarkdown } from '@/lib/markdown';
import { getI18n } from '@/lib/i18n/server';

/* The policies, each at its own address (search engines and links keep working); the design's contents list links them. */
const DOCS = (tx: (e: string) => string): [path: string, href: string, label: string][] => [
  ['/terms', '/legal/terms', tx('Terms of service')],
  ['/privacy', '/legal/privacy', tx('Privacy policy')],
  ['/refunds', '/legal/refunds', tx('Refund policy')],
  ['/licenses', '/legal/licenses', tx('Website licenses')],
  ['/seller-agreement', '/legal/seller-agreement', tx('Seller agreement')],
  ['/acceptable-use', '/legal/acceptable-use', tx('Acceptable use')],
  ['/dmca', '/legal/dmca', tx('Copyright (DMCA)')],
];

/*
 * A policy page in the frame of design-reference/legal.html: the page head (badge, heading, the version stamp as the design's draft note), the
 * contents list and the text in a glass card. Which text shows, first match wins:
 *   1. the published version of its legal document (Admin > Legal documents, lib/legal; versioned, published by a Super Admin)
 *   2. the text an admin wrote at /admin/seo/pages
 *   3. the built-in text (children)
 * The legal text itself is never translated (owner: legal translations need a lawyer's review before they are published). In another language
 * the page frame is translated, the text keeps lang="en" and dir="ltr", and a notice says that only the English text applies.
 */
export async function LegalPage({
  path,
  stamp = 'Draft, last updated October 2026. Plain-English text, not final legal advice.', // [LAWYER REVIEW] kept in code only (owner, 2026-11-11)
  children,
}: {
  path: string;
  stamp?: string;
  children: ReactNode;
}) {
  const [w, i18n] = await Promise.all([pageWords(path), getI18n()]);
  const { tx } = i18n;
  const english = i18n.lang === 'en';
  const key = docForPath(path);
  const doc = key ? await publishedLegal(key) : null;
  const shown = doc
    ? tx('Version {version}, published {v1}.{v2}', {
        version: doc.version,
        v1: new Date(doc.publishedAt ?? doc.updatedAt).toISOString().slice(0, 10),
        v2: doc.lawyerReviewed ? '' : ` ${tx('Not yet reviewed by a lawyer.')}`,
      })
    : stamp;
  return (
    <PublicFrame file="legal">
      <header className="pagehead">
        <span className="badge fade-in" style={{ alignSelf: 'flex-start' }}>
          {tx('Policies')}
        </span>
        <h1>{w.heading}</h1>
        <p className="muted" style={{ margin: 0, maxWidth: 640, lineHeight: 1.6 }}>
          {tx('The rules for buyers, sellers and SellOnBay, in plain language.')}
        </p>
        <span className="draft">{shown}</span>
      </header>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <nav className="glass toc" aria-label={tx('Policies')} style={{ flex: '1 1 220px', maxWidth: 260, padding: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {DOCS(tx).map(([p, href, label]) => (
            <Link key={p} href={href} prefetch={false} aria-current={p === path ? 'page' : undefined} style={p === path ? { background: '#fff', color: '#2B4250', fontWeight: 500 } : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        <div style={{ flex: '999 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!english && (
            <p className="glass card" role="note" data-legal-notice style={{ margin: 0, padding: '12px 16px', lineHeight: 1.6 }}>
              {tx('This legal text is in English. A translation is waiting for a lawyer to check it; until then, only the English text applies.')}
            </p>
          )}
          <section className="glass card sob-prose" lang="en" dir="ltr" data-page-text={doc ? `legal-v${doc.version}` : w.body ? 'saved' : 'built-in'}>
            {doc ? <PostBody blocks={parseMarkdown(doc.body)} /> : w.body ? <PostBody blocks={w.body} /> : children}
          </section>
          <PageExtras path={path} />
        </div>
      </div>
    </PublicFrame>
  );
}

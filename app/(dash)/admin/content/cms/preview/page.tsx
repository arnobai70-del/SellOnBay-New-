import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashShell } from '@/components/DashShell';
import { FaqList } from '@/components/FaqList';
import { HowItWorks } from '@/components/HowItWorks';
import { isDocName, isEmailDoc, type EmailDoc, type FaqDoc, type HowDoc } from '@/lib/cms/docs';
import { draftOf } from '@/lib/cms/docStore';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Preview'), robots: { index: false } });
export const dynamic = 'force-dynamic';

/* A draft shown with the same components the public page uses. Only admins with the Content permission see it; it is never indexed. */
export default async function CmsPreview({ searchParams }: { searchParams: Promise<{ doc?: string }> }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/content/cms/preview', roles: ['admin'], scope: 'content' });
  const doc = (await searchParams).doc ?? '';
  if (!isDocName(doc)) notFound();
  const draft = await draftOf(doc);
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-cms" title={tx('Preview')}>
      <p className="sob-note-box" data-preview={doc}>
        <span>
          <T s={'Preview of the draft. Visitors still see the published version.'} />{' '}
          <Link href={`/admin/content/cms?doc=${encodeURIComponent(doc)}`}>
            <T s={'Back to the editor'} />
          </Link>
        </span>
      </p>
      {!draft ? (
        <p className="muted">
          <T s={'There is no draft to preview.'} />
        </p>
      ) : doc === 'faq' ? (
        <div className="sob-faq-page">
          {(draft.data as FaqDoc).groups.map((g) => (
            <section key={g.title}>
              <div className="h2">{g.title}</div>
              <FaqList items={g.items} />
            </section>
          ))}
        </div>
      ) : doc === 'how_it_works' ? (
        <HowItWorks steps={draft.data as HowDoc} />
      ) : isEmailDoc(doc) ? (
        <div className="glass card sob-sec">
          <p>
            <b>
              <T s={'Subject:'} />
            </b>{' '}
            {(draft.data as EmailDoc).subject}
          </p>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{(draft.data as EmailDoc).text}</pre>
        </div>
      ) : null}
    </DashShell>
  );
}

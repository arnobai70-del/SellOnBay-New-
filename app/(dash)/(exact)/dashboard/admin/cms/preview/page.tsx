import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashShell } from '@/components/DashShell';
import { FaqList } from '@/components/FaqList';
import { HowItWorks } from '@/components/HowItWorks';
import { isDocName, isEmailDoc, type EmailDoc, type FaqDoc, type HowDoc } from '@/lib/cms/docs';
import { draftOf } from '@/lib/cms/docStore';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Preview', robots: { index: false } };
export const dynamic = 'force-dynamic';

/* A draft shown with the same components the public page uses. Only admins with the Content permission see it; it is never indexed. */
export default async function CmsPreview({ searchParams }: { searchParams: Promise<{ doc?: string }> }) {
  const viewer = await requireViewer({ path: '/dashboard/admin/cms/preview', roles: ['admin'], scope: 'content' });
  const doc = (await searchParams).doc ?? '';
  if (!isDocName(doc)) notFound();
  const draft = await draftOf(doc);
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-cms" title="Preview">
      <p className="note" data-preview={doc}>
        <span>
          Preview of the draft. Visitors still see the published version. <Link href={`/dashboard/admin/cms?doc=${encodeURIComponent(doc)}`}>Back to the editor</Link>
        </span>
      </p>
      {!draft ? (
        <p className="muted">There is no draft to preview.</p>
      ) : doc === 'faq' ? (
        <div className="faq-page">
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
        <div className="dp">
          <p>
            <b>Subject:</b> {(draft.data as EmailDoc).subject}
          </p>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{(draft.data as EmailDoc).text}</pre>
        </div>
      ) : null}
    </DashShell>
  );
}

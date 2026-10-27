import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { LEGAL_DOCS, type DocKey } from '@/lib/legal/rules';
import { legalDocs } from '@/lib/legal/service';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Legal documents', robots: { index: false } };
export const dynamic = 'force-dynamic';

const day = (ms: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : '–');

/*
 * Versioned legal texts (lib/legal). Content admins write drafts; a Super Admin records the lawyer's review and publishes. A published version
 * never changes; publishing the next one retires it. Until a version is published the page shows its built-in text. [LAWYER REVIEW]
 */
export default async function Legal() {
  const viewer = await requireViewer({ path: '/dashboard/admin/legal', roles: ['admin'], scope: 'content' });
  const all = await legalDocs();
  const isSuper = !viewer || viewer.scopes.includes('super'); // demo mode has no accounts and acts as Super, like the API
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-legal" title="Legal documents">
      <div className="dp">
        <div className="hd">
          <div>
            <h2>Legal documents</h2>
            <p className="sub">
              Each text is kept as numbered versions. Published versions never change. Every text must be reviewed by a lawyer before launch; a version shows &quot;Not yet reviewed by a lawyer&quot;
              until a Super Admin records that review.
            </p>
          </div>
        </div>
      </div>
      {(Object.keys(LEGAL_DOCS) as DocKey[]).map((k) => {
        const docs = all.filter((d) => d.docKey === k);
        const pub = docs.find((d) => d.status === 'published') ?? null;
        const draft = docs.find((d) => d.status === 'draft') ?? null;
        const retired = docs.filter((d) => d.status === 'retired');
        const path = LEGAL_DOCS[k].path;
        return (
          <div className="dp" key={k} data-legal={k}>
            <div className="hd">
              <div>
                <h2>{LEGAL_DOCS[k].title}</h2>
                <p className="sub">
                  {pub
                    ? `Version ${pub.version} published ${day(pub.publishedAt)}${pub.lawyerReviewed ? `, reviewed: ${pub.reviewedNote}` : ', not yet reviewed by a lawyer'}.`
                    : 'No version published: the built-in text shows.'}{' '}
                  {path && <Link href={path}>Open the page</Link>}
                  {k === 'licences' && ' Quotations record the published version number.'}
                </p>
              </div>
            </div>
            {draft ? (
              <>
                <p>
                  <b>Draft, version {draft.version}</b> · last saved {day(draft.updatedAt)} · {draft.lawyerReviewed ? `reviewed: ${draft.reviewedNote}` : 'not reviewed'}
                </p>
                <AdminForm
                  endpoint="/api/admin/legal"
                  fixed={{ action: 'save', id: draft.id, docKey: k }}
                  openLabel="Edit the draft"
                  submit="Save the draft"
                  fields={[
                    { name: 'title', label: 'Title', kind: 'text', required: true, value: draft.title, max: 160 },
                    { name: 'body', label: 'Text (Markdown)', kind: 'textarea', required: true, value: draft.body, max: 200_000, hint: 'Saving clears a recorded review.' },
                    { name: 'summary', label: 'What changed', kind: 'text', value: draft.summary, max: 500 },
                  ]}
                />
                {isSuper && (
                  <>
                    <AdminForm
                      endpoint="/api/admin/legal"
                      fixed={{ action: 'review', id: draft.id }}
                      openLabel="Record the lawyer's review"
                      submit="Record review"
                      tone="line"
                      fields={[{ name: 'note', label: 'Who reviewed it, and when', kind: 'text', required: true, max: 500 }]}
                    />
                    <AdminForm
                      endpoint="/api/admin/legal"
                      fixed={{ action: 'publish', id: draft.id }}
                      openLabel="Publish this version"
                      submit="Publish"
                      tone="dark"
                      fields={[{ name: 'reason', label: 'Why (goes in the audit log)', kind: 'textarea', required: true }]}
                    />
                  </>
                )}
                <AdminForm endpoint="/api/admin/legal" fixed={{ action: 'delete', id: draft.id }} openLabel="Delete the draft" submit="Delete draft" tone="line" fields={[]} />
              </>
            ) : (
              <AdminForm
                endpoint="/api/admin/legal"
                fixed={{ action: 'save', docKey: k }}
                openLabel="Start a new version"
                submit="Save as draft"
                fields={[
                  { name: 'title', label: 'Title', kind: 'text', required: true, value: pub?.title ?? LEGAL_DOCS[k].title, max: 160 },
                  { name: 'body', label: 'Text (Markdown)', kind: 'textarea', required: true, value: pub?.body ?? '', max: 200_000 },
                  { name: 'summary', label: 'What changed', kind: 'text', max: 500 },
                ]}
              />
            )}
            {retired.length > 0 && <p className="muted">Earlier versions: {retired.map((d) => `v${d.version} (${day(d.publishedAt)})`).join(', ')}</p>}
          </div>
        );
      })}
    </DashShell>
  );
}

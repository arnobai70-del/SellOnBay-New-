import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { BUILT_IN_STEPS } from '@/lib/howSteps';
import { TEMPLATES, type NotificationKind, type Tx } from '@/emails/templates';
import { docScopes, EMAIL_LANGS, emailDocName, emailDocParts, faqToText, howToText, isDocName, isEmailDoc, type DocName, type EmailDoc, type FaqDoc, type HowDoc } from '@/lib/cms/docs';
import { draftOf, publishedOf } from '@/lib/cms/docStore';
import { FAQ_GROUPS } from '@/lib/faq';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
import { txFor } from '@/lib/i18n/recipient';
import { BUILTIN } from '@/lib/i18n/config';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Content'), robots: { index: false } });
export const dynamic = 'force-dynamic';

const when = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const KINDS = Object.keys(TEMPLATES) as NotificationKind[];
/* The built-in email words in one language with every value shown as its placeholder, as a starting point for a template. */
function builtInEmail(kind: NotificationKind, tx?: Tx): EmailDoc {
  try {
    const p = new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? `{{${k}}}` : undefined) });
    return TEMPLATES[kind](p as never, tx);
  } catch {
    return { subject: kind.replace(/_/g, ' '), text: '' };
  }
}

/*
 * Admin > Content (lib/cms): the FAQ, the How it works steps and the notification emails. Draft, preview, then another admin (or a Super
 * Admin) publishes; email templates are published by a Super Admin. Every publish is kept in Site history and can be put back.
 */
export default async function Cms({ searchParams }: { searchParams: Promise<{ doc?: string }> }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/content/cms', roles: ['admin'], scope: 'content' });
  const q = (await searchParams).doc ?? 'faq';
  const doc: DocName = isDocName(q) && (!isEmailDoc(q) || KINDS.includes(emailDocParts(q).kind as NotificationKind)) ? q : 'faq';
  // An email has one template per language; each language stands on its own (lib/cms/emailRender.ts).
  const email = isEmailDoc(doc) ? emailDocParts(doc) : null;
  const emailTx = email ? await txFor(email.lang) : undefined;
  const builtIn = email ? builtInEmail(email.kind as NotificationKind, emailTx) : null;
  const langName = (code: string) => BUILTIN.find((l) => l.code === code)?.name ?? code;
  const draft = await draftOf(doc);
  const pub = await publishedOf(doc, true);
  const me = viewer?.id ?? null;
  const scopes = viewer?.scopes ?? ['super'];
  const mayPublish = scopes.includes('super') || (docScopes(doc).publish !== 'super' && draft?.editedBy !== me);
  const current = (draft?.data ?? pub?.data ?? null) as unknown;
  const text =
    doc === 'faq'
      ? faqToText((current as FaqDoc | null) ?? { groups: FAQ_GROUPS })
      : doc === 'how_it_works'
        ? howToText((current as HowDoc | null) ?? BUILT_IN_STEPS)
        : ((current as EmailDoc | null)?.text ?? builtIn?.text ?? '');
  const subject = email ? ((current as EmailDoc | null)?.subject ?? builtIn?.subject ?? '') : '';
  const label = doc === 'faq' ? 'FAQ' : doc === 'how_it_works' ? tx('How it works') : tx('Email: {kind} ({language})', { kind: email!.kind.replace(/_/g, ' '), language: langName(email!.lang) });
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-cms" title={tx('Content')}>
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Content'} />
            </h2>
            <p className="tag">
              <T
                s={
                  'Save a draft, preview it, then another admin publishes it (a Super Admin may publish their own). Email templates are published by a Super Admin. Until something is published, the built-in text shows. Every publish is kept in'
                }
              />{' '}
              <Link href="/admin/content/site/history">
                <T s={'Site history'} />
              </Link>
              .
            </p>
          </div>
        </div>
        <div className="sob-acts" style={{ flexWrap: 'wrap' }}>
          <Link className={'btn sm' + (doc === 'faq' ? '' : ' ghost')} href="/admin/content/cms?doc=faq">
            FAQ
          </Link>
          <Link className={'btn sm' + (doc === 'how_it_works' ? '' : ' ghost')} href="/admin/content/cms?doc=how_it_works">
            <T s={'How it works'} />
          </Link>
        </div>
        <details style={{ marginTop: 12 }} open={isEmailDoc(doc)}>
          <summary>
            <T s={'Email templates ({length})'} v={{ length: KINDS.length }} />
          </summary>
          <div className="sob-acts" style={{ flexWrap: 'wrap', marginTop: 8 }}>
            {KINDS.map((k) => (
              <Link key={k} className={'btn sm' + (email?.kind === k ? '' : ' ghost')} href={`/admin/content/cms?doc=${emailDocName(k, email?.lang ?? 'en')}`}>
                {k.replace(/_/g, ' ')}
              </Link>
            ))}
          </div>
        </details>
      </div>

      <div className="glass card sob-sec" data-cms-doc={doc}>
        <div className="row sob-hd">
          <div>
            <h2>{label}</h2>
            <p className="tag">
              {pub ? tx('Published version {version}, {when}.', { version: pub.version, when: when(pub.publishedAt) }) : tx('Nothing published: the built-in text shows.')}{' '}
              {draft ? (draft.editedBy === me ? tx('Draft saved {when} by you.', { when: when(draft.editedAt) }) : tx('Draft saved {when}.', { when: when(draft.editedAt) })) : tx('No draft.')}
            </p>
            {email && (
              <div className="sob-acts" style={{ flexWrap: 'wrap' }} role="group" aria-label={tx('Language of this email')} data-email-langs>
                {(['en', ...EMAIL_LANGS] as string[]).map((l) => (
                  <Link key={l} className={'btn sm' + (email.lang === l ? '' : ' ghost')} href={`/admin/content/cms?doc=${emailDocName(email.kind, l)}`} lang={l}>
                    {langName(l)}
                  </Link>
                ))}
              </div>
            )}
            {email && (
              <p className="muted">
                {tx(
                  'Each language has its own template. A reader gets the one published for their language, else the built-in email in their language; the English template never replaces another language.',
                )}
              </p>
            )}
          </div>
        </div>
        <p className="muted">
          {doc === 'faq'
            ? tx('Write "# Group title" to start a group, then "Q: question" and "A: answer" lines. Plain text only.')
            : doc === 'how_it_works'
              ? tx('Two sections, "Buyers" and "Sellers", each with exactly three lines: "Title | what happens".')
              : tx('Plain text. Values from the notification go in as {{name}}, for example {{title}} or {{note}}; an unknown name stays empty.')}
        </p>
        <AdminForm
          endpoint="/api/admin/cms/docs"
          fixed={{ action: 'save', doc }}
          open
          submit={tx('Save draft')}
          fields={[
            ...(isEmailDoc(doc) ? [{ name: 'subject', label: tx('Subject'), kind: 'text' as const, required: true, value: subject, max: 150 }] : []),
            { name: 'text', label: tx('Text'), kind: 'textarea' as const, required: true, value: text, max: isEmailDoc(doc) ? 4000 : 30_000 },
          ]}
        />
        {draft && (
          <div className="sob-acts" style={{ marginTop: 12 }}>
            <Link className="btn ghost sm" href={`/admin/content/cms/preview?doc=${encodeURIComponent(doc)}`}>
              <T s={'Preview the draft'} />
            </Link>
            {mayPublish ? (
              <AdminForm endpoint="/api/admin/cms/docs" fixed={{ action: 'publish', doc }} fields={[]} submit={tx('Publish the draft')} tone="dark" />
            ) : (
              <small className="muted">{docScopes(doc).publish === 'super' ? tx('A Super Admin publishes email templates.') : tx('Another admin checks and publishes your draft.')}</small>
            )}
            <AdminForm endpoint="/api/admin/cms/docs" fixed={{ action: 'discard', doc }} fields={[]} submit={tx('Discard the draft')} tone="line" />
          </div>
        )}
      </div>
    </DashShell>
  );
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { AuditError } from '@/lib/admin/audit';
import { isDocName, isEmailDoc, parseFaqText, parseHowText, type DocName } from '@/lib/cms/docs';
import { discardDraft, publishDraft, saveDraft } from '@/lib/cms/docStore';
import { TEMPLATES } from '@/emails/templates';
import { readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({
  action: z.enum(['save', 'discard', 'publish']),
  doc: z.string().max(60),
  text: z.string().max(40_000).optional(),
  subject: z.string().max(200).optional(),
});

/*
 * CMS documents (lib/cms): Content admins save and discard drafts; publishing needs another admin than the last editor, or a Super Admin
 * (four eyes); email templates are published by a Super Admin only. Every publish is kept in Site history and can be rolled back.
 */
export async function POST(req: Request) {
  const closed = await maintenanceFor('admin'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly('content');
  if (!a.ok) return a.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const { action, doc, text = '', subject = '' } = body.data;
  if (!isDocName(doc) || (isEmailDoc(doc) && !Object.hasOwn(TEMPLATES, doc.slice(6)))) return NextResponse.json({ error: 'Unknown document.' }, { status: 404 });
  const name = doc as DocName;
  try {
    const r =
      action === 'discard'
        ? await discardDraft(a.id, a.scopes, name)
        : action === 'publish'
          ? await publishDraft(a.id, a.scopes, name)
          : await saveDraft(a.id, a.scopes, name, name === 'faq' ? parseFaqText(text) : name === 'how_it_works' ? parseHowText(text) : { subject, text });
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
  } catch (e) {
    if (e instanceof AuditError) return NextResponse.json({ error: e.message }, { status: 503 });
    throw e;
  }
}

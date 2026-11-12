import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { revisionsOf } from '@/lib/cms/history';
import { discardDraft, draftOf, publishDraft, PUBLISHED, publishedOf, saveDraft } from '@/lib/cms/docStore';
import { rollback } from '@/lib/cms/restore';
import { pageByKey, type PageDoc } from '@/lib/content/registry';
import { maintenanceFor } from '@/lib/maintenance/service';
import { pageControls, setPageControls } from '@/lib/seo/controlStore';
import { setPageSeo } from '@/lib/seo/pageMeta';
import { readJson } from '@/lib/validate';
import { jsonT } from '@/lib/i18n/jsonT';
import { tx } from '@/lib/i18n/tx';

export const runtime = 'nodejs';
const schema = z.object({ key: z.string().max(40), action: z.enum(['draft', 'publish', 'discard', 'restore']), doc: z.unknown().optional(), version: z.number().int().optional() });

const def = (key: string) => {
  const d = pageByKey(key);
  return d && !d.legal ? d : null;
};

/* One page's draft, published words and history (Admin › Content › Pages, owner 2026-11-08). Content admins and Super Admins. */
export async function GET(req: Request) {
  const closed = await maintenanceFor('admin');
  if (closed) return closed;
  const a = await adminOnly('content');
  if (!a.ok) return a.res;
  const key = new URL(req.url).searchParams.get('key') ?? '';
  if (!def(key)) return jsonT({ error: tx('Unknown page.') }, { status: 404 });
  const [draft, published, history] = await Promise.all([draftOf<PageDoc>(`page:${key}`), publishedOf<PageDoc>(`page:${key}`, true), revisionsOf(PUBLISHED(`page:${key}`), 30)]);
  return NextResponse.json({ draft, published, history: history.map((r) => ({ version: r.version, at: r.at, action: r.action })) }, { headers: { 'cache-control': 'no-store' } });
}

/*
 * Save a draft, publish it (a second admin, or a Super Admin: the CMS four-eyes rule), throw the draft away, or put an earlier version back.
 * Every step is in the audit log (lib/cms/docStore.ts). Publishing a page's SEO words writes them through the one SEO store, so the page's
 * title, description and share picture stay where every page's metadata comes from, and GA and the SEO tags are never touched by an edit.
 */
export async function POST(req: Request) {
  const closed = await maintenanceFor('admin');
  if (closed) return closed;
  const a = await adminOnly('content');
  if (!a.ok) return a.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const { key, action, doc, version } = body.data;
  const d = def(key);
  if (!d) return jsonT({ error: tx('Unknown page.') }, { status: 404 });
  const name = `page:${key}` as const;
  const fail = (r: { ok: false; status: number; error: string }) => jsonT({ error: r.error }, { status: r.status });
  if (action === 'draft') {
    const r = await saveDraft(a.id, a.scopes, name, doc);
    return r.ok ? NextResponse.json({ ok: true }) : fail(r);
  }
  if (action === 'discard') {
    const r = await discardDraft(a.id, a.scopes, name);
    return r.ok ? NextResponse.json({ ok: true }) : fail(r);
  }
  if (action === 'restore') {
    if (!version) return jsonT({ error: tx('Choose a version.') }, { status: 400 });
    const r = await rollback(a.id, PUBLISHED(name), version);
    return r.ok ? NextResponse.json({ ok: true }) : fail(r);
  }
  const r = await publishDraft(a.id, a.scopes, name);
  if (!r.ok) return fail(r);
  const seo = (r.value.data as PageDoc).seo;
  if (d.seo && d.path.startsWith('/') && (seo.title || seo.description)) await setPageSeo(a.id, d.path, { title: seo.title, description: seo.description });
  if (d.seo && d.path.startsWith('/') && seo.ogImage) await setPageControls(a.id, d.path, { ...(await pageControls(d.path)), ogImage: seo.ogImage });
  return NextResponse.json({ ok: true });
}

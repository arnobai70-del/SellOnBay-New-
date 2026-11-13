import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { publishWords, saveDraftWords, saveLanguages } from '@/lib/i18n/store';
import { maintenanceFor } from '@/lib/maintenance/service';
import { readJson } from '@/lib/validate';
import { jsonT } from '@/lib/i18n/jsonT';

export const runtime = 'nodejs';
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('languages'), settings: z.object({ defaultLang: z.string().max(5), languages: z.array(z.record(z.string(), z.unknown())).max(30) }) }),
  z.object({ action: z.literal('draft'), lang: z.string().max(5), words: z.record(z.string(), z.string().max(4000)) }),
  z.object({ action: z.literal('publish'), lang: z.string().max(5), mode: z.enum(['publish', 'unpublish']) }),
]);

/*
 * Admin › Language Management (lib/i18n, owner 2026-11-12). The language list (enable, publish, order, names, default, add or remove) needs a
 * Super Admin; translations and product words need Content or Super. Every change is audited and takes effect without a redeploy.
 */
export async function POST(req: Request) {
  const closed = await maintenanceFor('admin');
  if (closed) return closed;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const b = body.data;
  const a = b.action === 'languages' ? await adminOnly('super') : await adminOnly(['content', 'super']);
  if (!a.ok) return a.res;
  const r = b.action === 'languages' ? await saveLanguages(a.id, b.settings) : b.action === 'draft' ? await saveDraftWords(a.id, b.lang, b.words) : await publishWords(a.id, b.lang, b.mode);
  return r.ok ? NextResponse.json({ ok: true }) : jsonT({ error: r.error }, { status: r.status });
}

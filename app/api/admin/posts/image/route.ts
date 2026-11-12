import { NextResponse } from 'next/server';
import { adminOnly } from '@/lib/admin/guard';
import { audit } from '@/lib/admin/audit';
import { mediaReady, MAX_BYTES, saveBlogImage } from '@/lib/blogMedia';
import { maintenanceFor } from '@/lib/maintenance/service';
import { jsonT } from '@/lib/i18n/jsonT';
import { tx } from '@/lib/i18n/tx';

export const runtime = 'nodejs';

/* Uploads one picture for a blog post (admins only). Answers with the address to put in the post. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('seo'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly('content');
  if (!a.ok) return a.res;
  if (!mediaReady()) return jsonT({ error: tx('Uploads need the database. Paste a picture address instead.') }, { status: 503 });
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BYTES + 64 * 1024) return jsonT({ error: tx('The picture is larger than 5 MB.') }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return jsonT({ error: tx('Choose a picture.') }, { status: 400 });
  if (file.size > MAX_BYTES) return jsonT({ error: tx('The picture is larger than 5 MB.') }, { status: 413 });
  const r = await saveBlogImage(new Uint8Array(await file.arrayBuffer()));
  if (!r.ok) return jsonT({ error: r.error }, { status: 400 });
  await audit(a.id, 'post_image_uploaded', 'post', r.url, { size: file.size });
  return NextResponse.json({ ok: true, url: r.url });
}

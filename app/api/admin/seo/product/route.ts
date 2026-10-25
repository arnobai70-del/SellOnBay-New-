import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { adminAddShot, adminEditProduct, adminRemoveShot } from '@/lib/admin/productEdit';
import { readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const num = z.coerce.number();
const edit = z.object({
  slug: z.string().max(80),
  name: z.string().max(200),
  category: z.string().max(80),
  desc: z.string().max(2000),
  includes: z.string().max(3000),
  price: num,
  days: num,
  demo: z.string().max(500),
  sample: z.string().max(1000),
  docsUrl: z.string().max(500),
  requirements: z.string().max(2000),
  express: z.string().max(6),
  setupPrice: num,
  customPrice: num,
  supportDays: num,
  updateDays: num,
  codeUrl: z.string().max(1000).optional(),
  licenceType: z.string().max(40).optional(),
});
const remove = z.object({ slug: z.string().max(80), removeShot: z.string().max(80) });

/* Saves an admin's change to a seller's listing (words, price, links, extras) or removes one app screenshot. Admins only; audited with before and after. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('seo'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly();
  if (!a.ok) return a.res;
  const ct = req.headers.get('content-type') ?? '';
  // A picture is sent as a form: slug and file.
  if (ct.startsWith('multipart/form-data')) {
    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    const slug = String(form?.get('slug') ?? '');
    if (!(file instanceof File) || !slug) return NextResponse.json({ error: 'Choose a picture.' }, { status: 400 });
    if (file.size > 4 * 1024 * 1024) return NextResponse.json({ error: 'The picture is larger than 4 MB.' }, { status: 413 });
    const r = await adminAddShot(a.id, slug, new Uint8Array(await file.arrayBuffer()));
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
  }
  const body = await readJson(req, z.union([remove, edit]));
  if (!body.ok) return body.res;
  const d = body.data;
  const r =
    'removeShot' in d
      ? await adminRemoveShot(a.id, d.slug, d.removeShot)
      : await adminEditProduct(a.id, d.slug, {
          name: d.name,
          category: d.category,
          desc: d.desc,
          includes: d.includes,
          price: d.price,
          days: d.days,
          demo: d.demo,
          sample: d.sample,
          docsUrl: d.docsUrl,
          requirements: d.requirements,
          express: d.express,
          setupPrice: d.setupPrice,
          customPrice: d.customPrice,
          supportDays: d.supportDays,
          updateDays: d.updateDays,
          codeUrl: d.codeUrl,
          licenceType: d.licenceType,
        });
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}

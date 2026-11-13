import { NextResponse } from 'next/server';
import { audit } from '@/lib/admin/audit';
import { maintenanceFor } from '@/lib/maintenance/service';
import { notifyAdmins } from '@/lib/notify';
import { PROOF_MAX_BYTES, proofKind } from '@/lib/payments/rules';
import { limit } from '@/lib/rateLimit';
import { sellerOnly } from '@/lib/seller/guard';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createAdminClient } from '@/lib/supabase/server';
import { jsonT } from '@/lib/i18n/jsonT';
import { tx } from '@/lib/i18n/tx';

export const runtime = 'nodejs';
const TYPES = ['passport', 'national_id', 'driver_licence'] as const;

/*
 * Seller verification (owner, 2026-11-07): a government ID and the country, once, before the first payout. The files go to the private seller-ids bucket under
 * names the server picks, checked by their real bytes (a picture or a PDF, 5 MB at most). Only Finance sees them, through the server. Audited.
 */
export async function POST(req: Request) {
  const closed = await maintenanceFor('seller');
  if (closed) return closed;
  if (!supabaseConfigured) return jsonT({ error: tx('This needs an account. There are none in demo mode.') }, { status: 404 });
  const s = await sellerOnly();
  if (!s.ok) return s.res;
  if (!(await limit(`verify:${s.id}`, 5, 24 * 3_600_000))) return jsonT({ error: tx('Too many uploads today. Try again tomorrow.') }, { status: 429 });
  const form = await req.formData().catch(() => null);
  if (!form) return jsonT({ error: tx('Send the form again.') }, { status: 400 });
  const docType = String(form.get('docType') ?? '');
  const country = String(form.get('country') ?? '').toUpperCase();
  if (!(TYPES as readonly string[]).includes(docType)) return jsonT({ error: tx('Choose the kind of ID.') }, { status: 400 });
  if (!/^[A-Z]{2}$/.test(country)) return jsonT({ error: tx('Choose the country that issued it.') }, { status: 400 });
  const files: { side: 'front' | 'back'; bytes: Uint8Array; ext: string; type: string }[] = [];
  for (const side of ['front', 'back'] as const) {
    const f = form.get(side);
    if (!(f instanceof File) || f.size === 0) {
      if (side === 'front') return jsonT({ error: tx('Add a picture of the front of your ID.') }, { status: 400 });
      continue;
    }
    if (f.size > PROOF_MAX_BYTES) return jsonT({ error: tx('Each file can be at most 5 MB.') }, { status: 400 });
    const bytes = new Uint8Array(await f.arrayBuffer());
    const kind = proofKind(bytes);
    if (!kind) return jsonT({ error: tx('Use a PNG, JPEG, WebP picture or a PDF.') }, { status: 400 });
    files.push({ side, bytes, ...kind });
  }
  const admin = createAdminClient();
  const id = crypto.randomUUID();
  const paths: Record<string, string> = {};
  for (const f of files) {
    const path = `${s.id}/${id}-${f.side}.${f.ext}`;
    const { error } = await admin.storage.from('seller-ids').upload(path, f.bytes, { contentType: f.type, upsert: false });
    if (error) return jsonT({ error: tx('Could not store the file. Please try again.') }, { status: 500 });
    paths[f.side] = path;
  }
  const { error } = await admin.from('seller_verifications').insert({ id, seller_id: s.id, doc_type: docType, country, front_path: paths.front, back_path: paths.back ?? null });
  if (error) return jsonT({ error: tx('Could not save. Please try again.') }, { status: 500 });
  await admin.from('profiles').update({ country }).eq('id', s.id).is('country', null);
  await audit(s.id, 'verification_submitted', 'profile', s.id, { docType, country });
  await notifyAdmins('admin_payout', { what: 'a seller sent their ID for verification', detail: `${s.name} (${country}). Review it in Users & roles.` });
  return NextResponse.json({ ok: true });
}

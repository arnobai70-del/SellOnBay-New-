import { NextResponse } from 'next/server';
import { adminOnly } from '@/lib/admin/guard';
import { audit } from '@/lib/admin/audit';
import { maintenanceFor } from '@/lib/maintenance/service';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createAdminClient } from '@/lib/supabase/server';
import { jsonT } from '@/lib/i18n/jsonT';
import { tx } from '@/lib/i18n/tx';

export const runtime = 'nodejs';

/*
 * Finance opens a seller's ID document (owner, 2026-11-07: Finance access only). Every opening is in the audit log; the answer is a redirect to a
 * signed link that works for 5 minutes and is never stored or cached. Nobody else, sellers included, has a route to these files.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('admin');
  if (closed) return closed;
  const a = await adminOnly('finance');
  if (!a.ok) return a.res;
  if (!supabaseConfigured) return jsonT({ error: tx('This needs the database.') }, { status: 404 });
  const { id } = await params;
  const side = new URL(req.url).searchParams.get('side') === 'back' ? 'back' : 'front';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonT({ error: tx('Not found.') }, { status: 404 });
  const db = createAdminClient();
  const { data: v } = await db.from('seller_verifications').select('seller_id, front_path, back_path').eq('id', id).maybeSingle();
  const path = side === 'back' ? v?.back_path : v?.front_path;
  if (!v || !path) return jsonT({ error: tx('Not found.') }, { status: 404 });
  const { data, error } = await db.storage.from('seller-ids').createSignedUrl(path, 300);
  if (error || !data?.signedUrl) return jsonT({ error: tx('Could not open the file.') }, { status: 500 });
  await audit(a.id, 'verification_file_opened', 'profile', v.seller_id, { verification: id, side });
  return NextResponse.redirect(data.signedUrl, { status: 303, headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
}

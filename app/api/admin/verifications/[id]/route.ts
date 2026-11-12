import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { audit } from '@/lib/admin/audit';
import { maintenanceFor } from '@/lib/maintenance/service';
import { notify } from '@/lib/notify';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createAdminClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/validate';
import { jsonT } from '@/lib/i18n/jsonT';
import { tx } from '@/lib/i18n/tx';

export const runtime = 'nodejs';
const schema = z.object({ decision: z.enum(['approve', 'reject']), note: z.string().trim().max(500).default('') });

/* Finance decides a seller's identity check (owner, 2026-11-07: Finance access only). A rejection needs a reason the seller sees. Audited. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('admin');
  if (closed) return closed;
  const a = await adminOnly('finance');
  if (!a.ok) return a.res;
  if (!supabaseConfigured) return jsonT({ error: tx('This needs the database.') }, { status: 404 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonT({ error: tx('Not found.') }, { status: 404 });
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const { decision, note } = body.data;
  if (decision === 'reject' && note.length < 5) return jsonT({ error: tx('Write the reason for the seller (at least 5 characters).') }, { status: 400 });
  const db = createAdminClient();
  const { data: v } = await db.from('seller_verifications').select('id, seller_id, status').eq('id', id).maybeSingle();
  if (!v) return jsonT({ error: tx('Not found.') }, { status: 404 });
  if (v.status !== 'pending') return jsonT({ error: tx('This check was already decided.') }, { status: 409 });
  if (v.seller_id === a.id) return jsonT({ error: tx('You cannot decide your own check.') }, { status: 403 });
  const status = decision === 'approve' ? 'approved' : 'rejected';
  const { data: done, error } = await db
    .from('seller_verifications')
    .update({ status, reviewed_by: a.id, reviewed_at: new Date().toISOString(), review_note: note || null })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id');
  if (error || !done?.length) return jsonT({ error: tx('Could not save. Nothing was changed.') }, { status: 500 });
  if (decision === 'approve') await db.from('seller_profiles').update({ id_verified: true }).eq('user_id', v.seller_id);
  await audit(a.id, `verification_${status}`, 'profile', v.seller_id, { verification: id, note: note || null });
  await notify(v.seller_id, 'identity_checked', { ok: decision === 'approve', reason: note || null }, { email: true });
  return NextResponse.json({ ok: true });
}

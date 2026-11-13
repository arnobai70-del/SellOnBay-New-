import { NextResponse } from 'next/server';
import { z } from 'zod';
import { audit } from '@/lib/admin/audit';
import { isBlocked } from '@/lib/chatFilter';
import { maintenanceFor } from '@/lib/maintenance/service';
import { sellerOnly } from '@/lib/seller/guard';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createAdminClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/validate';
import { jsonT } from '@/lib/i18n/jsonT';
import { tx } from '@/lib/i18n/tx';

export const runtime = 'nodejs';
const RESERVED = ['admin', 'support', 'sellonbay', 'help', 'billing', 'sales', 'report', 'dev', 'administrator', 'business', 'api', 'dashboard'];
const schema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v === '' || /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(v), 'Use 3 to 40 letters, numbers and dashes.'),
  headline: z.string().trim().max(120),
  bio: z.string().trim().max(1000),
  skills: z.array(z.string().trim().min(1).max(30)).max(8),
  customAvailable: z.boolean(),
  replyTime: z.enum(['', 'Within a few hours', 'Within 24 hours', 'Within 2 days']),
  storePaused: z.boolean(),
});

/* The seller's public store: the words buyers see, never contact details (the same filter as chat), and the store link. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('seller');
  if (closed) return closed;
  if (!supabaseConfigured) return jsonT({ error: tx('This needs an account. There are none in demo mode.') }, { status: 404 });
  const s = await sellerOnly();
  if (!s.ok) return s.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const d = body.data;
  if (RESERVED.includes(d.username)) return jsonT({ error: tx('That store name is taken. Try another.') }, { status: 409 });
  if ([d.headline, d.bio, ...d.skills].some((t) => t && isBlocked(t))) return jsonT({ error: tx('Keep emails, phone numbers and links out of your store.') }, { status: 400 });
  const admin = createAdminClient();
  const row = { username: d.username || null, headline: d.headline, bio: d.bio, skills: d.skills, custom_available: d.customAvailable, reply_time: d.replyTime, store_paused: d.storePaused };
  const { data: before } = await admin.from('seller_profiles').select('user_id').eq('user_id', s.id).maybeSingle();
  const { error } = before ? await admin.from('seller_profiles').update(row).eq('user_id', s.id) : await admin.from('seller_profiles').insert({ user_id: s.id, display_name: s.name, ...row });
  if (error) return jsonT({ error: error.code === '23505' ? 'That store name is taken. Try another.' : 'Could not save. Please try again.' }, { status: error.code === '23505' ? 409 : 500 });
  await audit(s.id, 'store_profile_changed', 'profile', s.id, { username: d.username || null, paused: d.storePaused });
  return NextResponse.json({ ok: true });
}

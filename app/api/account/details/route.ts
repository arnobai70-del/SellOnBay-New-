import { NextResponse } from 'next/server';
import { z } from 'zod';
import { maintenanceFor } from '@/lib/maintenance/service';
import { limit } from '@/lib/rateLimit';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/validate';

export const runtime = 'nodejs';
// Phones in the international (E.164) form; the form takes spaces and dashes and drops them.
const schema = z.object({
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .or(z.literal('')),
  phone: z
    .string()
    .max(30)
    .transform((v) => v.replace(/[\s().-]/g, ''))
    .refine((v) => v === '' || /^\+[1-9][0-9]{6,14}$/.test(v), 'Write the phone with its country code, like +44 20 7946 0958.'),
  company: z.string().trim().max(120),
});

/* The signed-in person's own country, phone and company. Only their own row; the server checks who is asking before it writes. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('auth');
  if (closed) return closed;
  if (!supabaseConfigured) return NextResponse.json({ error: 'This needs an account. There are none in demo mode.' }, { status: 404 });
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  if (!(await limit(`details:${user.id}`, 20, 3_600_000))) return NextResponse.json({ error: 'Too many changes. Try again later.' }, { status: 429 });
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const d = body.data;
  const { error } = await createAdminClient()
    .from('profiles')
    .update({ country: d.country || null, phone: d.phone || null, company: d.company || null })
    .eq('id', user.id);
  if (error) return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

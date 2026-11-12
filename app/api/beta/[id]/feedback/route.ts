import { NextResponse } from 'next/server';
import { z } from 'zod';
import { saveFeedback } from '@/lib/beta/service';
import { maintenanceFor } from '@/lib/maintenance/service';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';
import { idOf, readJson } from '@/lib/validate';
import { jsonT } from '@/lib/i18n/jsonT';
import { tx } from '@/lib/i18n/tx';

export const runtime = 'nodejs';
const schema = z.object({ rating: z.coerce.number(), worked: z.string().max(2000).default(''), improve: z.string().max(2000).default('') });

/* The buyer's answers, a week after approval. Only the buyer of that request. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('checkout');
  if (closed) return closed;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  let buyerId = 'demo-buyer';
  if (supabaseConfigured) {
    const {
      data: { user },
    } = await (await createClient()).auth.getUser();
    if (!user) return jsonT({ error: tx('Sign in first.') }, { status: 401 });
    buyerId = user.id;
  }
  const r = await saveFeedback(buyerId, await idOf(params), body.data);
  return r.ok ? NextResponse.json({ ok: true }) : jsonT({ error: r.error }, { status: r.status });
}

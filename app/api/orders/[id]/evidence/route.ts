import { NextResponse } from 'next/server';
import { cannotAct } from '@/lib/accounts';
import { audit } from '@/lib/admin/audit';
import { buildEvidencePdf, type Audience } from '@/lib/evidence';
import { getOrder } from '@/lib/orders/service';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';
import { idOf } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const no = (error: string, status: number) => NextResponse.json({ error }, { status });

/*
 * The evidence file of an order, for its buyer, its seller, or an admin (who must have passed the authenticator code and sees full addresses; the
 * parties see them with the last part hidden). Every admin download is written to the audit log.
 */
export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('disputes'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const id = await idOf(params);
  const o = await getOrder(id);
  if (!o || !o.fundedAt) return no('Order not found.', 404);
  let audience: Audience = 'party';
  let adminId: string | null = null;
  if (supabaseConfigured) {
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return no('Sign in first.', 401);
    const { data: p } = await sb.from('profiles').select('role, banned, suspended_until').eq('id', user.id).single();
    if (!p || cannotAct(p)) return no('Not allowed.', 403);
    const party = o.buyerId === user.id || o.sellerId === user.id;
    if (p.role === 'admin') {
      const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel !== 'aal2') return no('Enter your authenticator code first.', 403);
      audience = 'admin';
      adminId = user.id;
    } else if (!party) return no('Order not found.', 404);
    else if (o.sellerId === user.id && o.buyerId !== user.id) {
      // Sellers need the authenticator code on every protected page and file, like the rest of their seller tools.
      const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel !== 'aal2') return no('Enter your authenticator code first.', 403);
    }
  }
  if (adminId) await audit(adminId, 'evidence_downloaded', 'order', o.id, {});
  return new NextResponse(new Uint8Array(await buildEvidencePdf(o, audience)), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="evidence-${o.id.slice(0, 8)}.pdf"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

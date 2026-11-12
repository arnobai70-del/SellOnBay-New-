import { NextResponse } from 'next/server';
import { adminOnly } from '@/lib/admin/guard';
import { auditStrict, AuditError } from '@/lib/admin/audit';
import { getAttempt, proofUrl } from '@/lib/payments/store';
import { idOf } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';
import { jsonT } from '@/lib/i18n/jsonT';
import { tx } from '@/lib/i18n/tx';

export const runtime = 'nodejs';

/* Finance opens a buyer's payment proof through a two-minute private link. Every opening is audited. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('admin'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly('finance');
  if (!a.ok) return a.res;
  const id = await idOf(params);
  const at = await getAttempt(id);
  if (!at?.proofPath) return jsonT({ error: tx('No proof for this payment.') }, { status: 404 });
  try {
    await auditStrict(a.id, 'payment_proof_opened', 'payment_attempt', id, {});
  } catch (e) {
    if (e instanceof AuditError) return jsonT({ error: e.message }, { status: 503 });
    throw e;
  }
  const url = await proofUrl(at.proofPath);
  if (!url || !url.startsWith('https://')) return jsonT({ error: tx('The proof could not be opened.') }, { status: 404 });
  return NextResponse.redirect(url, { status: 303, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}

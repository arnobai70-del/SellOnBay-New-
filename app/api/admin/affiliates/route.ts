import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { adminMoveAffiliate, adminQualification, adminReverseCommission, decideWithdrawal, saveAffSettings } from '@/lib/affiliates/service';
import { maintenanceFor } from '@/lib/maintenance/service';
import { readJson } from '@/lib/validate';
import { jsonT } from '@/lib/i18n/jsonT';

export const runtime = 'nodejs';
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('settings'), settings: z.record(z.string(), z.unknown()) }),
  z.object({
    action: z.literal('move'),
    id: z.string().uuid(),
    to: z.enum(['pending', 'qualified', 'suspended', 'rejected']),
    reason: z.string().max(300).default(''),
    note: z.string().max(300).default(''),
  }),
  z.object({ action: z.literal('qualification'), id: z.string().uuid(), mode: z.enum(['extend', 'restart']), days: z.coerce.number().int().optional(), note: z.string().max(10).default('') }),
  z.object({
    action: z.literal('withdrawal'),
    id: z.string().uuid(),
    decision: z.enum(['approve', 'reject', 'paid']),
    reference: z.string().max(120).default(''),
    note: z.string().max(120).default(''),
  }),
  z.object({ action: z.literal('reverse'), id: z.string().uuid(), reason: z.string().max(300).default(''), note: z.string().max(300).default('') }),
]);

/*
 * Admin › Affiliate Management (owner, 2026-11-12). Program settings need a Super Admin; affiliates, commissions and withdrawals need Finance or
 * Super. Every change is audited. (The action buttons send their typed text as "note".)
 */
export async function POST(req: Request) {
  const closed = await maintenanceFor('admin');
  if (closed) return closed;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const b = body.data;
  const a = b.action === 'settings' ? await adminOnly('super') : await adminOnly(['finance', 'super']);
  if (!a.ok) return a.res;
  const r =
    b.action === 'settings'
      ? await saveAffSettings(a.id, b.settings)
      : b.action === 'move'
        ? await adminMoveAffiliate(a.id, b.id, b.to, b.reason || b.note)
        : b.action === 'qualification'
          ? await adminQualification(a.id, b.id, b.mode, b.days ?? Number(b.note))
          : b.action === 'withdrawal'
            ? await decideWithdrawal(a.id, b.id, b.decision, b.reference || b.note)
            : await adminReverseCommission(a.id, b.id, b.reason || b.note);
  return r.ok ? NextResponse.json({ ok: true }) : jsonT({ error: r.error }, { status: r.status });
}

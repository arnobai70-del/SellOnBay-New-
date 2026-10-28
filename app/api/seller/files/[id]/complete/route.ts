import { NextResponse, after } from 'next/server';
import { sellerOnly } from '@/lib/auth/guards';
import { completeUpload, runChecks } from '@/lib/files/service';
import { idOf } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
export const maxDuration = 300;

/* The seller says the upload finished. The size is checked now; the hash and archive checks run right after the answer (no malware scan). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('upload'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const who = await sellerOnly();
  if (!who.ok) return who.res;
  const id = await idOf(params);
  const r = await completeUpload(who.id, id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  if (r.value.state === 'checking')
    after(() =>
      runChecks(id).then(
        () => undefined,
        () => undefined,
      ),
    ); // the scheduled job retries if this fails
  return NextResponse.json({ ok: true, state: r.value.state });
}

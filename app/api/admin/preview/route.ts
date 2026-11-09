import { draftMode } from 'next/headers';
import { NextResponse } from 'next/server';
import { adminOnly } from '@/lib/admin/guard';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';

/*
 * Draft preview for Admin › Content › Pages (owner, 2026-11-09): the home page is static (revalidate 300) and renders on request only in Next's
 * Draft Mode, which this route turns on for a content admin and then opens the page with ?draft=1 (the other pages still read that). ?exit=1
 * turns it off. Only same-site paths are accepted.
 */
export async function GET(req: Request) {
  const closed = await maintenanceFor('admin'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const url = new URL(req.url);
  const draft = await draftMode();
  if (url.searchParams.get('exit') === '1') {
    draft.disable();
    return NextResponse.redirect(new URL('/', url));
  }
  const a = await adminOnly('content');
  if (!a.ok) return a.res;
  const path = url.searchParams.get('path') ?? '/';
  if (!/^\/(?!\/)[^\s\\]*$/.test(path) || path.length > 300) return NextResponse.json({ error: 'Not a page of this site.' }, { status: 400 });
  draft.enable();
  const to = new URL(path, url);
  to.searchParams.set('draft', '1');
  const t = url.searchParams.get('t');
  if (t && /^\d{1,15}$/.test(t)) to.searchParams.set('t', t);
  return NextResponse.redirect(to);
}

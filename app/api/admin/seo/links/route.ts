import { NextResponse } from 'next/server';
import { adminOnly } from '@/lib/admin/guard';
import { runLinkCheck } from '@/lib/seo/linkCheck';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
export const maxDuration = 120;

/* Runs the link check: every sitemap address and top-bar link is opened once from this server. Admins only. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('seo'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly();
  if (!a.ok) return a.res;
  const r = await runLinkCheck(a.id, new URL(req.url).origin);
  return r.ok ? NextResponse.json({ ok: true, broken: r.report.broken.length, checked: r.report.checked }) : NextResponse.json({ error: r.error }, { status: r.status });
}

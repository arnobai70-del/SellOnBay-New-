import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* For the host's health check and an uptime monitor: answers 200 while the app is up. Says nothing about keys, the database or the build. */
export function GET() {
  return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
}

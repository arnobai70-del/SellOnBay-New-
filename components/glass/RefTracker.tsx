'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

/*
 * Affiliate links (owner, 2026-11-12): a visit with ?ref=CODE is counted once per tab (POST /api/affiliates/click). The server sets the signed
 * referral cookie only when this browser accepted analytics cookies (lb-cookies = "all", components/CookieNotice.tsx); otherwise the click is
 * counted and nothing is remembered. Nothing about the visitor is sent but the code and the website's address.
 */
export function RefTracker() {
  const params = useSearchParams();
  const path = usePathname() ?? '/';
  const code = (params.get('ref') ?? '').toUpperCase();
  useEffect(() => {
    if (!/^[A-Z0-9]{4,16}$/.test(code)) return;
    let consent = false;
    try {
      if (sessionStorage.getItem('sob-ref-sent') === code) return;
      sessionStorage.setItem('sob-ref-sent', code);
      consent = localStorage.getItem('lb-cookies') === 'all';
    } catch {
      /* storage blocked: count the click without remembering it */
    }
    const product = path.match(/^\/websites\/([a-z0-9-]{1,120})$/)?.[1] ?? '';
    void fetch('/api/affiliates/click', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, product, consent }), keepalive: true }).catch(() => {});
  }, [code, path]);
  return null;
}

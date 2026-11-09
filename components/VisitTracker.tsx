'use client';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

/* Visitor analytics (lib/analytics.ts): tells the server which page was opened and which Buy link was clicked. No cookie and nothing stored in
   the browser; a browser that asks not to be tracked (Global Privacy Control or Do Not Track) sends nothing. */
const quiet = () => {
  const n = navigator as Navigator & { globalPrivacyControl?: boolean };
  return n.globalPrivacyControl === true || n.doNotTrack === '1';
};
function send(body: object) {
  try {
    const data = JSON.stringify(body);
    if (!navigator.sendBeacon?.('/api/track', new Blob([data], { type: 'application/json' })))
      void fetch('/api/track', { method: 'POST', body: data, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => {});
  } catch {
    // never in the way of the page
  }
}

export function VisitTracker() {
  const path = usePathname();
  const query = useSearchParams().toString();

  useEffect(() => {
    if (quiet()) return;
    // Sent with sendBeacon once the page has loaded, so it never competes with the page's own requests.
    const go = () => send({ p: path, q: query });
    if (document.readyState === 'complete') {
      const t = window.setTimeout(go, 0);
      return () => window.clearTimeout(t);
    }
    window.addEventListener('load', go, { once: true });
    return () => window.removeEventListener('load', go);
  }, [path, query]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]');
      if (!a || quiet()) return;
      const url = new URL((a as HTMLAnchorElement).href, location.href);
      const id = url.origin === location.origin && url.pathname === '/checkout' ? url.searchParams.get('id') : null;
      if (id) send({ buy: id });
    };
    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);

  return null;
}

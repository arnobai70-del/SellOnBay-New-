'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { COOKIE_EVENT, COOKIE_KEY } from './GoogleAnalytics';

/*
 * Cookie notice with a real choice. The site needs only a few cookies to work (the sign-in session and choices kept in the browser). Google Analytics is
 * extra: it loads only after "Accept analytics" (lb-cookies = "all", components/GoogleAnalytics.tsx). "Only what is needed" (lb-cookies = "1") loads nothing more.
 * Storage can be blocked or empty (private windows), so every read and write is wrapped, and the notice simply shows again.
 */
const KEY = COOKIE_KEY;

export function CookieNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setShow(true);
    } catch {
      setShow(true);
    }
  }, []);
  const answer = (v: '1' | 'all') => {
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* the notice will show again next time, that is fine */
    }
    window.dispatchEvent(new Event(COOKIE_EVENT));
    setShow(false);
  };
  if (!show) return null;
  return (
    <div className="cookie" role="region" aria-label="Cookies">
      <p>
        We use the cookies the site needs to work, like keeping you signed in. With your OK we also use Google Analytics to see which pages help, and never for advertising. The live chat (Tawk.to)
        sets its own cookies so a conversation carries on. <Link href="/privacy#cookies">What we store</Link>
      </p>
      <div className="cookie-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-line btn-sm" type="button" onClick={() => answer('1')}>
          Only what is needed
        </button>
        <button className="btn btn-blue btn-sm" type="button" onClick={() => answer('all')}>
          Accept analytics
        </button>
      </div>
    </div>
  );
}

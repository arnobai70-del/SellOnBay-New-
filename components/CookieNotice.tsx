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

export type CookieWords = { region: string; text: string; more: string; needed: string; all: string; link: string };
const ENGLISH: CookieWords = {
  region: 'Cookies',
  text: 'We use the cookies the site needs to work, like keeping you signed in. With your OK we also use Google Analytics to see which pages help, and never for advertising. The live chat (Tawk.to) sets its own cookies so a conversation carries on.',
  more: 'What we store',
  needed: 'Only what is needed',
  all: 'Accept analytics',
  link: '/legal/privacy#cookies',
};
export function CookieNotice({ words = ENGLISH }: { words?: CookieWords }) {
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
    <div className="glass sob-cookie" role="region" aria-label={words.region}>
      <p>
        {words.text} <Link href={words.link}>{words.more}</Link>
      </p>
      <div className="sob-cookie-actions">
        <button className="btn ghost sm" type="button" onClick={() => answer('1')}>
          {words.needed}
        </button>
        <button className="btn sm" type="button" onClick={() => answer('all')}>
          {words.all}
        </button>
      </div>
    </div>
  );
}

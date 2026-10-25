'use client';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

/*
 * Google Analytics 4 on the public pages, ONLY after the visitor chose "Accept analytics" in the cookie notice (stored in this browser as lb-cookies = "all"),
 * and never for a browser that sends Global Privacy Control or Do Not Track. Until then nothing is loaded and no Google cookie is set.
 * The id is public (it is in the page source of every site that uses it); NEXT_PUBLIC_GA_ID replaces it, and "off" turns it off.
 */
const ID = process.env.NEXT_PUBLIC_GA_ID ?? 'G-FEK9C0CM04';
const VALID = /^G-[A-Z0-9]{6,14}$/;
export const COOKIE_KEY = 'lb-cookies';
export const COOKIE_EVENT = 'lb-cookies-changed';

type Gtag = (...args: unknown[]) => void;
type GaWindow = Window & { dataLayer?: unknown[]; gtag?: Gtag };

const optedOutByBrowser = () => {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; doNotTrack?: string | null };
  return nav.globalPrivacyControl === true || nav.doNotTrack === '1' || (window as Window & { doNotTrack?: string }).doNotTrack === '1';
};
const accepted = () => {
  try {
    return localStorage.getItem(COOKIE_KEY) === 'all';
  } catch {
    return false;
  }
};

export function GoogleAnalytics() {
  const [on, setOn] = useState(false);
  const path = usePathname();
  const search = useSearchParams().toString();

  // Decide now and whenever the visitor answers the cookie notice.
  useEffect(() => {
    if (!VALID.test(ID)) return;
    const decide = () => setOn(accepted() && !optedOutByBrowser());
    decide();
    window.addEventListener(COOKIE_EVENT, decide);
    return () => window.removeEventListener(COOKIE_EVENT, decide);
  }, []);

  // Load Google's script once, after consent.
  useEffect(() => {
    if (!on || document.getElementById('ga-script')) return;
    const w = window as GaWindow;
    w.dataLayer = w.dataLayer || [];
    w.gtag = function gtag(...args: unknown[]) {
      w.dataLayer!.push(args);
    };
    w.gtag('js', new Date());
    w.gtag('config', ID, { send_page_view: false, anonymize_ip: true }); // page views are sent below, once per page, so a move between pages counts
    const s = document.createElement('script');
    s.id = 'ga-script';
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${ID}`;
    document.head.appendChild(s);
  }, [on]);

  // One page view per page the visitor opens.
  useEffect(() => {
    if (!on) return;
    (window as GaWindow).gtag?.('event', 'page_view', { page_path: path + (search ? '?' + search : ''), page_location: window.location.href, page_title: document.title });
  }, [on, path, search]);

  return null;
}

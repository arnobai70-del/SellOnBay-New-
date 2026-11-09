'use client';
import { useEffect } from 'react';

/*
 * Live chat from Tawk.to on the public pages (app/(site)/layout.tsx), not on dashboards. The script loads once, after the page has settled, so it
 * never slows the first screen. The ids are public (they are in the embed code); NEXT_PUBLIC_TAWK_PROPERTY_ID and NEXT_PUBLIC_TAWK_WIDGET_ID
 * override them, and setting either to "off" turns the chat off. On phones the bubble sits above the bottom tab bar.
 */
const PROPERTY = process.env.NEXT_PUBLIC_TAWK_PROPERTY_ID ?? '6ad927a20700ae345f24234b';
const WIDGET = process.env.NEXT_PUBLIC_TAWK_WIDGET_ID ?? '1k5g45lh0';
const ID = /^[a-z0-9]{6,40}$/i;

type TawkWindow = Window & { Tawk_API?: Record<string, unknown>; Tawk_LoadStart?: Date };

export function TawkChat() {
  useEffect(() => {
    if (!ID.test(PROPERTY) || !ID.test(WIDGET)) return;
    const w = window as TawkWindow;
    if (document.getElementById('tawk-script')) return;
    const load = () => {
      if (document.getElementById('tawk-script')) return;
      w.Tawk_API = w.Tawk_API || {};
      w.Tawk_API.customStyle = {
        visibility: {
          desktop: { position: 'br', xOffset: 20, yOffset: 20 },
          mobile: { position: 'br', xOffset: 12, yOffset: 76 },
        },
      };
      w.Tawk_LoadStart = new Date();
      const s = document.createElement('script');
      s.id = 'tawk-script';
      s.async = true;
      s.src = `https://embed.tawk.to/${PROPERTY}/${WIDGET}`;
      s.charset = 'UTF-8';
      s.setAttribute('crossorigin', '*');
      document.body.appendChild(s);
    };
    // Owner speed rule (2026-11-09): the chat loads 4 seconds after the page, or at the first scroll or touch, whichever comes first.
    let done = false;
    const once = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      window.removeEventListener('scroll', once);
      window.removeEventListener('pointerdown', once);
      load();
    };
    const timer = window.setTimeout(once, 4000);
    window.addEventListener('scroll', once, { passive: true, once: true });
    window.addEventListener('pointerdown', once, { passive: true, once: true });
    return () => {
      done = true;
      window.clearTimeout(timer);
      window.removeEventListener('scroll', once);
      window.removeEventListener('pointerdown', once);
    };
  }, []);
  return null;
}

'use client';
import { useEffect, useRef } from 'react';

type TurnstileApi = {
  render: (el: HTMLElement, o: { sitekey: string; callback: (t: string) => void; 'expired-callback'?: () => void; 'error-callback'?: () => void }) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '1x00000000000000000000AA'; // Cloudflare's test key until real keys are set
let loading: Promise<void> | null = null;
const load = () =>
  (loading ??= new Promise<void>((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => res();
    s.onerror = () => rej(new Error('turnstile'));
    document.head.appendChild(s);
  }));

/* The Cloudflare Turnstile bot check. Calls onToken with a one-time token the server verifies; calls it with '' when the token expires. */
export function Turnstile({ onToken, siteKey = SITE_KEY }: { onToken: (t: string) => void; siteKey?: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let id: string | undefined;
    let dead = false;
    load()
      .then(() => {
        if (dead || !box.current || !window.turnstile) return;
        id = window.turnstile.render(box.current, { sitekey: siteKey, callback: onToken, 'expired-callback': () => onToken(''), 'error-callback': () => onToken('') });
      })
      .catch(() => onToken(''));
    return () => {
      dead = true;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [onToken, siteKey]);
  return <div ref={box} className="turnstile" />;
}

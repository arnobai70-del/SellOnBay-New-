'use client';
import { useSyncExternalStore } from 'react';

/*
 * The light and dark switch in the top bar. The public pages are dark unless the visitor chose light: the choice is <html data-theme="light"> (app/light.css),
 * remembered in this browser and set before paint by the script in app/layout.tsx, which must use the same key. Dashboards stay dark.
 */
const KEY = 'sob-theme';
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const isLight = () => document.documentElement.dataset.theme === 'light';

function setLight(light: boolean) {
  if (light) document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  try {
    if (light) localStorage.setItem(KEY, 'light');
    else localStorage.removeItem(KEY);
  } catch {
    // private window or blocked storage: the choice lasts until the page is left
  }
  listeners.forEach((fn) => fn());
}

export function ThemeSwitch() {
  const light = useSyncExternalStore(subscribe, isLight, () => false);
  return (
    <button
      type="button"
      className="theme-switch"
      role="switch"
      aria-checked={light}
      aria-label="Light mode"
      title={light ? 'Switch to dark mode' : 'Switch to light mode'}
      onClick={() => setLight(!light)}
    >
      <span className="theme-track">
        <span className="theme-thumb">
          {/* Both icons are drawn and CSS picks one from <html data-theme>, so a light page shows the right one before this script runs. */}
          <svg className="theme-sun" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4.5" />
            <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
          </svg>
          <svg className="theme-moon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
            <path d="M20.5 14.6A8.8 8.8 0 0 1 9.4 3.5a.7.7 0 0 0-.9-.9 10 10 0 1 0 12.9 12.9.7.7 0 0 0-.9-.9Z" />
          </svg>
        </span>
      </span>
    </button>
  );
}

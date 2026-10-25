'use client';
import { useSyncExternalStore } from 'react';

/* Saved sites and recently viewed sites, kept in the browser (no account needed).
   When a visitor signs in, these can be copied to their profile. */
const KEYS = { saved: 'lb:saved', recent: 'lb:recent' } as const;
type Key = keyof typeof KEYS;

const EMPTY: string[] = [];
const snaps: Partial<Record<Key, string[]>> = {};
const listeners = new Set<() => void>();

function read(k: Key): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEYS[k]) || '[]');
  } catch {
    return [];
  }
}
const get = (k: Key) => (snaps[k] ??= read(k));
function set(k: Key, v: string[]) {
  snaps[k] = v;
  try {
    localStorage.setItem(KEYS[k], JSON.stringify(v));
  } catch {
    /* private mode: keep in memory only */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEYS.saved || e.key === KEYS.recent) {
      delete snaps.saved;
      delete snaps.recent;
      cb();
    }
  };
  addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    removeEventListener('storage', onStorage);
  };
}

export const useList = (k: Key) =>
  useSyncExternalStore(
    subscribe,
    () => get(k),
    () => EMPTY,
  );
export const toggleSaved = (id: string) => {
  const s = get('saved');
  set('saved', s.includes(id) ? s.filter((x) => x !== id) : [id, ...s]);
};
export const pushRecent = (id: string) => {
  const r = get('recent');
  if (r[0] !== id) set('recent', [id, ...r.filter((x) => x !== id)].slice(0, 8));
};

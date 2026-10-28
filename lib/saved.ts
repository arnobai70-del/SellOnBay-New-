'use client';
import { useSyncExternalStore } from 'react';

/* Saved sites and recently viewed sites, kept in the browser (no account needed).
   When a visitor signs in, these can be copied to their profile. */
const KEYS = { saved: 'lb:saved', recent: 'lb:recent' } as const;
type Key = keyof typeof KEYS;

const EMPTY: string[] = [];
/* The last list read for each key, with the raw text it came from. Every read compares the text, so a page always shows what is in this
   browser now, also when something else wrote it (found in the browser suite: the visitor panel kept an empty Saved list it read earlier). */
const snaps: Partial<Record<Key, { raw: string; list: string[] }>> = {};
const listeners = new Set<() => void>();
const memoryOnly = new Set<Key>(); // writing failed (private mode): this page's own list wins

function rawOf(k: Key): string {
  if (memoryOnly.has(k)) return snaps[k]!.raw;
  try {
    return localStorage.getItem(KEYS[k]) || '[]';
  } catch {
    return snaps[k]?.raw ?? '[]'; // storage blocked: keep what this page has in memory
  }
}
function parse(raw: string): string[] {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function get(k: Key): string[] {
  const raw = rawOf(k);
  const s = snaps[k];
  if (s && s.raw === raw) return s.list;
  const list = parse(raw);
  snaps[k] = { raw, list };
  return list;
}
function set(k: Key, v: string[]) {
  const raw = JSON.stringify(v);
  snaps[k] = { raw, list: v };
  try {
    localStorage.setItem(KEYS[k], raw);
  } catch {
    memoryOnly.add(k); // private mode: keep in memory only
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEYS.saved || e.key === KEYS.recent) cb();
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
/* The list as it is in this browser now (what useList shows). */
export const readList = (k: Key) => get(k);
export const toggleSaved = (id: string) => {
  const s = get('saved');
  set('saved', s.includes(id) ? s.filter((x) => x !== id) : [id, ...s]);
};
export const pushRecent = (id: string) => {
  const r = get('recent');
  if (r[0] !== id) set('recent', [id, ...r.filter((x) => x !== id)].slice(0, 8));
};

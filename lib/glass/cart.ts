'use client';
import { useSyncExternalStore } from 'react';

/*
 * The cart holds only listing ids, in this browser. Names and prices are always read from the server (POST /api/cart), so a changed page cannot change a price.
 * Storage can be blocked: the cart then lasts until the page is left.
 */
const KEY = 'sob-cart';
const EVENT = 'sob-cart-changed';
export const CART_MAX = 5;
const EMPTY: string[] = [];
let memory: string[] = EMPTY;
let text = '';

function read(): string[] {
  try {
    const now = localStorage.getItem(KEY) ?? '';
    if (now !== text) {
      text = now;
      const parsed: unknown = now ? JSON.parse(now) : [];
      memory = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, CART_MAX) : EMPTY;
    }
  } catch {
    /* blocked or junk: keep what this page has */
  }
  return memory;
}
function write(next: string[]) {
  memory = next;
  try {
    text = JSON.stringify(next);
    localStorage.setItem(KEY, text);
  } catch {
    /* blocked */
  }
  window.dispatchEvent(new Event(EVENT));
}
export const addToCart = (id: string) => {
  const cur = read();
  if (!cur.includes(id) && cur.length < CART_MAX) write([...cur, id]);
};
export const removeFromCart = (id: string) => write(read().filter((x) => x !== id));
export const clearCart = () => write([]);

const subscribe = (fn: () => void) => {
  window.addEventListener(EVENT, fn);
  window.addEventListener('storage', fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener('storage', fn);
  };
};
export const useCart = () => useSyncExternalStore(subscribe, read, () => EMPTY);

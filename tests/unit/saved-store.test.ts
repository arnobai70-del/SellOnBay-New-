import { beforeEach, describe, expect, it } from 'vitest';

/* lib/saved.ts in a browser without React: a plain map stands in for localStorage. */
const box = new Map<string, string>();
let blocked = false;
const storage = {
  getItem: (k: string) => box.get(k) ?? null,
  setItem: (k: string, v: string) => {
    if (blocked) throw new Error('QuotaExceededError');
    box.set(k, v);
  },
};
Object.assign(globalThis, { localStorage: storage, addEventListener: () => {}, removeEventListener: () => {} });
const { pushRecent, readList, toggleSaved } = await import('@/lib/saved');

describe('saved and recently viewed (found in the browser suite: the visitor panel showed an old empty Saved list)', () => {
  beforeEach(() => {
    box.clear();
    blocked = false;
  });
  it('always shows what is in this browser now, also when something else wrote it after the first read', () => {
    expect(readList('saved')).toEqual([]);
    box.set('lb:saved', JSON.stringify(['saffron-table']));
    expect(readList('saved')).toEqual(['saffron-table']);
    expect(readList('saved')).toBe(readList('saved')); // the same array while nothing changed (useSyncExternalStore needs that)
  });
  it('saving and opening write through; junk in storage reads as an empty list', () => {
    toggleSaved('a');
    pushRecent('b');
    expect(JSON.parse(box.get('lb:saved')!)).toEqual(['a']);
    expect(readList('recent')).toEqual(['b']);
    box.set('lb:saved', '{"not":"a list"}');
    expect(readList('saved')).toEqual([]);
    box.set('lb:saved', '[1,"x",null]');
    expect(readList('saved')).toEqual(['x']);
  });
  it('when the browser refuses to store, the page keeps its own list in memory', () => {
    blocked = true;
    toggleSaved('kept');
    expect(readList('saved')).toEqual(['kept']);
  });
});

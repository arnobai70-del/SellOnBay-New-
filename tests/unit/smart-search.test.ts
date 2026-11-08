import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { browse, readQuery } from '@/lib/glass/browse';
import { domainGuess, fieldMatch, helpAnchor, highlight, rank, scoreDoc, similarity, suggestions } from '@/lib/searchCore';

const src = (p: string) => readFileSync(p, 'utf8');

describe('smart search scoring (owner, 2026-11-08)', () => {
  it('matches any part of a word, any letter sequence and typos', () => {
    expect(fieldMatch('bak', 'Bakery Pro')).toBe(1); // start
    expect(fieldMatch('pro', 'Bakery Pro')).toBe(0.9); // start of a word
    expect(fieldMatch('aker', 'Bakery Pro')).toBe(0.75); // inside a word
    expect(fieldMatch('bakry', 'Bakery Pro')).toBeGreaterThan(0); // a typo
    expect(fieldMatch('zzz', 'Bakery Pro')).toBe(0);
    expect(similarity('bakery', 'bakery')).toBe(1);
  });
  it('weighs title over category over seller over description over tags', () => {
    const at = (field: string) => scoreDoc('shop', { [field]: 'shop' });
    expect(at('title')).toBeGreaterThan(at('category'));
    expect(at('category')).toBeGreaterThan(at('seller'));
    expect(at('seller')).toBeGreaterThan(at('description'));
    expect(at('description')).toBeGreaterThan(at('tags'));
  });
  it('ranks, needs 2 characters, and suggests when nothing matches', () => {
    const list = ['Bakery Pro', 'ShopWave Store', 'Dental Clinic'];
    expect(rank('sto', list, (t) => ({ title: t })).map((r) => r.item)).toEqual(['ShopWave Store']);
    expect(rank('s', list, (t) => ({ title: t }))).toEqual([]);
    expect(suggestions('dentel', list)).toContain('Dental Clinic');
  });
  it('highlights the matched part and guesses a domain', () => {
    expect(highlight('Bakery Pro', 'bak')).toEqual([[0, 3]]);
    expect(highlight('Shop shop', 'shop')).toEqual([
      [0, 4],
      [5, 9],
    ]);
    expect(domainGuess('bakery')).toBe('bakery.com');
    expect(domainGuess('https://www.bakery.io')).toBe('bakery.io');
    expect(domainGuess('two words')).toBeNull();
    expect(helpAnchor('How do payouts work?')).toBe('q-how-do-payouts-work');
  });
  it('/websites keeps the smart ranking when given', () => {
    const item = (id: string, name: string) => ({ id, name, desc: '', cat: '', seller: '', price: 30, rating: 0, reviews: 0, sold: 0, added: '2026-01-01' });
    const list = [item('a', 'Bakery'), item('b', 'Store')];
    const r = browse(list, readQuery({ q: 'bakry' }, []), () => null, new Map([['a', 1]]));
    expect(r.items.map((x) => x.id)).toEqual(['a']);
  });
});

describe('search plumbing', () => {
  it('Postgres ranks with full-text and pg_trgm, server only', () => {
    const m = src('supabase/migrations/0081_smart_search.sql');
    expect(m).toMatch(/create extension if not exists pg_trgm with schema extensions/);
    expect(m).toMatch(/gin_trgm_ops/);
    expect(m).toMatch(/to_tsvector\('simple'/);
    expect(m).toMatch(/revoke all on function search_listings\(text, int\) from public, anon, authenticated/);
  });
  it('the API is rate limited and the box is a real form with keyboard support', () => {
    expect(src('app/api/search/route.ts')).toMatch(/limit\(`search:/);
    const box = src('components/glass/SearchBox.tsx');
    expect(box).toMatch(/<form\s+action=\{action\}\s+method="get"/);
    expect(box).toMatch(/ArrowDown/);
    expect(box).toMatch(/Escape/);
    expect(box).toMatch(/setTimeout\([\s\S]*?200\)/);
    expect(box).toMatch(/typed\.length < 2\) return/);
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCOPES, checkScopeChange, effectiveScopes, hasScope } from '@/lib/admin/scopes';

const root = path.join(__dirname, '..', '..');
const walk = (dir: string, name: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name), name) : e.name === name ? [path.join(dir, e.name)] : []));

describe('admin scopes (D-H)', () => {
  it('has Super Admin and the five scoped roles; Negotiator is reserved', () => {
    expect([...SCOPES]).toEqual(['super', 'finance', 'catalog', 'support', 'content', 'delivery']);
  });
  it('an admin from before scopes existed (null) is a Super Admin; unknown and reserved values grant nothing', () => {
    expect(effectiveScopes(null)).toEqual(['super']);
    expect(effectiveScopes(undefined)).toEqual(['super']);
    expect(effectiveScopes([])).toEqual([]);
    expect(effectiveScopes(['finance', 'negotiator', 'root', 'finance'])).toEqual(['finance']);
  });
  it('Super Admin has every permission; others only their own; a list means any one of them', () => {
    expect(hasScope(['super'], 'finance')).toBe(true);
    expect(hasScope(['catalog'], 'finance')).toBe(false);
    expect(hasScope(['catalog'], ['finance', 'catalog'])).toBe(true);
    expect(hasScope([], 'content')).toBe(false);
  });
  it('a scope change refuses unknown values, the reserved Negotiator role and an empty set', () => {
    expect(checkScopeChange(['finance', 'delivery'])).toEqual({ ok: true, scopes: ['finance', 'delivery'] });
    expect(checkScopeChange(['negotiator'])).toMatchObject({ ok: false });
    expect(checkScopeChange(['root'])).toMatchObject({ ok: false });
    expect(checkScopeChange([])).toMatchObject({ ok: false });
  });
});

describe('every admin door names its permission', () => {
  it('every admin API route calls adminOnly with a scope', () => {
    const routes = walk(path.join(root, 'app', 'api', 'admin'), 'route.ts');
    expect(routes.length).toBeGreaterThan(30);
    for (const r of routes) {
      const s = fs.readFileSync(r, 'utf8');
      expect(s, r).toMatch(/adminOnly\((['[])/);
      expect(s, r).not.toMatch(/adminOnly\(\)/);
    }
  });
  it('every admin page except the overview asks requireViewer for a scope', () => {
    const pages = walk(path.join(root, 'app', '(dash)', 'dashboard', 'admin'), 'page.tsx');
    for (const p of pages) {
      const s = fs.readFileSync(p, 'utf8');
      if (!/requireViewer\(/.test(s)) continue;
      if (path.relative(path.join(root, 'app', '(dash)', 'dashboard', 'admin'), p) === 'page.tsx') continue;
      expect(s, p).toMatch(/roles: \['admin'\], scope: /);
    }
  });
});

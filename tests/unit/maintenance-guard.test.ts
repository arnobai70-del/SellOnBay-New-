import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { moduleOfApi } from '@/lib/maintenance/config';
import { closedForPath, maintenanceJson } from '@/lib/maintenance/guard';
import { closedRow, forgetRows, isActive, memoryRows, retryAfterSeconds, shownMessage, type ModuleRow } from '@/lib/maintenance/state';

const NOW = Date.parse('2026-10-20T12:00:00Z');
const row = (p: Partial<ModuleRow> = {}): ModuleRow => ({ key: 'seller', enabled: true, message: '', startAt: null, endAt: null, updatedBy: null, updatedAt: NOW, ...p });

describe('maintenance state', () => {
  it('is closed only while on and inside its planned window', () => {
    expect(isActive(row(), NOW)).toBe(true);
    expect(isActive(row({ enabled: false }), NOW)).toBe(false);
    expect(isActive(row({ startAt: NOW + 60_000 }), NOW)).toBe(false); // planned, not started
    expect(isActive(row({ startAt: NOW - 60_000, endAt: NOW + 60_000 }), NOW)).toBe(true);
    expect(isActive(row({ endAt: NOW }), NOW)).toBe(false); // over: the module opens again by itself
  });

  it('tells clients when to come back', () => {
    expect(retryAfterSeconds(row(), NOW)).toBe(300);
    expect(retryAfterSeconds(row({ endAt: NOW + 90 * 60_000 }), NOW)).toBe(5400);
    expect(retryAfterSeconds(row({ endAt: NOW + 1000 }), NOW)).toBe(30);
    expect(retryAfterSeconds(row({ endAt: NOW + 30 * 86_400_000 }), NOW)).toBe(86_400);
  });

  it('answers an API with 503, Retry-After and the message', async () => {
    const r = maintenanceJson(row({ message: 'Back at noon', endAt: NOW + 600_000 }), NOW);
    expect(r.status).toBe(503);
    expect(r.headers.get('retry-after')).toBe('600');
    expect(r.headers.get('cache-control')).toBe('no-store');
    const body = await r.json();
    expect(body.error).toBe('Back at noon');
    expect(body.maintenance).toMatchObject({ module: 'seller', label: 'Seller dashboard' });
    expect(shownMessage(row())).toMatch(/Seller dashboard is being updated/);
  });

  it('closes only the module that is in maintenance (demo memory store)', async () => {
    memoryRows.clear();
    memoryRows.set('seller', row());
    forgetRows();
    expect(await closedRow('seller', NOW)).not.toBeNull();
    expect(await closedRow('buyer', NOW)).toBeNull();
    expect((await closedForPath('/dashboard/seller', NOW))?.api).toBe(false);
    expect((await closedForPath('/api/seller/payout', NOW))?.api).toBe(true);
    expect(await closedForPath('/dashboard/buyer', NOW)).toBeNull();
    expect(await closedForPath('/browse', NOW)).toBeNull();
    expect(await closedForPath('/api/webhooks/payment', NOW)).toBeNull();
    memoryRows.clear();
    forgetRows();
  });
});

describe('every API route checks maintenance for itself', () => {
  const root = path.join(__dirname, '..', '..', 'app', 'api');
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }))
      if (e.isDirectory()) walk(path.join(d, e.name));
      else if (e.name === 'route.ts') files.push(path.join(d, e.name));
  };
  walk(root);
  for (const f of files) {
    const url =
      '/' +
      path
        .relative(root, path.dirname(f))
        .split(path.sep)
        .map((s) => s.replace(/^\[.*\]$/, 'x'))
        .join('/');
    const key = moduleOfApi(url);
    it(`${url} → ${key ?? 'always open'}`, () => {
      const text = fs.readFileSync(f, 'utf8');
      const handlers = (text.match(/^export async function (GET|POST|PUT|PATCH|DELETE)\(/gm) ?? []).length;
      const guards = text.match(/maintenanceFor\('([a-z]+)'\)/g) ?? [];
      if (key === null) expect(guards).toEqual([]);
      else {
        expect(guards.length).toBe(handlers);
        expect(new Set(guards)).toEqual(new Set([`maintenanceFor('${key}')`]));
      }
    });
  }
});

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * app_settings has changed_at and changed_by (migration 0040), not updated_at. Writing updated_at makes every save fail on a real database
 * while the memory store hides it (found on staging, 2026-11-12: the affiliate, buyer and seller subscription switches could not be saved).
 */
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? (['node_modules', '.next'].some((x) => n.startsWith(x)) ? [] : walk(p)) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });

describe('app_settings writes use its real columns', () => {
  it('no code writes updated_at into app_settings', () => {
    const bad = [...walk('lib'), ...walk('app')].filter((f) => /from\('app_settings'\)\s*\.\s*(upsert|insert|update)\([^)]*updated_at/.test(readFileSync(f, 'utf8').replace(/\n\s*/g, ' ')));
    expect(bad).toEqual([]);
  });
});

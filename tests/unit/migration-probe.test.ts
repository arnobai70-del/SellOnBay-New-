import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JavaScript module without types
import { classify, objectsOf, probeSql, statements } from '../../scripts/lib/migrationProbe.mjs';
// @ts-expect-error plain JavaScript module without types
import { forPglite, migrationFiles, STAND_INS } from '../../scripts/lib/pgliteSupabase.mjs';
// @ts-expect-error plain JavaScript module without types
import { expectedPlan } from '../../scripts/migration-probe.mjs';

type Row = { version: string; objects: number; present: number; missing: string };
type Verdict = { version: string; state: string; verdict: string };
const files: { file: string; sql: string }[] = migrationFiles();

/* A database with the first `upTo` migrations applied, probed with the full plan, as production would be. */
async function probeAfter(upTo: string, plan: unknown, tweak = '') {
  const db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(STAND_INS);
  for (const f of files.filter((x) => x.file.slice(0, 4) <= upTo)) await db.exec(forPglite(f.sql));
  if (tweak) await db.exec(tweak);
  const sql = probeSql(plan);
  expect(sql).not.toMatch(/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate)\b(?![^']*'[,)])/i);
  const rows = (await db.query<Row>(sql)).rows;
  await db.close();
  return rows;
}

describe('migration probe (scripts/migration-probe.mjs)', () => {
  it('reads the statements the migrations use', () => {
    expect(statements('create function f() returns int as $$ select 1; $$ language sql; -- x;\ncreate table t (a int);')).toHaveLength(2);
    expect(objectsOf('alter table public.orders add column a int, add column if not exists "b" text')).toEqual([
      { op: 'create', kind: 'column', key: 'orders.a' },
      { op: 'create', kind: 'column', key: 'orders.b' },
    ]);
    expect(objectsOf('create policy "own rows" on public.orders for select using (true)')).toEqual([{ op: 'create', kind: 'policy', key: 'orders.own rows' }]);
    expect(objectsOf("insert into storage.buckets (id, name, public) values ('demos', 'demos', false), ('blog', 'blog', false) on conflict do nothing")).toHaveLength(2);
    expect(objectsOf('create table auth.other (a int)')).toEqual([]);
  });

  it('every migration is proved on a database that has them all, and 0001-0040 only proves 0001-0040', { timeout: 180_000 }, async () => {
    const plan = await expectedPlan(files);
    const all = classify(plan, [], await probeAfter('9999', plan)) as Verdict[];
    const bad = all.filter((v) => !['complete', 'unprovable'].includes(v.state));
    expect(bad, JSON.stringify(bad)).toEqual([]);
    expect(all.filter((v) => v.state === 'complete').length).toBeGreaterThan(55);

    // The last push recorded in CLAUDE.md: 0001 to 0040. Everything after must show as not there.
    const history = files.filter((f) => f.file <= '0040').map((f) => ({ version: f.file.slice(0, 4) }));
    const half = classify(plan, history, await probeAfter('0040', plan)) as Verdict[];
    for (const v of half) {
      if (v.state === 'unprovable') continue;
      if (v.version <= '0040') expect(v.state, v.version).toBe('complete');
      else expect(['absent', 'check-text'], v.version).toContain(v.state);
    }
    expect(half.find((v) => v.version === '0060')!.verdict).toBe('missing: apply in order');
  });

  it('a function changed by hand on the database shows as partly applied', { timeout: 180_000 }, async () => {
    const plan = await expectedPlan(files);
    const rows = await probeAfter('9999', plan, 'create or replace function public.ledger_post_dummy() returns int language sql as $$ select 1 $$;');
    const hand = await probeAfter('9999', plan, 'create or replace function public.accept_quotation(uuid) returns int language sql as $$ select 2 $$;');
    expect(rows.find((r) => r.version === '0059')!.missing).toBe('');
    const r59 = hand.find((r) => r.version === '0059')!;
    expect(r59.missing).toContain('body accept_quotation');
    const [v] = classify(
      plan.filter((p: { version: string }) => p.version === '0059'),
      [{ version: '0059' }],
      hand,
    ) as Verdict[];
    expect(v.verdict).toMatch(/RECORDED BUT PARTIAL/);
  });
});

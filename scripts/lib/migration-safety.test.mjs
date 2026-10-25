import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FROZEN_THROUGH, fileNumber, findProblems } from './migration-safety.mjs';

const dir = path.join(import.meta.dirname, '..', '..', 'supabase', 'migrations');
const rules = (sql) => findProblems(sql).map((p) => p.rule.split(' (')[0]);

test('finds the risky steps the old migrations really took, and nothing else', () => {
  const found = {};
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql') && fileNumber(f) <= FROZEN_THROUGH)) {
    const r = rules(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (r.length) found[f.slice(0, 4)] = r;
  }
  assert.deepEqual(found, {
    '0015': ['changes a column type', 'changes a column type', 'renames a table or column', 'renames a table or column'],
    '0016': ['drops a table', 'drops a table'],
    '0017': ['changes a column type'],
    '0018': ['renames a table or column', 'renames a table or column'],
    '0019': ['changes a column type'],
    '0021': ['changes a column type'],
  });
});

test('adding things is fine', () => {
  const sql = `
    create table notes (id bigserial primary key, body text not null);
    alter table products add column subtitle text;
    alter table products add column rank int not null default 0;
    create index on notes (id);
    drop policy if exists p on notes; drop trigger if exists t on notes; drop function if exists f();
    revoke truncate on notes from anon;
    create trigger no_truncate before truncate on notes for each statement execute function f();
    create function g() returns void language plpgsql as $$ begin delete from notes; drop table notes; end $$;
    comment on table notes is 'delete from notes; drop table notes';
    -- drop table notes;
  `;
  assert.deepEqual(findProblems(sql), []);
});

test('each kind of data loss or break is caught, with its line', () => {
  const sql =
    'create table a (id int);\n\ndrop table a;\nalter table b drop column c;\ntruncate b;\ndelete from b where id = 1;\n' +
    'alter table b rename column c to d;\nalter table b rename to e;\nalter table b alter column c type bigint;\n' +
    'alter table b alter column c set not null;\nalter table b add column z text not null;\ndrop type t;\ndrop schema s cascade;';
  const p = findProblems(sql);
  assert.equal(p.length, 11);
  assert.equal(p[0].line, 3);
  assert.match(p[0].rule, /drops a table/);
  assert.match(p[8].rule, /adds a required column/);
});

test('one statement can be approved on purpose, only by the comment right above it, with a reason', () => {
  assert.deepEqual(findProblems('-- destructive-ok: old demo table, empty since 2026-09, owner agreed 2026-11-02\ndrop table demo_orders;'), []);
  assert.equal(findProblems('-- destructive-ok: x\ndrop table demo_orders;').length, 1);
  assert.equal(findProblems('-- destructive-ok: old demo table, owner agreed\n-- something else\ndrop table demo_orders;').length, 1);
  assert.equal(findProblems('-- destructive-ok: old demo table, owner agreed\ndrop table a;\ndrop table b;').length, 1);
});

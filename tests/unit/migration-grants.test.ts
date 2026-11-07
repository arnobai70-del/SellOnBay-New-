import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * A table closed to clients must still be opened to the server, or every write fails on a real database while tests without a database pass. Found on 0075 and 0076.
 * Checked from there on: older migrations were checked on the real database.
 */
const dir = path.join(__dirname, '..', '..', 'supabase', 'migrations');
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.sql') && f >= '0075')
  .sort();
const all = files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8').replace(/--[^\n]*/g, '')).join('\n');

describe('new tables', () => {
  it('are granted to the server', () => {
    const tables = [...all.matchAll(/create table (?:if not exists )?(\w+)/gi)].map((m) => m[1]);
    expect(tables.length).toBeGreaterThan(0);
    const grants = [...all.matchAll(/grant [^;]*? on ([^;]*?) to service_role/gi)].flatMap((m) => m[1].split(',').map((t) => t.trim().replace(/^table\s+/i, '')));
    expect(tables.filter((t) => !grants.includes(t))).toEqual([]);
  });
});

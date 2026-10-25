import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/* docs/DEPLOYMENT.md is the order to apply migrations in once the owner allows it, so it must list every file, in number order. */
const root = path.join(__dirname, '..', '..');
const files = fs
  .readdirSync(path.join(root, 'supabase', 'migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort();
const doc = fs.readFileSync(path.join(root, 'docs', 'DEPLOYMENT.md'), 'utf8');

describe('deployment doc', () => {
  it('lists every migration file once, in number order', () => {
    const listed = [...doc.matchAll(/^\| (\d{4}_[a-z0-9_]+\.sql) \|/gm)].map((m) => m[1]);
    expect(listed).toEqual(files);
  });

  it('migration numbers have no gaps or repeats', () => {
    expect(files.map((f) => Number(f.slice(0, 4)))).toEqual(files.map((_, i) => i + 1));
  });
});

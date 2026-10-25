// Fails when a new migration can lose data or break the running site while old and new versions run side by side.
// Rules and the way to approve one statement on purpose: scripts/lib/migration-safety.mjs. Usage: npm run check:migration-safety
import fs from 'node:fs';
import path from 'node:path';
import { FROZEN_THROUGH, fileNumber, findProblems } from './lib/migration-safety.mjs';

const dir = path.join(import.meta.dirname, '..', 'supabase', 'migrations');
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.sql') && fileNumber(f) > FROZEN_THROUGH)
  .sort();

let failed = 0;
for (const f of files) {
  for (const p of findProblems(fs.readFileSync(path.join(dir, f), 'utf8'))) {
    console.error(`${f}:${p.line}: ${p.rule}\n  ${p.code}`);
    failed++;
  }
}
if (failed) {
  console.error(`\n${failed} unsafe statement(s). Make the change in steps that keep the old site working (docs/DEPLOYMENT.md, "Migration safety"),`);
  console.error('or, with the owner\'s agreement and a backup, put "-- destructive-ok: <why, who agreed>" on the line above the statement.');
  process.exit(1);
}
console.log(`Migration safety: ${files.length} new file(s) after ${String(FROZEN_THROUGH).padStart(4, '0')} checked, nothing unsafe.`);

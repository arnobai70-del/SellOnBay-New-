/**
 * SellOnBay 2.0 staging migrations with the Supabase CLI, in reviewed batches. STAGING ONLY (occketfmjwciilzuddkv).
 *
 *   node scripts/staging-migrate.mjs repair      replace the 14 MCP history rows by CLI versions 0001-0014 (history table only)
 *   node scripts/staging-migrate.mjs plan        dry-run every pending batch, apply nothing
 *   node scripts/staging-migrate.mjs apply       for each batch in order: dry-run, check it lists exactly that batch, push; stop at the first problem
 *
 * Credentials are read from ~/.sob-staging/token and ~/.sob-staging/db-password and passed only through the environment of the CLI
 * process; they are never printed. Every CLI call names --project-ref explicitly; the production ref aborts the script. Batches start
 * at each reviewed destructive migration (0015, 0016, 0019, 0023, 0043, 0053, 0060). Each batch runs from a scratch workdir that holds
 * byte-identical copies of 0001..last (checked by SHA-256), so the CLI sees only migrations up to that batch.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { PRODUCTION_SUPABASE_REF, STAGING_SUPABASE_REF } from './verify-staging-target.mjs';

const REF = STAGING_SUPABASE_REF;
const MIG = join(process.cwd(), 'supabase', 'migrations');
const BATCH_STARTS = ['0015', '0016', '0019', '0023', '0043', '0053', '0060', '0067', '0068', '0069']; // 0067, 0068: security fixes found on staging; 0069: staging stopped at 0068 (2026-11-12)
const MCP_VERSIONS = [
  '20261027213445',
  '20261027213530',
  '20261027213536',
  '20261027213542',
  '20261027213623',
  '20261027213637',
  '20261027213650',
  '20261027213707',
  '20261027213730',
  '20261027213740',
  '20261027213750',
  '20261027213804',
  '20261027213834',
  '20261027213846',
];

function fail(msg) {
  console.error('STOP: ' + msg);
  process.exit(1);
}
if (REF === PRODUCTION_SUPABASE_REF) fail('the staging ref equals production');

function creds() {
  const dir = join(homedir(), '.sob-staging');
  const read = (n) => (existsSync(join(dir, n)) ? readFileSync(join(dir, n), 'utf8').trim() : '');
  const token = read('token');
  const password = read('db-password');
  if (!token || !password) fail('credentials missing in ~/.sob-staging (token, db-password)');
  return { ...process.env, SUPABASE_ACCESS_TOKEN: token, SUPABASE_DB_PASSWORD: password };
}

function cli(args, env) {
  if (args.join(' ').includes(PRODUCTION_SUPABASE_REF)) fail('a command named the production project');
  if (!args.includes('--project-ref') || args[args.indexOf('--project-ref') + 1] !== REF) fail('every command must name --project-ref ' + REF);
  const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['--no-install', 'supabase', ...args], { env, encoding: 'utf8', shell: process.platform === 'win32' });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.replaceAll(env.SUPABASE_DB_PASSWORD, '***').replaceAll(env.SUPABASE_ACCESS_TOKEN, '***');
  return { ok: r.status === 0, out };
}

const files = readdirSync(MIG)
  .filter((f) => /^\d{4}_.+\.sql$/.test(f))
  .sort();
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

function batches() {
  const pending = files.filter((f) => f >= '0015');
  const out = [];
  for (const f of pending) {
    if (BATCH_STARTS.includes(f.slice(0, 4)) || !out.length) out.push([]);
    out[out.length - 1].push(f);
  }
  return out;
}

function workdir(last) {
  const dir = join(tmpdir(), 'sob-staging-batches', last.slice(0, 4));
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'supabase', 'migrations'), { recursive: true });
  for (const f of files.filter((x) => x <= last)) {
    cpSync(join(MIG, f), join(dir, 'supabase', 'migrations', f));
    if (sha(join(MIG, f)) !== sha(join(dir, 'supabase', 'migrations', f))) fail('copy differs: ' + f);
  }
  return dir;
}

/* The versions the dry run says it would apply. */
const listed = (out) => [...new Set([...out.matchAll(/\b(\d{4})_[a-z0-9_]+\.sql\b/g)].map((m) => m[1]))];

const cmd = process.argv[2];
const env = creds();
if (cmd === 'repair') {
  const a = cli(['migration', 'repair', '--project-ref', REF, '--status', 'reverted', ...MCP_VERSIONS], env);
  console.log(a.out);
  if (!a.ok) fail('repair (reverted) failed');
  const b = cli(['migration', 'repair', '--project-ref', REF, '--status', 'applied', ...files.slice(0, 14).map((f) => f.slice(0, 4))], env);
  console.log(b.out);
  if (!b.ok) fail('repair (applied) failed');
  console.log(cli(['migration', 'list', '--project-ref', REF], env).out);
} else if (cmd === 'plan' || cmd === 'apply') {
  // Versions already recorded on the staging project: batches made only of those are skipped, never re-run.
  const list = cli(['migration', 'list', '--project-ref', REF], env);
  if (!list.ok) fail('could not read the migration history');
  const remote = new Set([...list.out.matchAll(/"remote":"(\d{4})"/g)].map((m) => m[1]));
  const notYet = []; // plan applies nothing, so a later batch's dry run also lists the earlier pending batches
  for (const batch of batches()) {
    if (batch.every((f) => remote.has(f.slice(0, 4)))) {
      console.log(`batch ${batch[0].slice(0, 4)}-${batch[batch.length - 1].slice(0, 4)}: already applied, skipped`);
      continue;
    }
    if (batch.some((f) => remote.has(f.slice(0, 4)))) fail('a batch is partly applied: ' + batch.join(','));
    const dir = workdir(batch[batch.length - 1]);
    const dry = cli(['db', 'push', '--workdir', dir, '--project-ref', REF, '--dry-run'], env);
    const want = [...(cmd === 'plan' ? notYet : []), ...batch.map((f) => f.slice(0, 4))];
    if (cmd === 'plan') notYet.push(...batch.map((f) => f.slice(0, 4)));
    const got = listed(dry.out);
    console.log(`batch ${want[0]}-${want[want.length - 1]}: dry run lists ${got.join(', ') || 'nothing'}`);
    if (!dry.ok) fail('dry run failed:\n' + dry.out);
    if (got.join() !== want.join()) fail(`dry run lists ${got.join(',')} but the batch is ${want.join(',')}`);
    if (cmd === 'plan') continue;
    const push = cli(['db', 'push', '--workdir', dir, '--project-ref', REF, '--yes'], env); // --yes: the CLI's own push prompt; the owner authorised these reviewed files
    console.log(push.out);
    if (!push.ok) fail(`push of batch ${want[0]}-${want[want.length - 1]} failed`);
  }
} else fail('use: repair | plan | apply');

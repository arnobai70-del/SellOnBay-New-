import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error plain JavaScript module without types
import { forPglite, migrationFiles, STAND_INS } from '../../scripts/lib/pgliteSupabase.mjs';

/*
 * The affiliate money functions (migration 0086) on a REAL Postgres server with real concurrent sessions (owner, 2026-11-12: atomic and
 * idempotent). A throwaway cluster is made in the temp folder, every migration is applied, and it is deleted afterwards; no other database
 * is ever reached (localhost only, its own port). Sessions are started together and wait for the same instant, so they truly race.
 * Needs PostgreSQL's binaries (PG_BIN, or the Windows default); without them the suite is skipped.
 */
const BIN = process.env.PG_BIN ?? 'C:/Program Files/PostgreSQL/17/bin';
const exe = (n: string) => path.join(BIN, process.platform === 'win32' ? `${n}.exe` : n);
const HAVE = existsSync(exe('initdb')) && existsSync(exe('pg_ctl')) && existsSync(exe('psql'));
const PORT = String(56000 + Math.floor(Math.random() * 2000));
let dir = '';

const args = (sql: string) => ['-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1', '-h', 'localhost', '-p', PORT, '-U', 'postgres', '-d', 'aff', '-c', sql];
const psql = (sql: string) => {
  try {
    return execFileSync(exe('psql'), args(sql), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    throw new Error(String((e as { stderr?: string }).stderr || e)); // Postgres's own message, for the assertions
  }
};
/* One separate session; resolves with its output or its error, never throws. */
const session = (sql: string) =>
  new Promise<{ ok: boolean; out: string }>((resolve) => {
    const p = spawn(exe('psql'), args(sql));
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => resolve({ ok: code === 0, out: out.trim() }));
  });
/* n sessions that all wait for the same instant, then run sql as the server's role (service_role, like the app). */
async function race(n: number, sql: (i: number) => string) {
  const at = new Date(Date.now() + 2500).toISOString();
  return Promise.all(Array.from({ length: n }, (_, i) => session(`set role service_role; select pg_sleep(greatest(0, extract(epoch from ('${at}'::timestamptz - clock_timestamp())))); ${sql(i)}`)));
}
const one = (sql: string) => psql(`set role service_role; ${sql}`);
const num = (sql: string) => Number(psql(sql));

let user = '';
let aff = '';
let attr = '';
let seq = 0;
/* A pending commission worth `cents` (10% of 10x), made like the app makes it. */
function commission(cents: number) {
  seq++;
  return one(
    `insert into affiliate_commissions (affiliate_id, attribution_id, kind, source_ref, basis_cents, rate_bps, amount_cents) values ('${aff}', '${attr}', 'first_purchase', 'order:t${seq}', ${cents * 10}, 1000, ${cents}) returning id`,
  );
}
const balance = () => num(`select coalesce(sum(amount_cents), 0) from affiliate_ledger where affiliate_id = '${aff}'`);

describe.skipIf(!HAVE)('affiliate money on a real Postgres with concurrent sessions', () => {
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'sob-aff-pg-'));
    execFileSync(exe('initdb'), ['-D', path.join(dir, 'data'), '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--no-instructions'], { stdio: 'ignore' });
    execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'data'), '-o', `-p ${PORT} -c listen_addresses=localhost -c max_connections=60`, '-l', path.join(dir, 'log.txt'), '-w', 'start'], {
      stdio: 'ignore',
    });
    execFileSync(exe('psql'), ['-X', '-q', '-h', 'localhost', '-p', PORT, '-U', 'postgres', '-d', 'postgres', '-c', 'create database aff'], { stdio: 'ignore' });
    const all = [STAND_INS, ...(migrationFiles() as { sql: string }[]).map((f) => forPglite(f.sql))].join('\n;\n');
    const file = path.join(dir, 'all.sql');
    writeFileSync(file, all);
    execFileSync(exe('psql'), ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', 'localhost', '-p', PORT, '-U', 'postgres', '-d', 'aff', '-f', file], { stdio: 'ignore' });
    psql('alter role service_role bypassrls'); // as on Supabase: the service key passes row level security (browser roles do not)
    user = psql(`insert into auth.users (email) values ('aff@example.test') returning id`);
    psql(`insert into profiles (id) values ('${user}') on conflict (id) do nothing`);
    aff = one(
      `insert into affiliates (user_id, code, qualification_started_at, qualification_ends_at, terms_version) values ('${user}', 'AFFPGTEST', now(), now() + interval '60 days', 'v1') returning id`,
    );
    attr = one(`insert into affiliate_attributions (affiliate_id, kind, ref_id) values ('${aff}', 'order', 'o-pg') returning id`);
  }, 240_000);

  afterAll(() => {
    if (!dir) return;
    try {
      execFileSync(exe('pg_ctl'), ['-D', path.join(dir, 'data'), '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore' });
    } catch {
      /* already stopped */
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it('the app role cannot write money directly: no ledger or withdrawal writes, no status change outside the functions', () => {
    const c = commission(100);
    expect(() => one(`insert into affiliate_ledger (affiliate_id, entry_key, kind, amount_cents) values ('${aff}', 'x:1', 'commission', 100)`)).toThrow(/permission denied/);
    expect(() => one(`insert into affiliate_withdrawals (affiliate_id, amount_cents) values ('${aff}', 100)`)).toThrow(/permission denied/);
    expect(() => one(`update affiliate_commissions set status = 'approved' where id = '${c}'`)).toThrow(/affiliate_commission_guard/);
    for (const t of ['affiliates', 'affiliate_clicks', 'affiliate_attributions', 'affiliate_commissions', 'affiliate_withdrawals', 'affiliate_ledger', 'affiliate_events'])
      expect(() => one(`delete from ${t} where false`), t).toThrow(/permission denied/); // no delete grant anywhere
    expect(() => one(`update affiliate_withdrawals set status = 'paid' where false`)).toThrow(/permission denied/);
    expect(() =>
      one(
        `insert into affiliate_commissions (affiliate_id, attribution_id, kind, source_ref, basis_cents, rate_bps, amount_cents, status) values ('${aff}', '${attr}', 'first_purchase', 'order:x-approved', 1, 1, 1, 'approved')`,
      ),
    ).toThrow(/starts pending/);
    expect(one(`update affiliate_commissions set basis_cents = 2000 where id = '${c}' returning basis_cents`)).toBe('2000'); // a pending basis may follow a partial refund
    expect(one(`select affiliate_reverse_commission('${c}', 'cleanup')`)).toBe('reversed');
  });

  it('a payment event repeated 20 times at once approves once and books the money once', async () => {
    const c = commission(1500);
    const before = balance();
    const runs = await race(20, () => `select affiliate_approve_commission('${c}');`);
    expect(runs.every((r) => r.ok)).toBe(true);
    expect(runs.filter((r) => r.out.endsWith('approved')).length).toBe(20); // the first approves, the rest see it already approved
    expect(num(`select count(*) from affiliate_ledger where entry_key = 'commission:${c}'`)).toBe(1);
    expect(balance() - before).toBe(1500);
  }, 60_000);

  it('the same paid thing recorded 10 times at once makes one commission', async () => {
    const runs = await race(
      10,
      () =>
        `insert into affiliate_commissions (affiliate_id, attribution_id, kind, source_ref, basis_cents, rate_bps, amount_cents) values ('${aff}', '${attr}', 'first_purchase', 'order:dup-race', 10000, 1500, 1500);`,
    );
    expect(runs.filter((r) => r.ok).length).toBe(1);
    expect(num(`select count(*) from affiliate_commissions where source_ref = 'order:dup-race'`)).toBe(1);
  }, 60_000);

  it('approve and reverse racing on one commission always end reversed with the money netting to zero', async () => {
    for (let round = 0; round < 5; round++) {
      const c = commission(700);
      const runs = await race(6, (i) => (i % 2 ? `select affiliate_approve_commission('${c}');` : `select affiliate_reverse_commission('${c}', 'refund');`));
      expect(runs.every((r) => r.ok)).toBe(true);
      expect(psql(`select status from affiliate_commissions where id = '${c}'`)).toBe('reversed');
      expect(num(`select coalesce(sum(amount_cents), 0) from affiliate_ledger where commission_id = '${c}'`)).toBe(0);
      expect(num(`select count(*) from affiliate_ledger where entry_key = 'reversal:${c}'`)).toBeLessThanOrEqual(1);
    }
  }, 120_000);

  it('10 withdrawal requests at once: exactly one is reserved, never more than the balance', async () => {
    const bal = balance();
    expect(bal).toBeGreaterThanOrEqual(1500);
    const amount = Math.floor(bal * 0.6);
    const runs = await race(10, () => `select affiliate_request_withdrawal('${aff}', ${amount}, 100, 'PayPal', 'xxxx.com');`);
    expect(runs.filter((r) => r.ok).length).toBe(1);
    expect(runs.filter((r) => !r.ok).every((r) => /open_withdrawal|insufficient/.test(r.out))).toBe(true);
    expect(num(`select count(*) from affiliate_withdrawals where affiliate_id = '${aff}' and status in ('requested', 'approved')`)).toBe(1);
    expect(() => one(`select affiliate_request_withdrawal('${aff}', ${bal * 10}, 100, 'PayPal', 'x')`)).toThrow(/open_withdrawal|insufficient/);
  }, 60_000);

  it('a payout marked paid 10 times at once books the money out once', async () => {
    const w = psql(`select id from affiliate_withdrawals where affiliate_id = '${aff}' and status = 'requested'`);
    expect(() => one(`select affiliate_decide_withdrawal('${w}', 'paid', 'PP-1', null)`)).toThrow(/bad_state/); // approve first
    expect(one(`select affiliate_decide_withdrawal('${w}', 'approve', '', null)`)).toBe('approved');
    const amount = num(`select amount_cents from affiliate_withdrawals where id = '${w}'`);
    const before = balance();
    const runs = await race(10, () => `select affiliate_decide_withdrawal('${w}', 'paid', 'PP-RACE-1', null);`);
    expect(runs.every((r) => r.ok)).toBe(true);
    expect(runs.filter((r) => r.out.endsWith('already_paid')).length).toBe(9);
    expect(num(`select count(*) from affiliate_ledger where entry_key = 'withdrawal:${w}'`)).toBe(1);
    expect(before - balance()).toBe(amount);
    expect(psql(`select status || ' ' || payout_reference from affiliate_withdrawals where id = '${w}'`)).toBe('paid PP-RACE-1');
  }, 60_000);

  it('a failure in the middle of a step leaves nothing behind (approval and payout), and the retry then works once', () => {
    const c = commission(333);
    // a fault after the ledger entry is written: the commission update fails, so the whole step must roll back
    psql(`create function aff_test_fault() returns trigger language plpgsql as $$ begin if new.status = 'approved' and new.amount_cents = 333 then raise exception 'injected fault'; end if; return new; end $$;
          create trigger aff_test_fault after update on affiliate_commissions for each row execute function aff_test_fault();`);
    expect(() => one(`select affiliate_approve_commission('${c}')`)).toThrow(/injected fault/);
    expect(psql(`select status from affiliate_commissions where id = '${c}'`)).toBe('pending');
    expect(num(`select count(*) from affiliate_ledger where commission_id = '${c}'`)).toBe(0);
    psql(`drop trigger aff_test_fault on affiliate_commissions;`);
    expect(one(`select affiliate_approve_commission('${c}')`)).toBe('approved');
    expect(num(`select count(*) from affiliate_ledger where commission_id = '${c}'`)).toBe(1);

    // a fault while booking a payout: the withdrawal stays approved and nothing is booked
    const w = one(`select affiliate_request_withdrawal('${aff}', 300, 100, 'PayPal', 'x')`);
    one(`select affiliate_decide_withdrawal('${w}', 'approve', '', null)`);
    psql(`create function aff_test_fault2() returns trigger language plpgsql as $$ begin raise exception 'injected ledger fault'; end $$;
          create trigger aff_test_fault2 before insert on affiliate_ledger for each row execute function aff_test_fault2();`);
    expect(() => one(`select affiliate_decide_withdrawal('${w}', 'paid', 'PP-F', null)`)).toThrow(/injected ledger fault/);
    expect(psql(`select status from affiliate_withdrawals where id = '${w}'`)).toBe('approved');
    expect(num(`select count(*) from affiliate_ledger where withdrawal_id = '${w}'`)).toBe(0);
    psql(`drop trigger aff_test_fault2 on affiliate_ledger;`);
    expect(one(`select affiliate_decide_withdrawal('${w}', 'paid', 'PP-F', null)`)).toBe('paid');
    expect(num(`select count(*) from affiliate_ledger where withdrawal_id = '${w}'`)).toBe(1);
  });

  it('a lost connection in the middle of a transaction saves nothing, and does not block the next try', async () => {
    const c = commission(444);
    const hung = session(`set role service_role; begin; select affiliate_approve_commission('${c}'); select pg_sleep(30); commit;`);
    let pid = '';
    for (let i = 0; i < 50 && !pid; i++) {
      await new Promise((r) => setTimeout(r, 200));
      pid = psql(`select pid from pg_stat_activity where datname = 'aff' and query like '%pg_sleep(30)%' and pid <> pg_backend_pid() limit 1`);
    }
    expect(pid).not.toBe('');
    psql(`select pg_terminate_backend(${pid})`);
    expect((await hung).ok).toBe(false);
    expect(psql(`select status from affiliate_commissions where id = '${c}'`)).toBe('pending');
    expect(num(`select count(*) from affiliate_ledger where commission_id = '${c}'`)).toBe(0);
    expect(one(`select affiliate_approve_commission('${c}')`)).toBe('approved');
    expect(num(`select count(*) from affiliate_ledger where commission_id = '${c}'`)).toBe(1);
  }, 60_000);

  it('a rejected withdrawal frees the reservation; a reversal after a request is caught at payout', () => {
    const w = one(`select affiliate_request_withdrawal('${aff}', 100, 100, 'PayPal', 'x')`);
    expect(() => one(`select affiliate_request_withdrawal('${aff}', 100, 100, 'PayPal', 'x')`)).toThrow(/open_withdrawal/);
    expect(one(`select affiliate_decide_withdrawal('${w}', 'reject', '', null)`)).toBe('rejected');
    expect(() => one(`select affiliate_decide_withdrawal('${w}', 'paid', 'PP-X', null)`)).toThrow(/bad_state/);
    // take the whole balance out by reversals, then a payout of an older request is refused
    const all = balance();
    const w2 = one(`select affiliate_request_withdrawal('${aff}', ${all}, 100, 'PayPal', 'x')`);
    one(`select affiliate_decide_withdrawal('${w2}', 'approve', '', null)`);
    for (const id of psql(`select id from affiliate_commissions where affiliate_id = '${aff}' and status = 'approved'`)
      .split(/\r?\n/) // psql on Windows ends lines with \r\n
      .map((x) => x.trim())
      .filter(Boolean))
      one(`select affiliate_reverse_commission('${id}', 'fraud')`);
    expect(() => one(`select affiliate_decide_withdrawal('${w2}', 'paid', 'PP-Y', null)`)).toThrow(/insufficient/);
    expect(num(`select count(*) from affiliate_ledger where withdrawal_id = '${w2}'`)).toBe(0);
    expect(() => psql(`set role anon; select affiliate_approve_commission(gen_random_uuid())`)).toThrow(/permission denied/);
    expect(() => psql(`set role authenticated; select affiliate_request_withdrawal('${aff}', 100, 100, 'x', 'x')`)).toThrow(/permission denied/);
  });
});

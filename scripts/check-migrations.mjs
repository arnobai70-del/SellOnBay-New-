// Runs every migration in order against an in-process Postgres (PGlite) with small stand-ins for Supabase (auth, storage, cron, roles).
// Catches SQL mistakes and clashes between migrations without touching any real database. Usage: node scripts/check-migrations.mjs
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(import.meta.dirname, '..', 'supabase', 'migrations');
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort();
const db = new PGlite();

await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth; create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create schema storage; create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
  create schema cron; create table cron.job (jobid serial, jobname text);
  create function cron.unschedule(j int) returns boolean language sql as $$ select true $$;
  create function cron.schedule(a text, b text, c text) returns int language sql as $$ select 1 $$;
`);

let failed = false;
for (const f of files) {
  const sql = fs
    .readFileSync(path.join(dir, f), 'utf8')
    .replace(/create extension if not exists pg_cron;/g, '')
    .replace(/create extension if not exists pgcrypto;/g, '');
  try {
    await db.exec(sql);
    console.log('ok  ', f);
  } catch (e) {
    failed = true;
    console.log('FAIL', f, '\n     ', e.message);
    break;
  }
}
if (!failed) {
  const q = async (s) => (await db.query(s)).rows;
  console.log('orders columns:', (await q("select column_name from information_schema.columns where table_name='orders' order by 1")).length);
  console.log('ledger_entries columns:', (await q("select column_name from information_schema.columns where table_name='ledger_entries' order by 1")).map((r) => r.column_name).join(','));
  console.log('order_events columns:', (await q("select column_name from information_schema.columns where table_name='order_events' order by 1")).map((r) => r.column_name).join(','));
}
if (!failed) {
  // Smoke test of the two money functions.
  const t = async (name, fn) => {
    try {
      const r = await fn();
      console.log('ok  ', name, r === undefined ? '' : JSON.stringify(r));
    } catch (e) {
      failed = true;
      console.log('FAIL', name, e.message);
    }
  };
  const id = '11111111-1111-4111-8111-111111111111';
  await db.exec("insert into orders (id, price_cents, fee_cents, status) values ('" + id + "', 5000, 750, 'awaiting_payment')");
  const one = async (s) => Object.values((await db.query(s)).rows[0])[0];
  const ev = (e) => "'" + JSON.stringify({ event: e, from: 'awaiting_payment', to: 'funded', at: new Date().toISOString(), meta: { a: 1 } }) + "'::jsonb";
  await t('order_apply moves state and logs', async () =>
    one("select order_apply('" + id + '\', \'awaiting_payment\', \'{"status":"funded","funded_at":"2026-10-01T10:00:00Z","lines":[["Site",5000]],"payment_ref":"p1"}\'::jsonb, ' + ev('funded') + ')'),
  );
  await t('order_apply refuses a stale writer', async () => one("select order_apply('" + id + "', 'awaiting_payment', '{\"status\":\"accepted\"}'::jsonb, " + ev('stale') + ')'));
  await t('order_apply refuses unknown columns', async () => {
    try {
      await db.query("select order_apply('" + id + "', 'funded', '{\"buyer_id\":null}'::jsonb, " + ev('x') + ')');
      return 'NOT REFUSED';
    } catch {
      return 'refused';
    }
  });
  await t('order_events is append only', async () => {
    try {
      await db.query("update order_events set event='x'");
      return 'NOT REFUSED';
    } catch {
      try {
        await db.query('delete from order_events');
        return 'NOT REFUSED';
      } catch {
        return 'refused';
      }
    }
  });
  await t('events survive: count', async () => one("select count(*) from order_events where order_id='" + id + "'"));
  const lp = (key, lines) => "select ledger_post('" + key + "', '" + id + "', 'm', '" + JSON.stringify(lines) + "'::jsonb)";
  const pay = [
    { account: 'platform_cash', amountCents: 5000, side: 'debit' },
    { account: 'order_escrow:' + id, amountCents: 5000, side: 'credit' },
  ];
  await t('ledger_post once', async () => one(lp('pay:1', pay)));
  await t('ledger_post same key again', async () => one(lp('pay:1', pay)));
  await t('ledger_post unbalanced refused', async () => {
    try {
      await db.query(
        lp('bad', [
          { account: 'a', amountCents: 5, side: 'debit' },
          { account: 'b', amountCents: 4, side: 'credit' },
        ]),
      );
      return 'NOT REFUSED';
    } catch {
      return 'refused';
    }
  });
  await t('ledger_post below zero refused', async () => {
    try {
      await db.query(
        lp('neg', [
          { account: 'order_escrow:' + id, amountCents: 5001, side: 'debit' },
          { account: 'platform_cash', amountCents: 5001, side: 'credit' },
        ]),
      );
      return 'NOT REFUSED';
    } catch (e) {
      return /below zero/.test(e.message) ? 'refused' : 'wrong error: ' + e.message;
    }
  });
  await t('ledger_post: a seller reserve cannot go below zero', async () => {
    try {
      await db.query(
        lp('neg-reserve', [
          { account: 'seller_reserve:s1', amountCents: 100, side: 'debit' },
          { account: 'seller_available:s1', amountCents: 100, side: 'credit' },
        ]),
      );
      return 'NOT REFUSED';
    } catch (e) {
      return /below zero/.test(e.message) ? 'refused' : 'wrong error: ' + e.message;
    }
  });
  await t('ledger_post: a seller debt may be posted (it is what the seller owes)', async () =>
    one(
      lp('debt-1', [
        { account: 'seller_debt:s1', amountCents: 700, side: 'debit' },
        { account: 'platform_cash', amountCents: 700, side: 'credit' },
      ]),
    ),
  );
  await t('ledger_balances', async () => (await db.query('select * from ledger_balances order by account')).rows);
  await t('ledger append only', async () => {
    try {
      await db.query("update ledger_entries set memo='x'");
      return 'NOT REFUSED';
    } catch {
      return 'refused';
    }
  });
  await t('order_consents is append-only, and goes away only with its order', async () => {
    await db.exec("insert into order_consents (order_id, kind, text_version, ip, user_agent) values ('" + id + "', 'accept', 'accept-v1', '203.0.113.9', 'UA')");
    const out = [];
    for (const sql of ["update order_consents set ip = 'x'", 'delete from order_consents', 'truncate order_consents']) {
      try {
        await db.exec(sql);
        out.push('NOT REFUSED');
      } catch {
        out.push('refused');
      }
    }
    return out.join(',');
  });
  await t('deleting the order removes its events (cascade)', async () => {
    await db.exec("delete from orders where id='" + id + "'");
    return one('select (select count(*) from order_events) as events, (select count(*) from order_consents) as consents');
  });
}

// Transactional AI quota smoke tests on the ephemeral PGlite database.
// This is NOT a real Supabase staging test or a multi-session stress test.
if (!failed) {
  try {
    const claim = async (cookie, ip, budget = 2100, limit = 2, reserve = 900) => {
      const sql = 'select ai_reserve_run($1, $2, $3, $4::date, $5::integer, $6::bigint, $7::bigint) as value';
      const x = await db.query(sql, ['site-ideas', cookie, ip, '2026-10-10', limit, budget, reserve]);
      return x.rows[0].value;
    };
    const settle = async (id, tokens) =>
      (await db.query('select ai_settle_run($1::uuid, $2::bigint) as ok', [id, tokens])).rows[0].ok;
    const first = await claim('cookie:user-a', 'ip:same-hash');
    const second = await claim('cookie:user-a', 'ip:same-hash');
    if (!first.allowed || !second.allowed || first.left !== 1 || second.left !== 0) throw new Error('Did not reserve two daily claims');
    const overDaily = await claim('cookie:different', 'ip:same-hash');
    if (overDaily.allowed || overDaily.reason !== 'daily') throw new Error('Parallel IP quota is not enforced');
    const overBudget = await claim('cookie:user-b', 'ip:different');
    if (overBudget.allowed || overBudget.reason !== 'budget') throw new Error('Pending reservations were not counted in global monthly budget');
    if (!(await settle(first.id, 200))) throw new Error('First settlement did not persist');
    if (!(await settle(first.id, 200))) throw new Error('Repeat settlement was not idempotent');
    const spent = (await db.query("select tokens_in from ai_usage where subject='global' and tool='site-ideas' and day='2026-10-10'")).rows[0].tokens_in;
    if (Number(spent) !== 200) throw new Error('Idempotent settlement charged twice');
    const availableAfterSettlement = await claim('cookie:user-b', 'ip:different');
    if (!availableAfterSettlement.allowed) throw new Error('Unused budget not returned after a successful settlement');
    let rejectedTooMuch = false;
    try { await settle(second.id, 901); } catch { rejectedTooMuch = true; }
    if (!rejectedTooMuch) throw new Error('Over-reservation charge silently accepted');
    if (!(await settle(second.id, 900))) throw new Error('Could not settle previous pending reservation');
    const pending = (await db.query("select count(*) as total from ai_run_reservations where state='pending'")).rows[0].total;
    if (Number(pending) !== 1) throw new Error('Unexpected reservation finalization');
    console.log('ok   ai_reserve_run/ai_settle_run: daily counters, pending budget, idempotency and overrun guard');
  } catch (e) {
    failed = true;
    console.log('FAIL atomic AI reservation smoke:', e.message);
  }
}

if (!failed) {
  // Admin rights in the database need the authenticator code (0045): a password-only admin session is not an admin to RLS.
  try {
    const admin = '22222222-2222-4222-8222-222222222222';
    await db.exec(`insert into auth.users (id, email) values ('${admin}', 'admin@example.test'); update profiles set role = 'admin' where id = '${admin}'`);
    const isAdmin = async (aal) => {
      await db.exec(`select set_config('request.jwt.claim.sub', '${admin}', false), set_config('request.jwt.claims', '${JSON.stringify({ sub: admin, aal })}', false)`);
      return (await db.query('select is_admin() as a')).rows[0].a;
    };
    if ((await isAdmin('aal1')) !== false) throw new Error('an aal1 admin session counts as admin');
    if ((await isAdmin('aal2')) !== true) throw new Error('an aal2 admin session does not count as admin');
    await db.exec("select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false)");
    console.log('ok   is_admin: needs the authenticator code (aal2)');
  } catch (e) {
    failed = true;
    console.log('FAIL is_admin aal2 smoke:', e.message);
  }
}

if (!failed) {
  // 0047: abuse reports are written and reviews are read only by the server.
  try {
    const priv = async (role, what) => (await db.query(`select has_table_privilege('${role}', '${what.split(' ')[1]}', '${what.split(' ')[0]}') as p`)).rows[0].p;
    const anyCol = async (role, table, mode) =>
      (
        await db.query(
          `select bool_or(has_column_privilege('${role}', '${table}', attname, '${mode}')) as p from pg_attribute where attrelid = '${table}'::regclass and attnum > 0 and not attisdropped`,
        )
      ).rows[0].p;
    if ((await priv('authenticated', 'insert abuse_reports')) || (await anyCol('authenticated', 'abuse_reports', 'insert'))) throw new Error('clients can still insert abuse reports');
    if ((await priv('anon', 'select reviews')) || (await priv('authenticated', 'select reviews'))) throw new Error('clients can still read reviews (buyer_id, order_id)');
    if (!(await priv('service_role', 'select reviews')) || !(await priv('service_role', 'insert abuse_reports'))) throw new Error('the server lost its access');
    if ((await priv('anon', 'select posts')) || (await priv('authenticated', 'insert posts'))) throw new Error('clients can reach posts directly');
    if (!(await priv('service_role', 'insert posts'))) throw new Error('the server cannot write posts');
    console.log('ok   abuse reports, reviews and posts: server only');
  } catch (e) {
    failed = true;
    console.log('FAIL server-only grants:', e.message);
  }
}

if (!failed) {
  // 0049: module maintenance is server only, every change lands in the history by itself, and the history cannot be changed.
  try {
    const priv = async (role, mode, table) => (await db.query(`select has_table_privilege('${role}', '${table}', '${mode}') as p`)).rows[0].p;
    for (const t of ['module_maintenance', 'module_maintenance_history'])
      for (const r of ['anon', 'authenticated']) if ((await priv(r, 'select', t)) || (await priv(r, 'insert', t))) throw new Error(`${r} can reach ${t}`);
    await db.exec(`insert into module_maintenance (module_key, enabled, message) values ('seller', true, 'Back soon')`);
    await db.exec(`update module_maintenance set enabled = false where module_key = 'seller'`);
    const h = (await db.query(`select enabled from module_maintenance_history where module_key = 'seller' order by id`)).rows.map((r) => r.enabled);
    if (h.join() !== 'true,false') throw new Error(`history has ${h.join()}`);
    const refused = async (sql) =>
      db.exec(sql).then(
        () => false,
        () => true,
      );
    if (!(await refused(`delete from module_maintenance_history`))) throw new Error('history rows can be deleted');
    if (!(await refused(`update module_maintenance_history set enabled = true`))) throw new Error('history rows can be changed');
    if (!(await refused(`insert into module_maintenance (module_key, start_at, end_at) values ('ai', now(), now() - interval '1 hour')`))) throw new Error('an end before the start is accepted');
    if (!(await refused(`insert into module_maintenance (module_key) values ('Bad Key!')`))) throw new Error('a junk module key is accepted');
    await db.exec(`delete from module_maintenance`);
    console.log('ok   module maintenance: server only, history written by the database and append-only');
  } catch (e) {
    failed = true;
    console.log('FAIL module maintenance:', e.message);
  }
}

if (!failed) {
  // 0051: the email queue is server only, a claimed email is held (not given to a second copy), and comes back after its five-minute hold.
  try {
    const priv = async (role, mode) => (await db.query(`select has_table_privilege('${role}', 'email_outbox', '${mode}') as p`)).rows[0].p;
    for (const r of ['anon', 'authenticated']) if ((await priv(r, 'select')) || (await priv(r, 'insert'))) throw new Error(`${r} can reach email_outbox`);
    const fn = async (role) => (await db.query(`select has_function_privilege('${role}', 'claim_email_outbox(int, bigint)', 'execute') as p`)).rows[0].p;
    if ((await fn('anon')) || (await fn('authenticated'))) throw new Error('clients can claim emails');
    const user = '00000000-0000-4000-8000-0000000051aa';
    await db.exec(`insert into auth.users (id, email) values ('${user}', 'mail@example.test')`);
    const n = (await db.query(`insert into notifications (user_id, kind) values ('${user}', 'repo_invite_resent') returning id`)).rows[0].id;
    await db.exec(`insert into email_outbox (notification_id) values ('${n}')`);
    const first = (await db.query(`select * from claim_email_outbox(10)`)).rows;
    if (first.length !== 1 || first[0].attempts !== 1) throw new Error(`first claim gave ${JSON.stringify(first)}`);
    if ((await db.query(`select * from claim_email_outbox(10)`)).rows.length) throw new Error('a held email was claimed twice');
    await db.exec(`update email_outbox set next_at = now() - interval '1 second'`);
    const again = (await db.query(`select * from claim_email_outbox(10, ${first[0].id})`)).rows;
    if (again.length !== 1 || again[0].attempts !== 2) throw new Error('a stuck email did not come back');
    await db.exec(`delete from notifications where id = '${n}'`);
    if ((await db.query(`select count(*)::int as c from email_outbox`)).rows[0].c) throw new Error('queue row outlived its notification');
    console.log('ok   email queue: server only, one sender per email, stuck emails come back');
  } catch (e) {
    failed = true;
    console.log('FAIL email queue:', e.message);
  }
}

if (!failed) {
  // 0052: visitor analytics are server only; a visitor counts once a day, repeats are capped, a returning visitor is told apart, and old rows go.
  try {
    for (const t of ['analytics_visitors', 'analytics_hits', 'analytics_reports'])
      for (const r of ['anon', 'authenticated']) if ((await db.query(`select has_table_privilege('${r}', '${t}', 'select') as p`)).rows[0].p) throw new Error(`${r} can read ${t}`);
    const fn = async (role) => (await db.query(`select has_function_privilege('${role}', 'analytics_hit(date, text, text, text)', 'execute') as p`)).rows[0].p;
    if ((await fn('anon')) || (await fn('authenticated'))) throw new Error('clients can write hits');
    await db.exec(`select analytics_hit('2026-10-01', 'visitor-aaaa', 'visit', '')`);
    await db.exec(`select analytics_hit('2026-10-02', 'visitor-aaaa', 'visit', '')`);
    await db.exec(`select analytics_hit('2026-10-02', 'visitor-aaaa', 'visit', '')`);
    await db.exec(`select analytics_hit('2026-10-02', 'visitor-bbbb', 'visit', '')`);
    for (let i = 0; i < 60; i++) await db.exec(`select analytics_hit('2026-10-02', 'visitor-bbbb', 'product', 'saffron-table')`);
    await db.exec(`select analytics_hit('2026-10-02', 'visitor-aaaa', 'product', 'saffron-table')`);
    const d = (await db.query(`select * from analytics_days('2026-10-02', '2026-10-02')`)).rows[0];
    if (Number(d.visitors) !== 2 || Number(d.repeat_visitors) !== 1 || Number(d.products) !== 51) throw new Error(`day gave ${JSON.stringify(d)}`);
    const top = (await db.query(`select * from analytics_top('product', '2026-10-01', '2026-10-02', 5)`)).rows;
    if (top.length !== 1 || Number(top[0].people) !== 2) throw new Error(`top gave ${JSON.stringify(top)}`);
    await db.exec(`select analytics_purge('2026-10-03')`);
    if ((await db.query(`select (select count(*) from analytics_hits) + (select count(*) from analytics_visitors) as c`)).rows[0].c != 0) throw new Error('purge left rows');
    console.log('ok   visitor analytics: server only, one visitor a day, capped repeats, returning visitors, purge');
  } catch (e) {
    failed = true;
    console.log('FAIL visitor analytics:', e.message);
  }
}

process.exit(failed ? 1 : 0);

// Migration-history reconciliation (docs/LAUNCH_READINESS.md section 1, step 2). Pure: reads migration text, writes SELECT-only SQL.
//
// For every migration it lists the objects that migration is the FIRST to create in the public schema (tables, views, types, columns added
// later, functions, indexes, triggers, policies, storage buckets), leaving out anything a later migration drops for good. The probe asks
// the database, read only, which of them exist. A migration whose objects were all made earlier (it only replaces a function or a policy,
// grants or revokes) cannot be proved by presence and is reported as "check by hand".

const ident = String.raw`(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))`;
const qualified = String.raw`(?:(?:"?([A-Za-z_][A-Za-z0-9_]*)"?)\.)?${ident}`;
const name = (m, i) => (m[i] ?? m[i + 1] ?? '').toLowerCase();
const lit = (s) => `'${s.replace(/'/g, "''")}'`;

/* Comments and dollar-quoted bodies out (a ";" inside a function body must not end the statement), then split into statements. */
export function statements(sql) {
  const noBodies = sql.replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, '$$$$');
  return noBodies
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(';')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/* What one statement creates or drops, as { op: 'create' | 'drop', kind, key } (key: "table.object" for columns and policies). */
export function objectsOf(stmt) {
  const out = [];
  const pub = (schema) => !schema || schema.toLowerCase() === 'public';
  let m;
  const re = (s) => new RegExp('^' + s, 'i');
  if ((m = stmt.match(re(String.raw`create (?:or replace )?(?:materialized )?view (?:if not exists )?${qualified}`))) && pub(m[1])) out.push({ op: 'create', kind: 'table', key: name(m, 2) });
  else if ((m = stmt.match(re(String.raw`create (?:unlogged )?table (?:if not exists )?${qualified}`))) && pub(m[1])) out.push({ op: 'create', kind: 'table', key: name(m, 2) });
  else if ((m = stmt.match(re(String.raw`create type ${qualified}`))) && pub(m[1])) out.push({ op: 'create', kind: 'type', key: name(m, 2) });
  else if ((m = stmt.match(re(String.raw`create (?:or replace )?function ${qualified}\s*\(`))) && pub(m[1])) out.push({ op: 'create', kind: 'function', key: name(m, 2) });
  else if ((m = stmt.match(re(String.raw`create (?:unique )?index (?:concurrently )?(?:if not exists )?${ident} on`)))) out.push({ op: 'create', kind: 'index', key: name(m, 1) });
  else if ((m = stmt.match(re(String.raw`create (?:or replace )?(?:constraint )?trigger ${ident}`)))) out.push({ op: 'create', kind: 'trigger', key: name(m, 1) });
  else if ((m = stmt.match(re(String.raw`create policy ${ident} on ${qualified}`))) && pub(m[3])) out.push({ op: 'create', kind: 'policy', key: `${name(m, 4)}.${name(m, 1)}` });
  else if ((m = stmt.match(re(String.raw`alter table (?:if exists )?(?:only )?${qualified}`))) && pub(m[1])) {
    const table = name(m, 2);
    for (const c of stmt.matchAll(new RegExp(String.raw`add column (?:if not exists )?${ident}`, 'gi'))) out.push({ op: 'create', kind: 'column', key: `${table}.${name(c, 1)}` });
    for (const c of stmt.matchAll(new RegExp(String.raw`add constraint ${ident} check`, 'gi'))) out.push({ op: 'define', kind: 'constraint', key: `${table}.${name(c, 1)}` });
    for (const c of stmt.matchAll(new RegExp(String.raw`drop column (?:if exists )?${ident}`, 'gi'))) out.push({ op: 'drop', kind: 'column', key: `${table}.${name(c, 1)}` });
  } else if (/^insert into storage\.buckets/i.test(stmt)) {
    const values = stmt.slice(stmt.search(/values/i));
    for (const v of values.matchAll(/\(\s*'([^']+)'/g)) out.push({ op: 'create', kind: 'bucket', key: v[1] });
  } else if ((m = stmt.match(re(String.raw`drop (table|view|materialized view|type|function|index) (?:if exists )?${qualified}`))) && pub(m[2])) {
    const k = m[1].toLowerCase();
    out.push({ op: 'drop', kind: k === 'view' || k === 'materialized view' ? 'table' : k, key: name(m, 3) });
  } else if ((m = stmt.match(re(String.raw`drop trigger (?:if exists )?${ident}`)))) out.push({ op: 'drop', kind: 'trigger', key: name(m, 1) });
  else if ((m = stmt.match(re(String.raw`drop policy (?:if exists )?${ident} on ${qualified}`))) && pub(m[3])) out.push({ op: 'drop', kind: 'policy', key: `${name(m, 4)}.${name(m, 1)}` });
  return out;
}

/* Every migration's probe list: [{ version, file, objects: [{ kind, key }] }]. An object belongs to the first migration that creates it and is
   left out if its last statement is a drop. A drop of a table also ends its columns, policies and indexes as far as the probe goes. */
/* Besides presence, the last migration that (re)defines a function body or a check constraint gets a fingerprint probe (`body`, `check`:
   the hash must equal the one from applying every migration, see fingerprintSql), and a migration that drops a policy for good gets a probe
   that it is gone (`policy-gone`). These make migrations that only change existing objects provable; grants are left to the privilege
   snapshot (scripts/privilege-snapshot.sql). */
export function probePlan(files) {
  const owner = new Map(); // "kind:key" -> version that first created it
  const alive = new Map(); // "kind:key" -> exists after the last migration
  const last = new Map(); // "body:fn" or "check:table.name" -> version that last defined it
  const gone = new Map(); // "policy:table.name" -> version that dropped it
  for (const { file, sql } of files) {
    const version = file.split('_')[0];
    for (const s of statements(sql))
      for (const o of objectsOf(s)) {
        const id = `${o.kind}:${o.key}`;
        if (o.kind === 'function' && o.op === 'create') last.set(`body:${o.key}`, version);
        if (o.op === 'define') {
          last.set(`check:${o.key}`, version);
          continue;
        }
        if (o.kind === 'policy') gone.set(id, o.op === 'drop' ? version : null);
        if (o.op === 'create') {
          if (!owner.has(id)) owner.set(id, version);
          alive.set(id, true);
        } else {
          alive.set(id, false);
          if (o.kind === 'table') for (const k of alive.keys()) if (/^(column|policy):/.test(k) && k.split(':')[1].startsWith(o.key + '.')) alive.set(k, false);
        }
      }
  }
  return files.map(({ file }) => {
    const version = file.split('_')[0];
    const split = (id) => ({ kind: id.split(':')[0], key: id.slice(id.indexOf(':') + 1) });
    const objects = [
      ...[...owner].filter(([id, v]) => v === version && alive.get(id)).map(([id]) => split(id)),
      ...[...last].filter(([id, v]) => v === version && (!id.startsWith('body:') || alive.get(`function:${id.slice(5)}`))).map(([id]) => split(id)),
      ...[...gone].filter(([id, v]) => v === version && owner.has(id) && owner.get(id) !== version).map(([id]) => ({ ...split(id), kind: 'policy-gone' })),
    ];
    return { version, file, objects };
  });
}

/* The fingerprint expressions, shared by the probe and by fingerprintSql so both hash exactly the same thing. */
const fingerprintOf = ({ kind, key }) => {
  const [a, b] = key.split('.');
  return kind === 'body'
    ? `coalesce((select md5(string_agg(p.prosrc, '|' order by pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = ${lit(key)}), '')`
    : `coalesce((select md5(pg_get_constraintdef(c.oid)) from pg_constraint c where c.conrelid = to_regclass(${lit('public.' + a)}) and c.conname = ${lit(b)}), '')`;
};

/* SELECT returning (kind, key, hash) for every fingerprint in the plan; run on a database with every migration applied (PGlite in the CLI). */
export function fingerprintSql(plan) {
  const fps = plan.flatMap((p) => p.objects.filter((o) => o.kind === 'body' || o.kind === 'check'));
  if (!fps.length) return null;
  return fps.map((o) => `select ${lit(o.kind)} as kind, ${lit(o.key)} as key, ${fingerprintOf(o)} as hash`).join('\nunion all\n');
}

/* The plan with each fingerprint's expected hash filled in. */
export function withHashes(plan, rows) {
  const h = new Map(rows.map((r) => [`${r.kind}:${r.key}`, r.hash]));
  return plan.map((p) => ({ ...p, objects: p.objects.map((o) => (o.kind === 'body' || o.kind === 'check' ? { ...o, hash: h.get(`${o.kind}:${o.key}`) ?? '' } : o)) }));
}

function presence(o) {
  const { kind, key } = o;
  const [a, b] = key.split('.');
  switch (kind) {
    case 'table':
    case 'index':
      return `to_regclass(${lit('public.' + key)}) is not null`;
    case 'type':
      return `to_regtype(${lit('public.' + key)}) is not null`;
    case 'column':
      return `exists (select 1 from pg_attribute where attrelid = to_regclass(${lit('public.' + a)}) and attname = ${lit(b)} and not attisdropped)`;
    case 'function':
      return `exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = ${lit(key)})`;
    case 'trigger':
      return `exists (select 1 from pg_trigger where tgname = ${lit(key)} and not tgisinternal)`;
    case 'policy':
      return `exists (select 1 from pg_policies where schemaname = 'public' and tablename = ${lit(a)} and policyname = ${lit(b)})`;
    case 'bucket':
      return `exists (select 1 from storage.buckets where id = ${lit(key)})`;
    case 'policy-gone':
      return `not exists (select 1 from pg_policies where schemaname = 'public' and tablename = ${lit(a)} and policyname = ${lit(b)})`;
    case 'body':
    case 'check':
      return `${fingerprintOf(o)} = ${lit(o.hash ?? '')}`;
    default:
      throw new Error(`unknown kind ${kind}`);
  }
}

/* One SELECT-only statement: per migration, how many of its objects exist and which are missing. Reads the catalogue, never rows. */
export function probeSql(plan) {
  const rows = plan.flatMap((p) => p.objects.map((o) => `  (${lit(p.version)}, ${lit(o.kind)}, ${lit(o.key)}, ${presence(o)})`));
  const none = plan.filter((p) => !p.objects.length).map((p) => p.version);
  return [
    '-- Migration probe (scripts/migration-probe.mjs). SELECT only: reads the system catalogue, no table rows, no writes.',
    '-- Run as postgres in the SQL editor, export the result as JSON, then: node scripts/migration-probe.mjs --classify history.json probe.json',
    `-- Migrations with nothing of their own left to probe (grants, or changes a later migration redefines): compare with scripts/privilege-snapshot.sql and the later migrations: ${none.join(', ') || 'none'}`,
    'with expected(version, kind, object, present) as (values',
    rows.join(',\n'),
    ')',
    'select version, count(*)::int as objects, (count(*) filter (where present))::int as present,',
    "  coalesce(string_agg(kind || ' ' || object, ', ' order by kind, object) filter (where not present), '') as missing",
    'from expected group by version order by version;',
    '',
    '-- And the recorded history (read only):',
    '-- select version, name from supabase_migrations.schema_migrations order by version;',
    '',
  ].join('\n');
}

/* The verdict per migration from the recorded history and the probe result. Never a write: the verdict says what a person should do next. */
export function classify(plan, history, probe) {
  const recorded = new Set(history.map((h) => String(h.version)));
  const byVersion = new Map(probe.map((r) => [String(r.version), r]));
  return plan.map(({ version, file, objects }) => {
    const r = byVersion.get(version);
    const isRecorded = recorded.has(version);
    // A check constraint's text is written out by Postgres itself, so a different Postgres version can change it: when only those differ, say so.
    const onlyChecks = Boolean(r?.missing) && r.missing.split(', ').every((x) => x.startsWith('check '));
    const state = !objects.length ? 'unprovable' : !r ? 'unknown' : r.present === r.objects ? 'complete' : onlyChecks ? 'check-text' : r.present === 0 ? 'absent' : 'partial';
    const verdict = {
      complete: isRecorded ? 'applied' : 'applied, not recorded: repair history after review',
      absent: isRecorded ? 'RECORDED BUT ABSENT: investigate before anything else' : 'missing: apply in order',
      partial: isRecorded ? 'RECORDED BUT PARTIAL: investigate' : 'PARTLY APPLIED: investigate by hand',
      'check-text': 'only check-constraint text differs: compare pg_get_constraintdef with the file by hand (may be Postgres formatting)',
      unprovable: isRecorded
        ? 'recorded; nothing of its own to probe (grants or later redefined): privilege snapshot'
        : 'not recorded; nothing of its own to probe (grants or later redefined): privilege snapshot',
      unknown: 'not in the probe result: rerun the probe',
    }[state];
    return { version, file, recorded: isRecorded, objects: objects.length, present: r?.present ?? null, missing: r?.missing ?? '', state, verdict };
  });
}

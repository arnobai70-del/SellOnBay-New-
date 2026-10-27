/**
 * Staging-only test accounts for SellOnBay 2.0 (NOT run yet; needs the owner's separate permission after the migrations).
 *
 *   node scripts/staging-fixtures.mjs            dry run: prints what it would create, touches nothing
 *   node scripts/staging-fixtures.mjs --apply    creates the accounts on the staging project only
 *
 * Refuses unless: the staging guard passes (scripts/verify-staging-target.mjs), NEXT_PUBLIC_SUPABASE_URL is exactly the staging project,
 * and STAGING_FIXTURE_PASSWORD is set (one shared test password, at least 16 characters, never committed). Emails use the reserved
 * example.test domain, so no real mailbox ever receives anything. TOTP for sellers and admins is enrolled afterwards by signing in through
 * the site (an authenticator app on a test device), because the code must be scanned by a person.
 * It never reads, copies or changes production data.
 */
import { createClient } from '@supabase/supabase-js';
import { checkStagingTarget, STAGING_SUPABASE_REF } from './verify-staging-target.mjs';

export const FIXTURES = [
  { email: 'buyer1@example.test', name: 'Staging Buyer One', role: 'buyer' },
  { email: 'buyer2@example.test', name: 'Staging Buyer Two', role: 'buyer' },
  { email: 'seller1@example.test', name: 'Staging Seller One', role: 'seller' },
  { email: 'seller2@example.test', name: 'Staging Seller Two', role: 'seller' },
  { email: 'super@example.test', name: 'Staging Super Admin', role: 'admin', scopes: ['super'] },
  { email: 'finance@example.test', name: 'Staging Finance', role: 'admin', scopes: ['finance'] },
  { email: 'catalog@example.test', name: 'Staging Catalog', role: 'admin', scopes: ['catalog'] },
  { email: 'support@example.test', name: 'Staging Support', role: 'admin', scopes: ['support'] },
  { email: 'content@example.test', name: 'Staging Content', role: 'admin', scopes: ['content'] },
  { email: 'delivery@example.test', name: 'Staging Delivery', role: 'admin', scopes: ['delivery'] },
];

export function fixtureProblems(env) {
  const problems = [...checkStagingTarget(env).problems];
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? env.STAGING_SUPABASE_URL ?? '';
  if (url !== `https://${STAGING_SUPABASE_REF}.supabase.co`) problems.push('The Supabase URL must be exactly the staging project ' + STAGING_SUPABASE_REF);
  if ((env.STAGING_FIXTURE_PASSWORD ?? '').length < 16) problems.push('STAGING_FIXTURE_PASSWORD must be set (16 characters or more)');
  return problems;
}

async function main() {
  const apply = process.argv.includes('--apply');
  for (const f of FIXTURES) console.log(`${apply ? 'create' : 'would create'}: ${f.email} (${f.role}${f.scopes ? ', ' + f.scopes.join('+') : ''})`);
  if (!apply) return console.log('Dry run: nothing was created. Add --apply to create these on the staging project.');
  const problems = fixtureProblems(process.env);
  if (problems.length) {
    for (const p of problems) console.error('STAGING BLOCKED: ' + p);
    process.exitCode = 1;
    return;
  }
  const db = createClient(`https://${STAGING_SUPABASE_REF}.supabase.co`, process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  for (const f of FIXTURES) {
    const { data, error } = await db.auth.admin.createUser({ email: f.email, password: process.env.STAGING_FIXTURE_PASSWORD, email_confirm: true, user_metadata: { full_name: f.name } });
    if (error && !/already/i.test(error.message)) throw new Error(`${f.email}: ${error.message}`);
    const id = data?.user?.id ?? (await db.auth.admin.listUsers({ perPage: 200 })).data.users.find((u) => u.email === f.email)?.id;
    if (!id) throw new Error(`${f.email}: no id`);
    const { error: pe } = await db
      .from('profiles')
      .update({ role: f.role, full_name: f.name, ...(f.scopes ? { admin_scopes: f.scopes } : {}) })
      .eq('id', id);
    if (pe) throw new Error(`${f.email}: profile not set`);
    console.log('ok', f.email);
  }
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) main().catch((e) => ((process.exitCode = 1), console.error(String(e.message ?? e))));

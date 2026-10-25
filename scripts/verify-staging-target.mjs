/**
 * Staging RLS tests create users, orders, ledger entries and storage objects.
 * Verify separate app and Supabase projects BEFORE handing them service-role
 * credentials. All GitHub environment values are validated but never logged.
 */
export function checkStagingTarget(env) {
  const problems = [];
  if (env.STAGING_CONFIRM !== 'I_UNDERSTAND_STAGING_WRITES') problems.push('Missing typed staging-only confirmation');
  const urls = {};
  for (const key of ['STAGING_APP_URL', 'PRODUCTION_APP_URL', 'STAGING_SUPABASE_URL', 'PRODUCTION_SUPABASE_URL']) {
    try {
      const raw = (env[key] ?? '').trim();
      const parsed = new URL(raw);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || parsed.pathname !== '/' || parsed.search || parsed.hash)
        throw new Error('unsafe');
      if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(parsed.hostname)) throw new Error('local');
      urls[key] = parsed;
    } catch {
      problems.push(key + ' must be an absolute HTTPS origin without credentials, paths, query or custom port');
    }
  }
  if (urls.STAGING_APP_URL && urls.PRODUCTION_APP_URL && urls.STAGING_APP_URL.hostname === urls.PRODUCTION_APP_URL.hostname)
    problems.push('Staging app must not use the production hostname');
  if (urls.STAGING_SUPABASE_URL && urls.PRODUCTION_SUPABASE_URL && urls.STAGING_SUPABASE_URL.hostname === urls.PRODUCTION_SUPABASE_URL.hostname)
    problems.push('Staging and production Supabase projects must be different');
  for (const key of ['STAGING_SUPABASE_ANON_KEY', 'STAGING_SUPABASE_SERVICE_ROLE_KEY']) {
    if (!(env[key] ?? '').trim()) problems.push('Missing protected staging credential: ' + key);
  }
  if (env.LAUNCHBAY_DEMO === '1') problems.push('Do not use demo mode for staging RLS tests');
  return { ok: problems.length === 0, problems };
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const result = checkStagingTarget(process.env);
  if (!result.ok) {
    for (const reason of result.problems) console.error('STAGING BLOCKED: ' + reason);
    process.exitCode = 1;
  } else {
    console.log('Staging guard passed: separate HTTPS app and Supabase targets, credentials present.');
  }
}

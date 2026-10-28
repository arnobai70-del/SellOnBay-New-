import fs from 'node:fs';
import path from 'node:path';

/*
 * The keys for the specs that run against a real database (REAL_URL). Read from `.env.local` when there is one, and from the process
 * environment otherwise: the staging run passes the isolated staging project's keys from outside the repository (~/.sob-staging, never a
 * file in the repo). The production project is refused outright, whatever the source.
 */
const PRODUCTION_REF = 'knvxtgzrylvkhyrcezlq';
const envFile = path.join(__dirname, '..', '..', '.env.local');
export const realEnv: Record<string, string> = fs.existsSync(envFile)
  ? Object.fromEntries(
      fs
        .readFileSync(envFile, 'utf8')
        .split(/\r?\n/)
        .filter((l) => l.includes('='))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
    )
  : {};
for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) if (process.env[k]) realEnv[k] = process.env[k] as string;
if ((realEnv.NEXT_PUBLIC_SUPABASE_URL ?? '').includes(PRODUCTION_REF)) throw new Error('These tests write synthetic rows: never against the production project.');

/* For contexts a spec opens itself: the staging password (lib/stage.ts), sent only when a server asks for it. Empty without one. */
const [user, pass] = (process.env.STAGING_BASIC_AUTH ?? '').split(':');
export const realContext = user && pass ? { httpCredentials: { username: user, password: pass, send: 'unauthorized' as const } } : {};

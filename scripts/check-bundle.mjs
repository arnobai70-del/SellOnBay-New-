// After `npm run build`: makes sure no secret is inside the files that are sent to browsers (.next/static). Usage: node scripts/check-bundle.mjs
// Looks for (1) the actual values of the secrets in .env.local and the environment, (2) any JWT whose payload says role "service_role",
// (3) the names of the server-only variables. A leak fails the build.
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const dir = path.join(root, '.next', 'static');
if (!fs.existsSync(dir)) {
  console.log('No .next/static yet. Run `npm run build` first.');
  process.exit(2);
}

const SECRET_NAMES = ['SUPABASE_SERVICE_ROLE_KEY', 'DELIVERY_SECRET', 'PAYMENT_WEBHOOK_SECRET', 'CRON_SECRET', 'TURNSTILE_SECRET_KEY', 'GUARD_SALT', 'RESEND_API_KEY'];
const values = new Map();
const envFile = path.join(root, '.env.local');
const fromFile = fs.existsSync(envFile)
  ? Object.fromEntries(
      fs
        .readFileSync(envFile, 'utf8')
        .split(/\r?\n/)
        .filter((l) => l.includes('='))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
    )
  : {};
for (const n of SECRET_NAMES) {
  const v = process.env[n] || fromFile[n];
  if (v && v.length >= 8) values.set(n, v);
}

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|mjs|css|json|html|map|txt)$/.test(e.name)) files.push(p);
  }
})(dir);

const problems = [];
const jwt = /eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/g;
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  for (const [name, v] of values) if (text.includes(v)) problems.push(`${path.relative(root, f)} contains the value of ${name}`);
  for (const n of SECRET_NAMES) if (text.includes(n)) problems.push(`${path.relative(root, f)} mentions ${n}`);
  for (const m of text.matchAll(jwt)) {
    try {
      const payload = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
      if (payload.role === 'service_role') problems.push(`${path.relative(root, f)} contains a service_role key`);
    } catch {
      /* not a JWT after all */
    }
  }
}
console.log(`Checked ${files.length} browser files against ${values.size} secret value(s).`);
if (problems.length) {
  console.log('LEAK:\n' + [...new Set(problems)].join('\n'));
  process.exit(1);
}
console.log('No secrets in the browser bundle.');

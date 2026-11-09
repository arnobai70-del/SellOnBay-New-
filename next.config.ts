import { readFileSync } from 'node:fs';
import type { NextConfig } from 'next';

/*
 * The commit this build was made from, shown read-only on the admin system page. A zip made with `git archive` (the Hostinger upload) carries it
 * in build-commit.txt (export-subst in .gitattributes fills in the hash and its date); a git checkout has it in .git. Files only, no commands.
 */
function buildCommit(): string {
  try {
    const stamped = readFileSync('build-commit.txt', 'utf8').trim().split(' ')[0];
    if (/^[0-9a-f]{40}$/.test(stamped)) return stamped;
  } catch {
    // no stamped file: a git checkout
  }
  try {
    const head = readFileSync('.git/HEAD', 'utf8').trim();
    if (/^[0-9a-f]{40}$/.test(head)) return head;
    const ref = head.replace(/^ref: /, '');
    try {
      return readFileSync(`.git/${ref}`, 'utf8').trim();
    } catch {
      const packed = readFileSync('.git/packed-refs', 'utf8')
        .split(/\r?\n/)
        .find((l) => l.endsWith(` ${ref}`));
      return packed?.split(' ')[0] ?? '';
    }
  } catch {
    return '';
  }
}

/*
 * The first line of every build log names the commit, so a host's log shows which upload it is building (owner, 2026-11-09: a stale upload looked
 * like a new bug). A build without the files every page needs stops at once with a plain message instead of a webpack error three minutes in.
 */
if (process.argv.includes('build')) {
  const commit = buildCommit().slice(0, 7) || 'unknown';
  console.log(`SellOnBay build from commit ${commit}`);
  const missing = ['lib/supabase/client.ts', 'lib/supabase/server.ts', 'app/layout.tsx', 'proxy.ts'].filter((f) => {
    try {
      readFileSync(f);
      return false;
    } catch {
      return true;
    }
  });
  if (missing.length) throw new Error(`SellOnBay upload is incomplete (missing ${missing.join(', ')}). Delete the old files and upload SellOnBay-HOSTINGER.zip again (commit ${commit}).`);
}

/*
 * Security headers on every page and API answer (spec section 9). The hosted seller demos under /demo are left out on purpose: they set their own
 * `Content-Security-Policy: sandbox` (no allow-same-origin) and must keep it. Scripts and styles need 'unsafe-inline' because Next writes small inline
 * scripts; tightening that needs per-request nonces and is a later step. Everything else is closed down: no plugins, no framing by other sites,
 * forms and base only to ourselves, connections only to ourselves, Supabase and Cloudflare Turnstile.
 */
const dev = process.env.NODE_ENV !== 'production';
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''} https://challenges.cloudflare.com https://*.tawk.to https://cdn.jsdelivr.net https://www.googletagmanager.com`,
  "style-src 'self' 'unsafe-inline' https://*.tawk.to https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://*.tawk.to https://fonts.gstatic.com",
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com https://*.tawk.to wss://*.tawk.to https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com${dev ? ' ws: http://localhost:*' : ''}`,
  "frame-src 'self' https:", // our own previews and a seller's https demo link
  "worker-src 'self' blob:",
  "media-src 'self' https: blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  ...(dev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const nextConfig: NextConfig = {
  // A second build can live beside the first (a test server with the old public site): NEXT_DIST_DIR=.next-legacy.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  poweredByHeader: false,
  // server code reads these (lib/admin/system.ts); a commit hash and a time are not secrets
  env: { SOB_BUILD_SHA: buildCommit(), SOB_BUILD_TIME: new Date().toISOString() },
  // `next dev` only: lets a phone on the same Wi-Fi or a quick Cloudflare tunnel load the dev scripts, so menus work there too.
  allowedDevOrigins: ['*.trycloudflare.com', '192.168.*.*', '10.*.*.*'],
  async headers() {
    return [
      {
        source: '/((?!demo/).*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
      // API answers are per person (orders, chat, notifications, downloads), so no browser, Hostinger or Cloudflare cache may keep them.
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }] },
    ];
  },
};

export default nextConfig;

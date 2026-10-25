import type { NextConfig } from 'next';

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

import { SITE_URL } from './site';

/*
 * The address a visitor really used, for the redirects the server builds (after an email link, sign-in, a moved page). Behind the host's proxy the
 * server only sees its own bind address (for example 0.0.0.0:3000), and a redirect built from that sends the visitor to a page that cannot open.
 * A public name stays as it is (so a test server on another port still works); an internal or missing one is replaced by NEXT_PUBLIC_SITE_URL.
 */
const INTERNAL = /^(0\.0\.0\.0|\[::\]|\[::1\]|::)(:\d+)?$/;
const PRIVATE_IP = /^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+)(:\d+)?$/;

export function publicOrigin(i: { host?: string | null; forwardedHost?: string | null; forwardedProto?: string | null; nextOrigin: string; siteUrl?: string }): string {
  const site = (i.siteUrl ?? SITE_URL).replace(/\/$/, '');
  const host = (i.forwardedHost ?? i.host ?? '').split(',')[0].trim().toLowerCase();
  if (!host || INTERNAL.test(host) || PRIVATE_IP.test(host)) return site;
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const proto = (i.forwardedProto ?? '').split(',')[0].trim() || (local ? new URL(i.nextOrigin).protocol.replace(':', '') : 'https');
  return `${proto}://${host}`;
}

/* From a request's headers. */
export function originOf(req: { headers: Headers; nextUrl?: { origin: string }; url: string }): string {
  return publicOrigin({
    host: req.headers.get('host'),
    forwardedHost: req.headers.get('x-forwarded-host'),
    forwardedProto: req.headers.get('x-forwarded-proto'),
    nextOrigin: req.nextUrl?.origin ?? new URL(req.url).origin,
  });
}

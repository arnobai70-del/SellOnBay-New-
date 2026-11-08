import { passedCode } from './lib/auth/authenticator';
import { originOf } from './lib/publicOrigin';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { sessionCookieOptions } from '@/lib/supabase/cookieOptions';
import { supabaseAnonKey, supabaseConfigured, supabaseUrl } from '@/lib/supabase/env';
import { cannotAct } from './lib/accounts';
import { closedForPath, maintenanceJson, maintenancePageResponse } from './lib/maintenance/guard';
import { allowedIp } from './lib/maintenance/state';
import { clientAddress } from './lib/clientIp';
import type { ModuleKey } from './lib/maintenance/config';
import { crossSiteWrite } from './lib/sameOrigin';
import { isRetired, isRetiredApi } from './lib/legacy';
import { movedTo } from './lib/glass/moved';
import { savedRedirects } from './lib/seo/redirectRead';
import { isProtectedPath, redirectFor } from './lib/seo/redirectsCore';
import { SITE_URL } from './lib/site';
import { basicAuthOk, isStaging, openOnStaging, STAGING_ROBOTS, stagingProblem } from './lib/stage';

const SIGNED_IN = ['/dashboard', '/admin', '/messages', '/checkout', '/sell/new'];
const STAFF = ['/dashboard/seller', '/dashboard/admin', '/admin', '/sell/new']; // sellers and admins need 2FA (/admin: the glass admin, Phase 6)

/* Every visitor gets a random device id once. It is only used to spot many accounts on one device (lib/guard.ts) and is stored as a hash. */
export async function proxy(req: NextRequest) {
  // Staging (lib/stage.ts): password and noindex on everything; a wrong configuration answers 503 instead of running. Production: unchanged.
  if (isStaging()) {
    const problem = stagingProblem();
    const robots = { 'x-robots-tag': STAGING_ROBOTS, 'cache-control': 'no-store' };
    if (problem) return new NextResponse(`Staging is not configured safely: ${problem}`, { status: 503, headers: robots });
    if (!openOnStaging(req.nextUrl.pathname) && !basicAuthOk(req.headers.get('authorization'), process.env.STAGING_BASIC_AUTH ?? ''))
      return new NextResponse('Sign in to the SellOnBay staging site.', { status: 401, headers: { ...robots, 'www-authenticate': 'Basic realm="SellOnBay staging", charset="UTF-8"' } });
    const res = await proxyInner(req);
    res.headers.set('x-robots-tag', STAGING_ROBOTS);
    return res;
  }
  return proxyInner(req);
}

async function proxyInner(req: NextRequest) {
  const h = req.headers;
  // One address for the site: the www and the non-www host both lead to the one in NEXT_PUBLIC_SITE_URL (permanent, path and query kept), so search engines see one site.
  if ((req.method === 'GET' || req.method === 'HEAD') && process.env.NODE_ENV === 'production') {
    const primary = new URL(SITE_URL).host;
    const asked = (h.get('x-forwarded-host') ?? h.get('host') ?? '').split(',')[0].trim().toLowerCase();
    const bare = (x: string) => x.replace(/^www\./, '');
    if (asked && asked !== primary && bare(asked) === bare(primary)) return NextResponse.redirect(`${SITE_URL}${req.nextUrl.pathname}${req.nextUrl.search}`, 308);
  }
  if (crossSiteWrite(req.method, req.nextUrl.pathname, h.get('origin'), [h.get('host'), h.get('x-forwarded-host'), SITE_URL]))
    return NextResponse.json({ error: 'Not allowed from another site.' }, { status: 403 });
  // A module in maintenance (lib/maintenance): its pages show the maintenance notice, its APIs answer 503. The routes check again themselves.
  const closed = await closedForPath(req.nextUrl.pathname);
  if (closed && !(await allowedIp(clientAddress(req.headers))) && !(closed.module && (await adminPasses(req, closed.module))))
    return closed.api ? maintenanceJson(closed.closure) : maintenancePageResponse(closed.closure);
  // Addresses that moved in the glass redesign answer with a permanent redirect (lib/glass/moved.ts), so rankings carry over.
  if (req.method === 'GET' || req.method === 'HEAD') {
    const to = movedTo(req.nextUrl.pathname);
    if (to) {
      // Keep the visitor's query (for example ?next=), merged with any the new address carries.
      const dest = new URL(to, originOf(req));
      req.nextUrl.searchParams.forEach((v, k) => dest.searchParams.has(k) || dest.searchParams.append(k, v));
      return NextResponse.redirect(dest, 301);
    }
  }
  // The old public site (shelves, developers, tools) is retired: its code and data stay, visitors get 410 Gone (lib/legacy.ts).
  if (isRetired(req.nextUrl.pathname)) {
    const headers = { 'x-robots-tag': 'noindex', 'cache-control': 'public, max-age=300' };
    if (isRetiredApi(req.nextUrl.pathname)) return NextResponse.json({ error: 'This is no longer available.' }, { status: 410, headers });
    if (req.method === 'GET' || req.method === 'HEAD')
      return new NextResponse(
        '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Gone</title><h1>This page is no longer available</h1><p><a href="/">Go to the home page</a></p>',
        { status: 410, headers: { ...headers, 'content-type': 'text/html; charset=utf-8' } },
      );
  }
  // An address an admin moved (SEO and CMS > Redirects) goes to its new place. Only pages are read this way, never the working parts of the site.
  if ((req.method === 'GET' || req.method === 'HEAD') && !isProtectedPath(req.nextUrl.pathname)) {
    const moved = redirectFor(await savedRedirects(), req.nextUrl.pathname);
    if (moved) return NextResponse.redirect(new URL(moved.to, originOf(req)), moved.code);
  }
  const res = await handle(req);
  if (!req.cookies.get('lb_dev'))
    res.cookies.set('lb_dev', crypto.randomUUID(), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 365 });
  return res;
}

/* An admin who passed the authenticator code may still open a closed module to test it (not the admin dashboard itself). Only asked when a module is closed. */
async function adminPasses(req: NextRequest, key: ModuleKey): Promise<boolean> {
  if (!supabaseConfigured || key === 'admin') return false;
  const sb = createServerClient(supabaseUrl, supabaseAnonKey, { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } });
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return false;
  const { data: p } = await sb.from('profiles').select('role, banned, suspended_until').eq('id', user.id).single();
  if (!p || p.role !== 'admin' || cannotAct(p)) return false;
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  return passedCode(aal);
}

async function handle(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  if (!supabaseConfigured) return res;

  // If the provider sent the auth code to the site root (redirect URL not allow-listed), forward it to the callback.
  if (req.nextUrl.pathname === '/' && req.nextUrl.searchParams.has('code')) {
    const to = new URL('/auth/callback', originOf(req));
    to.searchParams.set('code', req.nextUrl.searchParams.get('code')!);
    // No next: the callback tells a password reset from a sign-up confirmation or a Google sign-in by itself.
    return NextResponse.redirect(to);
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: sessionCookieOptions(),
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser(); // validates the token with Supabase
  const path = req.nextUrl.pathname;
  const go = (to: string) => NextResponse.redirect(new URL(to, originOf(req)));

  if (!user) return SIGNED_IN.some((p) => path.startsWith(p)) ? go('/signin?next=' + encodeURIComponent(path)) : res;

  const { data: profile } = await supabase.from('profiles').select('role, banned, suspended_until').eq('id', user.id).single();
  if (profile && cannotAct(profile)) return go('/signin?error=banned');

  const role = profile?.role ?? 'buyer';
  if ((path.startsWith('/dashboard/admin') || path === '/admin' || path.startsWith('/admin/')) && role !== 'admin') return go('/dashboard/' + (role === 'seller' ? 'seller' : 'buyer'));
  if (path.startsWith('/dashboard/seller') && role === 'buyer') return go('/dashboard/buyer');

  if (role !== 'buyer' && STAFF.some((p) => path.startsWith(p))) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!passedCode(aal)) return go('/two-factor?next=' + encodeURIComponent(path));
  }
  return res;
}

// /demo serves untrusted seller files and does its own access check, so the proxy stays out of the way (and out of every asset request).
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|demo/|.*\.(?:svg|png|jpg|ico)$).*)'] };

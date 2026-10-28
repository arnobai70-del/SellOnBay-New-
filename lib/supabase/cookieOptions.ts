import { SITE_URL } from '@/lib/site';

/* Options for the Supabase session cookies (sb-*-auth-token), used by every Supabase client: proxy, server and browser.
   @supabase/ssr's own defaults are path "/", SameSite Lax, not HttpOnly, 400 days, and NO Secure flag, so without this the session
   cookie of the live site was sent without Secure. Secure on a production build served over https (the live site and staging);
   development on http://localhost is unchanged. HttpOnly stays off on purpose: the browser client (chat, sign-in with an
   authenticator code, uploads) reads the session from document.cookie. That is why the CSP and XSS rules matter for the session.
   process.env.NODE_ENV is written out in full so Next inlines it in the browser bundle (a copied process.env is empty there). */
export function sessionCookieOptions(production = process.env.NODE_ENV === 'production', siteUrl = SITE_URL) {
  return { path: '/', sameSite: 'lax' as const, secure: production && siteUrl.startsWith('https://') };
}

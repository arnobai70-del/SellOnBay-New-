# Staging on staging.sellonbay.com (Cloudflare Tunnel + staging gate)

Status 2026-10-28: LIVE WHEN RUN, password-protected. The owner chose to skip Cloudflare Zero Trust Access and protect staging with the
app's staging password instead. Because the app's own check (`proxy.ts`) skips static files, images and `/demo`, a gate in front of the
app (`deploy/staging-gate.mjs`) now asks for that password on every path.

## What exists

| Item              | Value                                                                                                                                                                                                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hostname          | `staging.sellonbay.com`                                                                                                                                                                                                                                                                      |
| DNS               | ONE new record, `CNAME staging -> 72d42f82-e4b7-4142-9cdb-a9febd433ace.cfargotunnel.com`, proxied, created by `cloudflared tunnel route dns` with the owner's written authorisation. No other record was changed (`sellonbay.com` and `www` still point at Hostinger)                        |
| Tunnel            | Named tunnel `sellonbay-staging` (id `72d42f82-e4b7-4142-9cdb-a9febd433ace`). Credentials and config in `%USERPROFILE%\.cloudflared` (outside the repository)                                                                                                                                |
| Tunnel route      | `staging.sellonbay.com -> http://127.0.0.1:3010`, everything else `http_status:404`                                                                                                                                                                                                          |
| 127.0.0.1:3010    | `deploy/staging-gate.mjs`: password on every path; 10 wrong passwords lock that address out for 15 minutes (429); plain http goes to https before any password; every answer gets `X-Robots-Tag: noindex, nofollow, noarchive` and HSTS; cookies are marked `Secure`; websockets are refused |
| 127.0.0.1:3012    | The staging app (`next start`, `.next-staging`). It keeps its own checks: `SITE_STAGE=staging`, the same password in `proxy.ts`, noindex, robots `Disallow: /`, empty sitemap, GA4 and Tawk off, staging Supabase only                                                                       |
| Password          | 32 random characters, 3 kinds, in `~/.sob-staging/app.env.json` (never in the repository)                                                                                                                                                                                                    |
| Cost              | Free: Cloudflare Tunnel, proxied DNS. No paid feature turned on                                                                                                                                                                                                                              |
| Cloudflare Access | Not used (owner's decision). Its proposal is kept below in case it is wanted later                                                                                                                                                                                                           |

## Start and stop (on this machine only, while testing)

Start in this order, each in its own terminal, all with the staging environment (`~/.sob-staging/app.env.json`):

1. `GATE_PORT=3010 APP_PORT=3012 node deploy/staging-gate.mjs` (refuses to start unless `SITE_STAGE=staging`, the password is strong,
   GA4 is off, the site URL is the https staging address, and Supabase is not production)
2. `cloudflared tunnel --no-autoupdate run sellonbay-staging`
3. Check `https://staging.sellonbay.com/` answers 401 without the password. Only then:
4. `npx next start -H 127.0.0.1 -p 3012` with `NEXT_DIST_DIR=.next-staging`

Stop: the app, the tunnel, then the gate. While the tunnel is down, Cloudflare shows its own error page for the hostname. Nothing of the app
is reachable. To remove staging entirely: `cloudflared tunnel delete sellonbay-staging` and delete the one CNAME `staging`.

## Verified 2026-10-28

Before the CNAME existed: the gate ran alone on 127.0.0.1:3010 with the app stopped. Without the password every path gave 401: `/`,
`/api/health`, `/api/cron/orders`, `/_next/static/...`, `/favicon.ico`, `/demo/...` and unknown paths. With the password it gave 502,
because the app was stopped. The gate's unit tests (tests/unit/staging-gate.test.ts) pass.

After the CNAME, still with the app stopped, through `https://staging.sellonbay.com` without the password:

- 401 on every path, including `/_next/image`, `.svg`, `robots.txt`, `sitemap.xml` and `/login`
- 401 for POST and OPTIONS to an API
- a wrong password also gives 401
- `http://` gives 308 to `https://`
- headers: `X-Robots-Tag` noindex, HSTS, `WWW-Authenticate`

Then the app was started. With the password:

- the home page gives 200
- the app's `meta robots` says noindex
- the canonical is `https://staging.sellonbay.com`
- robots.txt is `Disallow: /` and the sitemap has 0 URLs
- there is no GA4 or Tawk, and no production reference
- a static chunk gives 200
- `/dashboard/admin` redirects to login
- cron without its secret gives 401
- the session cookie is `Secure; HttpOnly`

The staging journey through the public hostname passed 8/8.

## Known limits (accepted by the owner instead of Access)

- One shared password, not per-person sign-in. Anyone who has it can open staging. Change it in `app.env.json` (and rebuild if needed)
  when a tester leaves.
- The address of each visitor comes from `CF-Connecting-IP`. The gate trusts it because only the tunnel reaches 127.0.0.1:3010.
- The Supabase staging project is reachable on its own (as always). Its anon key is in the staging bundle, which the gate now protects.
- Production follow-up (not changed here): the Supabase session cookies are set without `Secure` by `@supabase/ssr` defaults. Production
  should pass `cookieOptions: { secure: true }` (or set it at the host) after a test on staging.

## Cloudflare Access proposal (not used)

Self-hosted application on `staging.sellonbay.com`, one Allow policy for named emails, one-time PIN, session 8 hours, no Everyone, no
Bypass. It needs the Access application created in Zero Trust (or a short-lived token limited to "Access: Apps and Policies Edit").

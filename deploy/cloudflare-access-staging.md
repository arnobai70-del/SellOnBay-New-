# Staging behind Cloudflare Tunnel and Access (PREPARED, NOT SET UP)

Status 2026-10-28: nothing here has been created. Setting it up needs account-level changes in the owner's Cloudflare account (a tunnel, a
DNS record, an Access application and policy) and a tunnel credential, so it waits for the owner's separate written approval. Until then the
staging app runs on `127.0.0.1:3010` only, with the staging password, and is never exposed by a temporary public tunnel.

Checked 2026-10-28 (read-only), after the owner authorised the setup "subject to verifying the hostname and access policy first":

- `cloudflared` 2026.10.2 is installed on this machine, but it is not signed in (no `~/.cloudflared`, no tunnel certificate), and there
  is no Cloudflare API token. A tunnel cannot be created without the owner's browser sign-in (`cloudflared tunnel login`).
- `sellonbay.com` uses Cloudflare name servers. `staging.sellonbay.com` does not exist. Creating it adds a record to the production
  zone, which the standing rule ("do not change production DNS or routes") does not allow without a separate, explicit yes.
- So it is BLOCKED. Ways forward, the owner chooses: (a) a written yes for exactly one new CNAME `staging.sellonbay.com` in the zone,
  then the owner signs in once; or (b) a separate zone (another domain) used only for staging, so the production zone is not touched.
- Cloudflare Zero Trust Free covers up to 50 users, so Access for a few testers costs nothing. Confirm this on Cloudflare's pricing page
  before setting it up.

## Exact proposal for approval (2026-10-28)

Checked read-only first. The zone `sellonbay.com` is on Cloudflare name servers. Production is `sellonbay.com` (AAAA records) and `www`
(a CNAME to Hostinger's CDN). `staging.sellonbay.com` does not exist, and there is no wildcard record (a random name does not resolve),
so the new name collides with nothing. `lib/stage.ts` accepts `https://staging.sellonbay.com` as `NEXT_PUBLIC_SITE_URL` (only
`sellonbay.com` and `www` are refused).

| Item                                     | Exact value                                                                                                                                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hostname                                 | `staging.sellonbay.com`                                                                                                                                                                      |
| DNS record (the ONLY change in the zone) | `CNAME staging -> <tunnel-id>.cfargotunnel.com`, proxied (orange cloud), created by `cloudflared tunnel route dns`. No existing record is edited or removed                                  |
| Tunnel                                   | Named tunnel `sellonbay-staging`, run by `cloudflared` on this machine only while tests run                                                                                                  |
| Tunnel route (ingress)                   | `staging.sellonbay.com -> http://127.0.0.1:3010`, everything else `http_status:404`                                                                                                          |
| Access application                       | Self-hosted, domain `staging.sellonbay.com` (all paths), session 8 hours, Cloudflare login page                                                                                              |
| Access policy                            | One policy, action Allow, include "Emails" = the owner's address plus named testers (listed by the owner, not written in this public repository). No "Everyone", no Bypass, no service token |
| Login method                             | One-time PIN by email (no extra identity provider)                                                                                                                                           |
| App behind it                            | Still `SITE_STAGE=staging`: password (basic auth), noindex, robots `Disallow: /`, empty sitemap, `NEXT_PUBLIC_SITE_URL=https://staging.sellonbay.com`, GA4 off                               |
| Cost                                     | Cloudflare Zero Trust Free (up to 50 users) and Tunnel are free. Confirm on Cloudflare's pricing page; no paid plan is turned on                                                             |

What the owner does:

1. Gives a written yes for exactly the CNAME above.
2. Runs `cloudflared tunnel login` once in a browser and picks `sellonbay.com`. The certificate stays in `%USERPROFILE%\.cloudflared`.
3. Sends the list of allowed emails.
4. Creates the Access application and policy in Zero Trust → Access → Applications with the values above, BEFORE the DNS record exists.
   The tunnel certificate cannot create Access applications. Alternatively, give a short-lived API token limited to "Access: Apps and
   Policies Edit" on this account only, which is deleted afterwards.

The rest is done from this machine, and the verification list below is run before any test goes through it.

## What the owner approves

1. A staging hostname that is not used by production, for example `staging.sellonbay.com` (a new record; existing records and routes are not
   touched) or a hostname on a separate zone.
2. A named tunnel `sellonbay-staging` (not a quick `trycloudflare.com` tunnel: those are public and have no Access gate).
3. An Access application for exactly that hostname, with an allow policy for named email addresses only (owner and testers), one-time PIN or
   the owner's identity provider, session 8 hours. No "Everyone", no bypass rule, no service token unless asked for.

## Steps once approved

```sh
cloudflared tunnel login                       # owner signs in; the cert stays in ~/.cloudflared, never in the repository
cloudflared tunnel create sellonbay-staging    # writes ~/.cloudflared/<tunnel-id>.json (secret, never committed)
cloudflared tunnel route dns sellonbay-staging staging.sellonbay.com   # creates ONE new CNAME; nothing else in DNS changes
```

`~/.cloudflared/config.yml` (outside the repository):

```yaml
tunnel: sellonbay-staging
credentials-file: C:\Users\<user>\.cloudflared\<tunnel-id>.json
ingress:
  - hostname: staging.sellonbay.com
    service: http://127.0.0.1:3010
  - service: http_status:404
```

Then in Zero Trust → Access → Applications: self-hosted, domain `staging.sellonbay.com`, policy "Allow" with "Emails" = the approved list.

## Verify before any test runs through it

- Without an Access session, `curl -sI https://staging.sellonbay.com/` answers a redirect to `<team>.cloudflareaccess.com` (never the app).
- With a session, the app still asks for the staging password (401 without it) and sends `X-Robots-Tag: noindex, nofollow, noarchive`.
- `robots.txt` is `Disallow: /`, `sitemap.xml` is empty.
- The app's `NEXT_PUBLIC_SITE_URL` is the staging hostname, never `sellonbay.com` (lib/stage.ts refuses to run otherwise).

Turning it off: `cloudflared tunnel delete sellonbay-staging`, delete the one CNAME and the Access application.

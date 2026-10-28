# Staging behind Cloudflare Tunnel and Access (PREPARED, NOT SET UP)

Status 2026-10-28: nothing here has been created. Setting it up needs account-level changes in the owner's Cloudflare account (a tunnel, a
DNS record, an Access application and policy) and a tunnel credential, so it waits for the owner's separate written approval. Until then the
staging app runs on `127.0.0.1:3010` only, with the staging password, and is never exposed by a temporary public tunnel.

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

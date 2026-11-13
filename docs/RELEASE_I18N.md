# Release: multi-language support (`feat/i18n`)

Prepared 2026-11-14. **Not merged, not deployed: both wait for the owner's written approval.**

## What visitors see after deploy

Nothing changes. English stays the default and the only published language. Bengali, Arabic, Hindi, Spanish, French, German and
Portuguese are enabled as drafts but **unpublished**: their addresses (`/bn/…`) answer 404 and the language switcher does not offer them.
Production has no saved language settings (`app_settings` key `i18n:languages`, checked read-only on 2026-11-14), so the built-in defaults
apply. Legal pages stay in English. Machine translations are drafts until a native speaker reviews them.

## What the release contains

- Every screen, dashboard, email and API error goes through the translator (4,357 strings, complete in 7 languages), see `docs/I18N.md`.
- CMS email templates per language (`email:<kind>@<lang>`); the English template never replaces another language.
- Test safety: `lib/testGuard.ts` (first check in `proxy.ts`). A server on the production database refuses requests marked `x-sob-e2e`,
  and a `LAUNCHBAY_DEMO=1` server on it answers 503 for any address other than sellonbay.com. Normal traffic on sellonbay.com is
  unaffected (verified with the live host name).

## Steps (only after approval)

1. No migration: the branch adds no file under `supabase/migrations`. No new environment variable.
2. `main` and `release/glass-ui` are both contained in `feat/i18n`, so merging is a fast-forward with no conflicts (checked with
   `git merge-tree`).
3. Fast-forward `release/glass-ui` to `feat/i18n`, then `npm run package:hostinger` (the current zip is kept as
   `SellOnBay-HOSTINGER-previous-<commit>.zip` for rollback). A candidate made from the same commit,
   `SellOnBay-HOSTINGER-candidate-i18n-<commit>.zip`, is already in the project folder for inspection; it is not the release zip.
4. Upload, `npm ci && npm run build && npm start`, as in `docs/HOSTINGER_UPLOAD.md`.
5. After deploy: open `/`, `/websites`, `/signin` and a product page in English; `/bn` must be 404; Admin › Language Management shows
   7 languages unpublished.

## Rollback

Upload the previous zip (`SellOnBay-HOSTINGER-previous-<commit>.zip`), build and start. Nothing in the database changes on deploy, so
nothing needs undoing there.

## Publishing a language later

Admin › Language Management: review the language's drafts in Translations, publish its edits, then tick Published. Legal pages need a
lawyer-reviewed translation first.

## Open items

- 5 synthetic rows in production from the 2026-11-13 test incident (`docs/STAGING_LOG.md`): backed up, exact-id cleanup prepared, waiting
  for the owner's separate approval.
- `tests/unit/affiliates-pg.test.ts` needs PostgreSQL 17 binaries on the test machine; the same money rules pass on staging
  (`AFF_STAGING=1`, 4/4).

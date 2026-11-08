# Cleanup list (Phase 7, waiting for the owner's ok)

Found with tools, then checked by hand: knip 6.42.1 (unused files, exports, packages), depcheck 1.4.7 (unused packages), and a search of `app`, `components`, `lib` and `tests` for every import of each file (static imports, dynamic `import()`, and tests that read a file by name). Nothing below is imported by any page, route, library or unit test that still runs. Nothing is deleted until the owner says ok; then it goes in one commit ("chore: remove unused files"), followed by the build, the full tests and the typecheck.

Never deleted (owner, 2026-11-08): migrations, `supabase/`, `.env*`, `backups/`, tests of live code, robots, sitemap and redirects, `docs/DECISIONS.md`, `SELLONBAY_REDESIGN.md`, and anything still imported anywhere. `design-reference/` stays until launch.

## A. Unused anywhere: proposed for deletion (41 files, 3.0 MB)

| File | Why it is unused | Size |
| --- | --- | --- |
| `components/HeroSlides.tsx` | The older blue hero; no page draws it since the globe hero, then the cinematic home, then the glass home. | 7.3 KB |
| `components/HeroDemo.tsx` | Used only by `HeroSlides`. | 7.9 KB |
| `components/LiquidMetal.tsx` | The WebGL chrome background; used only by `HeroSlides`. | 7.9 KB |
| `components/Scene3D.tsx` | 3D stage; used only by `HeroSlides` and `HeroDemo`. | 1.9 KB |
| `components/Ring3D.tsx` | The turning ring of sites; removed from the home page on request (October). | 5.0 KB |
| `components/Crystal3D.tsx` | The three.js crystal of the old hero; not imported. | 6.2 KB |
| `components/StoryScroll.tsx` | Old home scroll story; replaced by `StoryScenes`, then by the glass home. | 3.8 KB |
| `components/StoryVisuals.tsx` | Pictures of `StoryScroll`; not imported. | 5.2 KB |
| `components/ExplainerVideo.tsx` | The built-in explainer of the old home; not imported. | 5.7 KB |
| `components/HeroDomain.tsx` | The typing domain panel of the October home; not imported. | 4.2 KB |
| `components/HeroMarquee.tsx` | Old hero strip; not imported. | 1.0 KB |
| `components/StoreMotion.tsx` | Motion of the old store home; not imported. | 1.3 KB |
| `components/AppDoors.tsx` | Door cards of the old app shelves; not imported. | 1.7 KB |
| `components/DoorCards.tsx` | Door cards of the old home; not imported. | 1.9 KB |
| `components/CategoryTiles.tsx` | Shelf tiles, removed from the home on request; not imported. | 1.5 KB |
| `components/CategoryPage.tsx` | Old category page body; the glass `/websites/category/...` page replaced it. | 3.7 KB |
| `components/AppPreview.tsx` | Old app preview frame; not imported. | 3.9 KB |
| `components/PreviewFrame.tsx` | Old product page frame; the glass website page replaced it. | 3.2 KB |
| `lib/domain.ts` | Used only by `PreviewFrame`. | 0.4 KB |
| `components/BuyBox.tsx` | Old product page buy box; not imported. | 5.8 KB |
| `components/AskSeller.tsx` | Old product page question form; not imported (questions still work from the seller pages). | 3.9 KB |
| `components/CheckoutClient.tsx` | The instant checkout, closed by decision D-E; the glass checkout replaced it. | 21.9 KB |
| `lib/refundText.ts` | Used only by `CheckoutClient`. | 0.5 KB |
| `components/DomainSearch.tsx` | Old domain search; the glass `/domains` page replaced it. | 8.8 KB |
| `components/EscrowLine.tsx` | Old home line; not imported. | 1.5 KB |
| `components/SellerCalc.tsx` | Old sell page calculator; the glass `/sell` has its own. | 1.2 KB |
| `components/SellerPlanPanel.tsx` | Pro and Business plans panel; hidden by the flat 78/22 fee and removed from the seller dashboard in Phase 5. | 4.1 KB |
| `components/TrialCopy.tsx` | Old product page trial-copy button; not imported (the trial copy flag is off). | 1.7 KB |
| `components/dash.tsx` | Old dashboard helpers (timer, queue items); no page imports them after Phases 4 to 6. | 3.6 KB |
| `components/home/FeaturedTabs.tsx` | Cinematic home (October); the glass home replaced it. | 1.8 KB |
| `components/home/HeroVideo.tsx` | Cinematic home hero video. | 2.2 KB |
| `components/home/HomeCard.tsx` | Cinematic home cards. | 3.4 KB |
| `components/home/HomeMotion.tsx` | Cinematic home motion (the JS motion retired by the owner). | 7.8 KB |
| `components/home/RailControls.tsx` | Cinematic home rails. | 2.1 KB |
| `components/home/serif.ts` | Cinematic home accent font. | 0.6 KB |
| `app/home.css` | Cinematic home styles; only comments mention it now. | 36.4 KB |
| `scripts/hero-video-render.cjs` | Renders the cinematic hero video; nothing uses the video now. | 1.5 KB |
| `scripts/hero-video-scene.html` | Scene of that render. | 4.5 KB |
| `public/media/hero-1280.mp4` | Cinematic hero video, used only by `HeroVideo`. | 1,923.9 KB |
| `public/media/hero-854.mp4` | The same, smaller. | 922.3 KB |
| `public/media/hero-poster.webp` | Its poster, used only by `HeroVideo`. | 54.8 KB |

Also, outside git: `.next-view/` (228 MB) is a stray build folder from a view check; it is not tracked, so deleting it changes nothing in the repository. Proposed: delete it and add it to `.gitignore`.

## B. The retired old public site: your choice

These routes answer 410 Gone (or 301 to their new address) on the real site. They still build and are used only by test servers built with `NEXT_PUBLIC_LEGACY_PUBLIC=1`, whose browser tests (`tests/e2e/` explore, shelves, nav, listing and others) cover the old site, not live code. Deleting them means deleting that legacy test build and its tests too. Recommendation: keep them until launch, then remove them together in one commit.

`app/(site)/apps`, `blog`, `browse`, `categories`, `developers`, `explore`, `find`, `guest`, `tools`, `welcome` (with `components/GlobeHero.tsx` and `components/Globe3D.tsx`, used only by `/welcome`), `app/(site)/search/LegacySearch.tsx`, the old `SiteNav`, `Footer` and `EarlyBar` frame, `app/market.css`, and the old styles in `app/globals.css` they use. The empty folders `app/(site)/acceptable-use`, `dmca`, `privacy`, `refunds`, `seller-agreement`, `terms` (their pages moved to `/legal`) are not in git and can simply be removed.

## C. `/design-preview`

The owner listed it for removal. It is a 404 in production and only shows the glass components. Deleting it also changes two unit tests that name it (`glass-ui`, `maintenance-config`). Proposed: delete it with group A.

## D. Kept on purpose

- `components/DashShell.tsx` and the old styles in `app/globals.css`: still used by 56 older admin tools under `/dashboard/admin` that the glass admin pages link to.
- `components/PayForm.tsx`: the test-card form now works only for the made-up example orders of a demo server; it can never fund a real order (Phase 7).
- Packages: depcheck flags `tailwindcss`, `@tailwindcss/postcss`, `postcss` and `supabase`, and knip flags `@axe-core/playwright` and `puppeteer-core`. All are used: Tailwind by `postcss.config.mjs` and `app/globals.css`, the Supabase CLI for migrations, `@axe-core/playwright` by the accessibility browser test, `puppeteer-core` by `tests/e2e/delivery.e2e.cjs`. No package is removed. depcheck also reports `playwright` as missing (imported by `delivery.e2e.cjs`; it comes with `@playwright/test`).
- knip lists 158 unused exports and 33 unused types inside files that are used. They are not deleted file by file; most are small helpers kept for tests or the legacy build.
- `AUTHENTICATOR_OFF`: the code ignores it since Phase 5; it remains only in the history in `docs/DECISIONS.md` and as a line in your `.env.local`, which you may delete.
- The theme switch was removed in Phase 2.

## E. Test data cleanup (not deleted until the owner says so)

Every test row is marked (emails ending `@test.sellonbay.dev`, titles starting `[TEST]`) and listed with its ids in `docs/REDESIGN_PROGRESS.md`, "Test rows to remove before launch":

- Accounts: `buyer1@` to `buyer5@`, `seller1@`, `admin1@`, `admin2@test.sellonbay.dev` (admins banned after each run; authenticator factors on seller1, admin1, admin2).
- Listing `test-beta-website-qa` ("[TEST] Beta website", paused) with its price history and the stopped sale `e93cba1f-…`.
- Beta orders `2c57de3e-…`, `c714c781-…`, `7395a0d0-…`, `859a921d-…`, `bf3b2ce6-…`, and the cash order `57a4408b-…` with its ledger lines (ledger lines are never deleted; a reversing entry would be the way).
- Guide `0caf8f3d-…` ("[TEST] Guide check", unpublished) and its revision; seller1's store `test-seller-qa`, two ID verifications with their files in `seller-ids`; one `page_counts` row; settings rows left empty by the checks.

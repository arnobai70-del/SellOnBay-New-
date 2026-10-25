# Load testing

The scripts in `load/` measure how the site behaves under many visitors. They are not run in CI and have not been run yet: there is no staging copy. Until a run on staging says otherwise, we make no claim about how many visitors the site can serve.

## Rules

- **Staging only.** `load/lib/target.js` refuses `sellonbay.com` and needs `LOAD_CONFIRM=STAGING_ONLY`. A load test on the live site looks like an attack, costs money and can slow real buyers.
- **Read only.** `load/browse.js` opens public pages and the domain search. It never signs in, buys, posts or uploads, so it changes no data.
- Staging must have its own Supabase project (see `docs/STAGING_GATE.md`), the same plan as production, and a copy of realistic data (made-up listings, never real customers).
- Tell the host and Cloudflare before a stress or spike run, or their protection may block the test machine.

## Running

Install k6 from https://grafana.com/docs/k6/latest/set-up/install-k6/ on a machine outside the server (running it on the server measures the wrong thing).

```sh
BASE_URL=https://staging.example.com LOAD_CONFIRM=STAGING_ONLY PROFILE=smoke k6 run load/browse.js
BASE_URL=https://staging.example.com LOAD_CONFIRM=STAGING_ONLY PROFILE=load PRODUCT=<a live slug> k6 run load/browse.js
```

`PRODUCT` is a live listing on staging. The default is a made-up example, which answers 404 once examples are hidden.

| Profile | Shape | Answers |
| --- | --- | --- |
| smoke | 2 visitors, 30 seconds | Do the scripts and the site work at all? Run first, every time. |
| load | up to 50 visitors for 10 minutes | Normal busy hours. |
| stress | 50, 150, 300, 500 visitors in steps | Where do answers get slow or start failing? |
| spike | 20 to 400 visitors in 20 seconds and back | A sudden rush (a post goes viral). Does the site recover by itself? |
| soak | 40 visitors for 2 hours | Memory or connections that slowly leak. |

A virtual user is one visitor clicking around with pauses of a few seconds, not a registered account. 100,000 registered accounts are rarely more than a few hundred people on the site at the same moment; measure that from real analytics once the site has traffic.

## Reading the result

k6 fails the run (non-zero exit) when a pass mark in `THRESHOLDS` is missed: more than 1% failed requests, page p95 over 1.5 s, API p95 over 0.5 s. These are starting targets to compare runs, not a promise.

Watch at the same time, on staging:

- the server's CPU and memory (`top`, or the host's panel), and both copies on a blue-green setup;
- Supabase: Reports, database CPU and connections (a run that fills the connection pool needs pooling, not a bigger server);
- `rate_limited` in the k6 summary: 429 answers mean our own limits worked. All requests come from one address, so a high count says the limits are doing their job, not that the site broke. If a run is about raw speed, allow the test machine's address in Cloudflare first.

Write each run down in the table below: date, commit, profile, p95, failed rate, the first thing that got slow, and what was changed afterwards.

| Date | Commit | Profile | Page p95 | API p95 | Failed | First limit hit | Change made |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | |

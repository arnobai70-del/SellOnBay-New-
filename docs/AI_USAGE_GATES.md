# Site Ideas: AI and quota readiness

## Current implementation

- `LocalAiProvider` generates deterministic **predefined template suggestions**, not output from a hosted AI model. The UI and JSON response identify their source as `templates`.
- Domain names are **unverified suggestions** until a real registrar is connected. `/domains` cannot verify or sell domains without that integration.
- The site-ideas route checks Turnstile on new requests, the per-cookie and per-IP daily limit, saved-answer cache and the global monthly token budget. A cached answer for one provider is not reused for another provider.
- `AI_MONTHLY_TOKEN_BUDGET` defaults to 2,000,000 simulated/accounted tokens. **0 turns the feature off** even for cached answers; negative, fractional or invalid values also fail closed. This follows `docs/DECISIONS.md`.
- Before a new request the backend computes a conservative upper-bound token estimate and refuses calls that cannot fit in the remaining monthly allowance.
- If the Supabase project is configured but `ai_usage` or `free_tool_cache` is unavailable, the tool fails with 503 instead of silently switching to process memory. AI usage DB writes and reads report errors.

## Remaining integration and cost-critical work

- [ ] Decide and connect a real AI model vendor, approved model, authentication and region with server-only keys; the local template provider is not a model and an API key alone is not proof of working AI.
- [x] Code and migration 0042 add atomic Postgres claims for future real-model requests across per-cookie and per-IP daily limits and global monthly reserved+settled tokens. **Staging deployment/concurrency verification is still pending.** Existing local template demo continues using non-atomic in-process quotas and must not be connected to a paid AI model.
- [ ] Record provider-verified billable token use, retries, timeouts, rate-limit responses and per-feature cost; reconcile against actual provider invoices.
- [ ] Verify production Supabase migration 0029 on isolated staging, enforce staging table/RLS assertions, and test service outages and concurrent requests.
- [ ] Establish abuse protection, audit, privacy consent and retention policy for prompts and cached results.

No real inference API calls, new secrets, live database migration or hosting changes are part of this patch.

## Migration 0042: atomic quota reservation contract

- `ai_reserve_run` validates a request and atomically reserves the estimated provider upper-bound tokens while claiming **both** the cookie and hashed-IP daily slots; budget includes all settled `ai_usage` global token records plus all still-pending reservations in the month, across features.
- `ai_settle_run` is idempotent. On successful model response it records reported token use, never above the reservation; on unknown provider failure the app charges the **full reserve** conservatively. Failure to settle leaves a pending reservation counted against the budget.
- Only the Supabase **service role** can call either function. A model-backed request without a persistent DB and migration 0042 fails closed; anonymous clients have no direct RPC access.
- There is deliberately **no automatic expiry/cleanup of pending reservations**. A server crash creates an unresolved pending reserve that must be investigated and reconciled before release. This can reduce availability, rather than expose a budget overspend.
- A conservative estimate `input UTF-8 bytes + 256 overhead + max output tokens` is used before calling a model. **This is not a vendor billing guarantee.** Verify the chosen provider's system prompt, tokenizer, API's maximum output cap, currency costs and retries before any paid inference.
- CI migration runner uses isolated PGlite for schema, daily quota, monthly pending budget, duplicate settle and over-reserve rejection tests. A real Supabase staging concurrency stress test remains required.

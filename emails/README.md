# Transactional emails

In-app notifications and their content live in `lib/notify.ts` and `emails/templates.ts`. A real email adapter is now available under `lib/providers/email/resend.ts`, but it is intentionally **disabled** until configured.

To opt in, create a Resend account, verify your sending domain, and set **server-only** environment variables:

- `EMAIL_PROVIDER=resend`
- `RESEND_API_KEY` (a real `re_...` key)
- `EMAIL_FROM=SellOnBay <notifications@your-verified-domain.com>`

No key or incomplete configuration leaves email in simulation/unavailable mode and flags the launch checker. Resend API errors, timeouts and malformed responses are treated as failure, never delivery success. The provider uses an idempotency key derived from the persisted in-app notification ID (Resend's key protection lasts 24 hours). The app never logs recipients, token values or provider payloads.

**Important:** `notify()` returns true when an in-app record is stored, not when email was delivered. An email API failure does not roll back that in-app notification. A durable retry queue and delivery-status audit **are not implemented yet**. Staging tests must send an actual email to a permitted mailbox and verify delivery before live use. The sender domain must be verified by the provider; a syntactically valid `EMAIL_FROM` value is not evidence of verification.

Provider reference: https://resend.com/docs/api-reference/emails/send-email

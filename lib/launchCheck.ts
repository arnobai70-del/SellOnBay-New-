import 'server-only';
import { emailProvider } from './providers/email';
import { paymentProvider } from './providers/payment';
import { domainProvider, isLiveRegistrar } from './providers/domain';
import { getSettings } from './settings';
import { supabaseConfigured } from './supabase/env';
import { hasNonTestTurnstileKeys } from './bot/turnstile';
import { aiProvider } from './providers/ai';
import { allowedAiBudget } from './ai/budget';
import { isStale, lastBeat } from './heartbeat';
import { sharedLimitsConfigured } from './rateLimit';
import { webhookConfigured } from './monitor';
import { emailConfirmationOn } from './authSettings';
import { derivedSecret } from './secrets';

/*
 * What is still missing before the live site is safe, read from the running server (keys are never shown, only whether they are set).
 * 'todo' must be done before real buyers come, 'warn' is a known gap the owner has chosen to live with for now, 'ok' is done.
 */
export type Check = { name: string; state: 'ok' | 'todo' | 'warn'; note: string };
const set = (k: string, min = 1) => (process.env[k] ?? '').length >= min;

export async function launchChecks(): Promise<Check[]> {
  const s = await getSettings();
  const confirm = await emailConfirmationOn();
  const ipSource = Boolean(process.env.CLIENT_IP_HEADER?.trim()) || Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? '', 10) > 0;
  const [orders, payouts] = await Promise.all([lastBeat('orders'), lastBeat('payouts')]);
  const when = (t: number | null) => (t === null ? 'never yet' : new Date(t).toISOString().replace('T', ' ').slice(0, 16) + ' UTC');
  const late = (job: 'orders' | 'payouts', t: number | null) => (isStale(job, t) ? ' (late)' : '');
  const jobsOk = set('CRON_SECRET', 32) && orders !== null && !isStale('orders', orders) && !isStale('payouts', payouts);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  const c = (name: string, ok: boolean, note: string, otherwise: 'todo' | 'warn' = 'todo'): Check => ({ name, state: ok ? 'ok' : otherwise, note });
  return [
    c(
      'Site address',
      /^https:\/\//.test(site) || process.env.NODE_ENV === 'production',
      site ? `NEXT_PUBLIC_SITE_URL is ${site}` : 'NEXT_PUBLIC_SITE_URL is not set: the live site uses https://sellonbay.com. Set it only if your address is different.',
    ),
    c('Database', supabaseConfigured && set('SUPABASE_SERVICE_ROLE_KEY'), 'Supabase URL, anon key and service key are set, and demo mode is off.'),
    c(
      'Download link key',
      set('DELIVERY_SECRET', 32) || set('SUPABASE_SERVICE_ROLE_KEY'),
      'Download links are signed with a key made from the Supabase service key. Set DELIVERY_SECRET only if you want your own.',
    ),
    c('Payment webhook key', derivedSecret('PAYMENT_WEBHOOK_SECRET') !== null, 'Made from the Supabase service key. Set PAYMENT_WEBHOOK_SECRET only if you want your own.'),
    c(
      'Scheduled jobs',
      jobsOk,
      `CRON_SECRET, and a scheduler calling POST /api/cron/orders every 5 to 10 minutes and /api/cron/payouts on Sundays. Orders job last finished: ${when(orders)}${late('orders', orders)}. Payout job last finished: ${when(payouts)}${late('payouts', payouts)}.`,
    ),
    c('Abuse hashing salt', derivedSecret('GUARD_SALT') !== null, 'Made from the Supabase service key. Set GUARD_SALT only if you want your own; changing it later forgets blocks.'),
    c(
      'Shared rate limits (Redis)',
      sharedLimitsConfigured() && set('UPSTASH_REDIS_REST_TOKEN'),
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN: needed once the site runs as two or more copies (blue-green, load balancer). Without them each copy counts limits on its own.',
      'warn',
    ),
    c(
      'Email confirmation',
      confirm === true,
      confirm === null
        ? 'Could not read the Supabase auth settings. Turn on Authentication > Providers > Email > Confirm email so fake addresses cannot open accounts.'
        : 'Supabase Authentication > Providers > Email > Confirm email: new accounts must confirm their address before they sign in.',
    ),
    c(
      'Visitor address',
      ipSource,
      'Set CLIENT_IP_HEADER=cf-connecting-ip behind Cloudflare, or TRUSTED_PROXY_HOPS to the number of proxies. Without it a visitor can fake their address and slip past rate limits.',
      'warn',
    ),
    c(
      'Error alerts',
      webhookConfigured() && set('ERROR_WEBHOOK_URL', 12),
      'ERROR_WEBHOOK_URL: an https webhook (Slack, Discord or a monitoring service) gets each kind of server error at most once a minute. Without it errors are only in the server log.',
      'warn',
    ),
    c(
      'Bot check (Turnstile)',
      hasNonTestTurnstileKeys(),
      'Optional. Cloudflare Turnstile (a real site key and secret) adds a bot check on sign-up and sign-in; without it the other limits still apply.',
      'warn',
    ),
    c('Examples cannot be bought', process.env.EXAMPLE_ORDERS !== '1', 'EXAMPLE_ORDERS must not be set on the live site.'),
    c(
      'Payments',
      paymentProvider().name !== 'fake',
      'Only the test gateway exists (test cards, no real money). Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET (and PAYPAL_ENV=live for real money) before the market opens.',
    ),
    c(
      'PayPal webhook',
      paymentProvider().name !== 'paypal' || set('PAYPAL_WEBHOOK_ID'),
      'PAYPAL_WEBHOOK_ID: the id of the webhook you made in PayPal (address /api/webhooks/payment). Without it refunds and payments seen only by webhook are not recorded.',
    ),
    c('PayPal is live', paymentProvider().name !== 'paypal' || process.env.PAYPAL_ENV === 'live', 'PAYPAL_ENV is not live, so PayPal runs in sandbox: no real money moves.', 'warn'),
    c(
      'Email',
      emailProvider().name === 'resend',
      'Optional. A RESEND_API_KEY turns real email on (the sender defaults to noreply@your domain, which must be verified in Resend; EMAIL_FROM changes it). Configuration is not proof of delivery: send and confirm a staging email.',
      'warn',
    ),
    c(
      'Domain registrar',
      isLiveRegistrar(domainProvider()),
      'A verified registrar is required for real domain search, registration, renewal and customer ownership. Demo results are not real availability.',
    ),
    c(
      'AI model',
      !['local', 'fake'].includes(aiProvider().name),
      'Only predefined site-ideas templates are currently connected. A real AI provider and staging cost validation are still required for model-backed features.',
      'warn',
    ),
    c('AI monthly budget', allowedAiBudget(Number(process.env.AI_MONTHLY_TOKEN_BUDGET ?? 2_000_000)), 'AI_MONTHLY_TOKEN_BUDGET must be a positive integer. Zero is the emergency OFF switch.', 'warn'),
    c('Example listings', !s.showExamples, s.showExamples ? 'Shown, marked Example and not for sale (a test server). They are always hidden on a live site.' : 'Hidden.', 'warn'),
  ];
}

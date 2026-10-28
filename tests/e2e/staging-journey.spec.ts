import { createHmac } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/*
 * SellOnBay 2.0 staging journey, against a LOCAL app server running with SITE_STAGE=staging and the staging Supabase project only
 * (occketfmjwciilzuddkv). Synthetic accounts from scripts/staging-fixtures.mjs; TOTP is enrolled for sellers and admins here and the secret
 * is kept outside the repository (~/.sob-staging/totp/). Every step goes through the app's own API with real sessions.
 * Runs only with STAGING_JOURNEY=1. Secrets come from the environment and are never printed.
 */
const ON = process.env.STAGING_JOURNEY === '1';
const REF = 'occketfmjwciilzuddkv';
const SUPA = `https://${REF}.supabase.co`;
const BASE = process.env.STAGING_APP_URL ?? 'http://localhost:3010';
const ANON = process.env.STAGING_SUPABASE_ANON_KEY ?? '';
const SERVICE = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY ?? '';
const PASS = process.env.STAGING_FIXTURE_PASSWORD ?? '';
const [AUTH_USER, AUTH_PASS] = (process.env.STAGING_BASIC_AUTH ?? ':').split(':');
const TOTP_DIR = join(homedir(), '.sob-staging', 'totp');

test.use({ httpCredentials: { username: AUTH_USER, password: AUTH_PASS } });
test.describe.configure({ mode: 'serial', timeout: 300_000 }); // every step is several round trips to the staging project

/* RFC 6238 TOTP (SHA-1, 30 s, 6 digits). */
function totp(secret: string, at = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of secret.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

type Actor = { email: string; id: string; page: Page; ctx: BrowserContext };
const admin = () => createClient(SUPA, SERVICE, { auth: { persistSession: false } });

/* Signs in through Supabase, passes TOTP where the role needs it, and puts the session cookies into a new browser context. */
async function signIn(browser: import('@playwright/test').Browser, email: string, mfa: boolean): Promise<Actor> {
  const sb: SupabaseClient = createClient(SUPA, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await sb.auth.signInWithPassword({ email, password: PASS });
  if (s.error || !s.data.session) throw new Error(`${email}: sign-in failed`);
  if (mfa) {
    mkdirSync(TOTP_DIR, { recursive: true });
    const file = join(TOTP_DIR, email.replace(/[^a-z0-9.@-]/gi, '_'));
    const factors = (await sb.auth.mfa.listFactors()).data;
    let verified = factors?.totp?.find((f) => f.status === 'verified');
    if (!verified || !existsSync(file)) {
      for (const f of factors?.all ?? []) if (f.factor_type === 'totp') await sb.auth.mfa.unenroll({ factorId: f.id });
      const e = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'staging-test' });
      if (e.error) throw new Error(`${email}: enrol failed`);
      writeFileSync(file, e.data.totp.secret, { mode: 0o600 });
      const v = await sb.auth.mfa.challengeAndVerify({ factorId: e.data.id, code: totp(e.data.totp.secret) });
      if (v.error) throw new Error(`${email}: first TOTP failed`);
      verified = { id: e.data.id } as never;
    } else {
      const v = await sb.auth.mfa.challengeAndVerify({ factorId: verified.id, code: totp(readFileSync(file, 'utf8').trim()) });
      if (v.error) throw new Error(`${email}: TOTP failed`);
    }
  }
  const session = (await sb.auth.getSession()).data.session!;
  const jar: { name: string; value: string }[] = [];
  const ssr = createServerClient(SUPA, ANON, { cookies: { getAll: () => [], setAll: (c) => void jar.push(...c.map(({ name, value }) => ({ name, value }))) } });
  await ssr.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  const ctx = await browser.newContext({ httpCredentials: { username: AUTH_USER, password: AUTH_PASS } });
  const host = new URL(BASE).hostname;
  await ctx.addCookies(jar.map((c) => ({ ...c, domain: host, path: '/', httpOnly: false, secure: false, sameSite: 'Lax' as const })));
  const page = await ctx.newPage();
  await page.goto(BASE + '/login');
  return { email, id: session.user.id, page, ctx };
}

/* A request from inside the page: same origin, the person's cookies, the staging password. */
async function api(a: Actor, path: string, init: { method?: string; json?: unknown; form?: Record<string, string> } = {}) {
  return a.page.evaluate(
    async ({ path, init }) => {
      const body = init.form ? Object.entries(init.form).reduce((f, [k, v]) => (f.append(k, v), f), new FormData()) : init.json !== undefined ? JSON.stringify(init.json) : undefined;
      const r = await fetch(path, { method: init.method ?? (body ? 'POST' : 'GET'), headers: init.json !== undefined ? { 'content-type': 'application/json' } : undefined, body });
      const text = await r.text();
      let j: unknown = null;
      try {
        j = JSON.parse(text);
      } catch {
        j = { raw: text.slice(0, 80) };
      }
      return { status: r.status, body: j as Record<string, unknown>, type: r.headers.get('content-type') ?? '' };
    },
    { path, init },
  );
}

test.describe('staging journey (custom development)', () => {
  test.skip(!ON, 'set STAGING_JOURNEY=1 with the staging environment');
  const stamp = new Date().toISOString().slice(0, 16);
  const today = new Date().toISOString().slice(0, 10);
  const A: Record<string, Actor> = {};
  const S: { request?: string; quote?: string; order?: string; method?: string; attempt?: string; ticket?: string } = {};

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300_000);
    if (!ANON || !SERVICE || PASS.length < 16 || !AUTH_PASS) throw new Error('staging environment missing');
    for (const [k, email, mfa] of [
      ['buyer', 'buyer1@example.test', false],
      ['buyer2', 'buyer2@example.test', false],
      ['seller', 'seller1@example.test', true],
      ['seller2', 'seller2@example.test', true],
      ['super', 'super@example.test', true],
      ['finance', 'finance@example.test', true],
      ['support', 'support@example.test', true],
      ['delivery', 'delivery@example.test', true],
      ['content', 'content@example.test', true],
    ] as const)
      A[k] = await signIn(browser, email, mfa);
    // An earlier run may have left buyer1's synthetic request open (one open request per buyer): close it the way an admin would.
    const open = await admin().from('purchase_requests').select('id').eq('buyer_id', A.buyer.id).in('status', ['submitted', 'under_review', 'needs_info', 'requirements_verified', 'quoted']);
    for (const { id } of open.data ?? []) {
      const qs = await admin().from('quotations').select('id').eq('request_id', id).in('status', ['draft', 'pending_super', 'issued']);
      for (const q of qs.data ?? []) await api(A.support, `/api/admin/quotations/${q.id}`, { json: { action: 'withdraw', reason: 'Closing an earlier staging run.' } });
      await api(A.support, `/api/admin/requests/${id}`, { json: { action: 'decline', note: 'Closing an earlier staging run.' } });
    }
  });
  test.afterAll(async () => {
    for (const a of Object.values(A)) await a.ctx.close();
  });

  test('1-6 request, assignment, written requirements, quotation with Super approval, acceptance creates the order', async () => {
    const r = await api(A.buyer, '/api/requests', {
      json: {
        kind: 'custom_dev',
        licenceTier: 'single_project',
        package: 'custom',
        intendedUse: 'Staging journey: a booking site for a test clinic.',
        requirements: 'A booking page with staff calendars, reminders and an admin page for opening hours. Synthetic staging test only.',
        consent: true,
      },
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    S.request = r.body.id as string;
    expect((await api(A.content, `/api/admin/requests/${S.request}`, { json: { action: 'review' } })).status).toBe(403); // Content has no purchase permission
    expect((await api(A.support, `/api/admin/requests/${S.request}`, { json: { action: 'assign', sellerId: A.seller.id } })).status).toBe(200);
    expect((await api(A.support, `/api/admin/requests/${S.request}`, { json: { action: 'review' } })).status).toBe(200);
    const reqs = 'Booking page with 15-minute slots for three staff calendars; reminder 24 hours before; admin page to set opening hours. Synthetic staging test.';
    expect((await api(A.support, `/api/admin/requests/${S.request}`, { json: { action: 'propose_requirements', requirements: reqs } })).status).toBe(200);
    expect((await api(A.buyer2, `/api/requests/${S.request}`, { json: { action: 'confirm_requirements' } })).status).toBe(404); // not their request
    expect((await api(A.buyer, `/api/requests/${S.request}`, { json: { action: 'confirm_requirements' } })).status).toBe(200);
    const d = await api(A.support, `/api/admin/requests/${S.request}`, {
      json: { action: 'draft_quote', lines: [{ label: 'Booking site build', cents: 20_000, kind: 'custom' }], terms: { deliveryDays: 5 }, overrideReason: 'Custom job, no listed price.' },
    });
    expect(d.status, JSON.stringify(d.body)).toBe(200);
    const q = await admin().from('quotations').select('id, status, seller_id, commission_bps, fee_cents, owner_type').eq('request_id', S.request).single();
    expect(q.data).toMatchObject({ status: 'draft', seller_id: A.seller.id, owner_type: 'seller', commission_bps: 1500, fee_cents: 3000 }); // Free plan 15%
    S.quote = q.data!.id;
    expect((await api(A.support, `/api/admin/quotations/${S.quote}`, { json: { action: 'issue' } })).status).toBe(200);
    expect((await api(A.buyer, `/api/quotations/${S.quote}`, { json: { action: 'accept' } })).status).not.toBe(200); // still waiting for Super
    expect((await api(A.support, `/api/admin/quotations/${S.quote}`, { json: { action: 'approve_override', reason: 'Staging test price.' } })).status).toBe(403);
    expect((await api(A.super, `/api/admin/quotations/${S.quote}`, { json: { action: 'approve_override', reason: 'Staging test price.' } })).status).toBe(200);
    expect((await api(A.buyer2, `/api/quotations/${S.quote}`, { json: { action: 'accept' } })).status).toBe(404);
    const acc = await api(A.buyer, `/api/quotations/${S.quote}`, { json: { action: 'accept' } });
    expect(acc.status, JSON.stringify(acc.body)).toBe(200);
    S.order = (acc.body.orderId ?? acc.body.order) as string;
    const again = await api(A.buyer, `/api/quotations/${S.quote}`, { json: { action: 'accept' } });
    expect((again.body.orderId ?? again.body.order) as string).toBe(S.order); // accepting twice gives the same order
    const o = await admin().from('orders').select('status, quotation_id, seller_id, buyer_id, price_cents').eq('id', S.order).single();
    expect(o.data).toMatchObject({ status: 'awaiting_payment', quotation_id: S.quote, seller_id: A.seller.id, buyer_id: A.buyer.id, price_cents: 20_000 });
  });

  test('5 simulated payment: the buyer reports it, Finance reconciles it, the order is funded once', async () => {
    const m = await api(A.finance, '/api/admin/payments/methods', {
      json: { kind: 'bank_transfer', label: `Staging test bank ${stamp}`, instructions: 'SYNTHETIC: no real account. Staging test only.', active: true, reason: 'Staging journey test.' },
    });
    expect(m.status, JSON.stringify(m.body)).toBe(200);
    S.method = (await admin().from('payment_methods').select('id').eq('label', `Staging test bank ${stamp}`).single()).data!.id;
    const ref = `STG-${Date.now()}`;
    expect((await api(A.buyer2, `/api/orders/${S.order}/payments`, { form: { methodId: S.method!, reference: ref, amountCents: '20000', paidOn: today } })).status).toBe(404);
    const p = await api(A.buyer, `/api/orders/${S.order}/payments`, { form: { methodId: S.method!, reference: ref, amountCents: '20000', paidOn: today } });
    expect(p.status, JSON.stringify(p.body)).toBe(200);
    expect((await api(A.buyer, `/api/orders/${S.order}/payments`, { form: { methodId: S.method!, reference: ref, amountCents: '20000', paidOn: today } })).status).not.toBe(200); // a reference is used once
    S.attempt = (await admin().from('payment_attempts').select('id').eq('order_id', S.order).eq('reference', ref).single()).data!.id;
    expect((await api(A.support, `/api/admin/payments/${S.attempt}`, { json: { action: 'reconcile', amountReceived: 200, statementRef: 'STMT-SYNTH', receivedOn: today } })).status).toBe(403);
    const rc = await api(A.finance, `/api/admin/payments/${S.attempt}`, { json: { action: 'reconcile', amountReceived: 200, statementRef: 'STMT-SYNTH', receivedOn: today } });
    expect(rc.status, JSON.stringify(rc.body)).toBe(200);
    expect(rc.body.funded).toBe(true);
    const o = await admin().from('orders').select('status, funded_at').eq('id', S.order).single();
    expect(o.data?.funded_at).toBeTruthy();
  });

  test('6-7 release: Delivery authorises the work; nothing reaches the buyer without an approved file (scanner B-3 fails closed)', async () => {
    expect((await api(A.support, `/api/admin/releases/${S.order}`, { json: { action: 'authorise' } })).status).toBe(403);
    // buyer1 is a new account paying $200: the order waits for a safety check, and nothing starts until Finance clears it
    const hold = await admin().from('order_holds').select('reason').eq('order_id', S.order).is('decided_at', null).maybeSingle();
    if (hold.data) {
      expect((await api(A.delivery, `/api/admin/releases/${S.order}`, { json: { action: 'authorise' } })).status).toBe(409);
      expect((await api(A.seller2, `/api/seller/orders/${S.order}/delivery`, { json: { note: 'Not my order, should be refused.' } })).status).toBe(404); // the hold is not revealed
      expect((await api(A.support, `/api/admin/risk/holds/${S.order}/decide`, { json: { decision: 'release', note: 'Staging test.' } })).status).toBe(403);
      expect((await api(A.finance, `/api/admin/risk/holds/${S.order}/decide`, { json: { decision: 'release', note: 'Synthetic staging buyer, checked.' } })).status).toBe(200);
    }
    const au = await api(A.delivery, `/api/admin/releases/${S.order}`, { json: { action: 'authorise' } });
    expect(au.status, JSON.stringify(au.body)).toBe(200);
    expect((await api(A.seller2, `/api/seller/orders/${S.order}/delivery`, { json: { note: 'Not my order, should be refused.' } })).status).toBe(404);
    const del = await api(A.seller, `/api/seller/orders/${S.order}/delivery`, { json: { note: 'The booking site is ready for the buyer.' } });
    expect(del.status).toBe(400); // no approved delivery file can exist: there is no approved scanner (B-3)
    expect((await api(A.delivery, `/api/admin/releases/${S.order}`, { json: { action: 'approve', note: 'try' } })).status).not.toBe(200); // not release_pending
    const ent = await admin().from('entitlements').select('id').eq('order_id', S.order);
    expect(ent.data ?? []).toHaveLength(0);
    expect((await api(A.buyer, `/api/orders/${S.order}/source?json=1`)).status).not.toBe(200);
  });

  test('8-9 messages: each side sees only its own channel; internal notes stay with admins', async () => {
    expect((await api(A.buyer, `/api/conversations/order/${S.order}`, { json: { channel: 'buyer_admin', body: 'When will my booking site be ready?' } })).status).toBe(200);
    expect((await api(A.buyer, `/api/conversations/order/${S.order}`, { json: { channel: 'admin_seller', body: 'Hi seller' } })).status).toBe(404);
    expect((await api(A.buyer, `/api/conversations/order/${S.order}`, { json: { channel: 'buyer_admin', body: 'mail me at jo@gmail.com' } })).status).toBe(422);
    expect((await api(A.support, `/api/conversations/order/${S.order}`, { json: { channel: 'admin_seller', body: 'The buyer asks about timing.' } })).status).toBe(200);
    expect((await api(A.seller, `/api/conversations/order/${S.order}`, { json: { channel: 'admin_seller', body: 'Ready in two days.' } })).status).toBe(200);
    expect((await api(A.support, `/api/conversations/order/${S.order}`, { json: { channel: 'internal', body: 'Seller is usually on time.' } })).status).toBe(200);
    const b = await api(A.buyer, `/api/conversations/order/${S.order}`);
    const s = await api(A.seller, `/api/conversations/order/${S.order}`);
    const chans = (r: typeof b) => [...new Set(((r.body.messages as { channel: string }[]) ?? []).map((m) => m.channel))].sort();
    expect(chans(b)).toEqual(['buyer_admin']);
    expect(chans(s)).toEqual(['admin_seller']);
    expect(chans(await api(A.support, `/api/conversations/order/${S.order}`))).toEqual(['admin_seller', 'buyer_admin', 'internal']);
    expect((await api(A.buyer2, `/api/conversations/order/${S.order}`)).status).toBe(404);
    expect((await api(A.seller2, `/api/conversations/order/${S.order}`)).status).toBe(404);
    expect((await api(A.content, `/api/conversations/order/${S.order}`)).status).toBe(404);
  });

  test('10 support ticket: only its opener and Support see it', async () => {
    const t = await api(A.buyer, '/api/tickets', { json: { subject: 'Question about my order', body: 'Can the reminder be sent by SMS as well?', orderId: S.order } });
    expect(t.status, JSON.stringify(t.body)).toBe(200);
    S.ticket = t.body.id as string;
    expect((await api(A.buyer2, '/api/tickets', { json: { subject: 'Not my order', body: 'Trying to attach to another order.', orderId: S.order } })).status).toBe(404);
    expect((await api(A.buyer2, `/api/conversations/ticket/${S.ticket}`)).status).toBe(404);
    expect((await api(A.seller, `/api/conversations/ticket/${S.ticket}`)).status).toBe(404);
    expect((await api(A.support, `/api/conversations/ticket/${S.ticket}`, { json: { channel: 'buyer_admin', body: 'Yes, we will ask the developer.' } })).status).toBe(200);
    expect((await api(A.buyer, '/api/tickets', { json: { subject: 'WhatsApp me please', body: 'Where is it?' } })).status).toBe(422);
  });

  test('11 revisions need a released order (blocked by B-3 here); custom development flow covered above', async () => {
    const r = await api(A.buyer, `/api/orders/${S.order}/revisions`, { json: { description: 'Please change the header colour to dark blue.', hint: 'change', consent: true } });
    expect(r.status).toBe(409); // not delivered: nothing was released
  });

  test('12 sales PDFs: Finance all sales, sellers their own, nobody else downloads; files logged', async () => {
    const flag = (on: boolean) => api(A.super, '/api/admin/flags', { json: { key: 'reports.sales_pdf', on, reason: 'Staging journey test.' } });
    await flag(true);
    try {
      expect((await api(A.support, '/api/admin/reports/sales', { json: {} })).status).toBe(403);
      const f = await api(A.finance, '/api/admin/reports/sales', { json: {} });
      expect(f.status, JSON.stringify(f.body)).toBe(200);
      const file = (f.body.files as { id: string; rows: number }[])[0];
      expect(file.rows).toBeGreaterThanOrEqual(1);
      const dl = await api(A.finance, `/api/reports/${file.id}`);
      expect(dl.status).toBe(200);
      expect(dl.type).toContain('application/pdf');
      expect((await api(A.seller, `/api/reports/${file.id}`)).status).toBe(404);
      const s = await api(A.seller, '/api/seller/reports/sales', { json: { sellerId: A.seller2.id } });
      expect(s.status, JSON.stringify(s.body)).toBe(200);
      const sold = async (id: string) => (await admin().from('orders').select('id', { count: 'exact', head: true }).eq('seller_id', id).not('funded_at', 'is', null)).count ?? -1;
      const mine = await sold(A.seller.id);
      expect(mine).toBeGreaterThanOrEqual(1);
      expect((s.body.files as { rows: number }[])[0].rows).toBe(mine); // only seller1's own sales, whatever was asked
      const s2 = await api(A.seller2, '/api/seller/reports/sales', { json: {} });
      expect((s2.body.files as { rows: number }[])[0].rows).toBe(await sold(A.seller2.id));
      const log = await admin().from('report_exports').select('id, scope, row_count, file_sha256').eq('id', file.id).single();
      expect(log.data).toMatchObject({ scope: 'admin' });
    } finally {
      await flag(false);
    }
  });

  test('audit trail: the sensitive admin steps were written to the audit log', async () => {
    const { data } = await admin().from('audit_log').select('action').in('target_ref', [S.request!, S.quote!, S.order!, S.attempt!]);
    const actions = new Set((data ?? []).map((r) => r.action));
    const want = [
      'request_assigned',
      'requirements_proposed',
      'quotation_drafted',
      'quotation_sent_to_super',
      'quotation_override_approve',
      'quotation_issued',
      'payment_reconciled',
      'work_authorised',
    ];
    expect(want.filter((a) => !actions.has(a))).toEqual([]);
  });
});

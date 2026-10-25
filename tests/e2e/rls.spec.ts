import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/*
 * Row Level Security and grants, tried as the wrong person. Each forbidden action is attempted with a real signed-in client (anon key, no service role)
 * and must be refused: an error, or no rows. Runs against the real database from .env.local; skipped until migrations 0015 to 0017 are applied.
 */
const envFile = path.join(__dirname, '..', '..', '.env.local');
const env: Record<string, string> = fs.existsSync(envFile)
  ? Object.fromEntries(
      fs
        .readFileSync(envFile, 'utf8')
        .split(/\r?\n/)
        .filter((l) => l.includes('='))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
    )
  : {};
const PASS = 'Qa-test-pass-123';
const strictStaging = process.env.CI_STAGING_STRICT === '1';
if (strictStaging && (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY)) {
  throw new Error('The staging RLS suite needs an isolated Supabase URL, anon key and service-role key.');
}

/* Refused means an error, or nothing came back. */
const refused = (r: { data: unknown; error: unknown }) => !!r.error || r.data == null || (Array.isArray(r.data) && r.data.length === 0);

test.describe('RLS: the wrong person is always refused', () => {
  test.skip(!env.SUPABASE_SERVICE_ROLE_KEY, 'needs .env.local with Supabase keys');
  const url = env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'unset';
  const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY || 'unset', { auth: { persistSession: false } });
  const stamp = Date.now();
  const users: Record<'buyer' | 'seller' | 'other', { id: string; db: SupabaseClient }> = {} as never;
  let anon: SupabaseClient;
  let orderId = '';
  let ready = false;
  const userIds: string[] = [];

  const person = async (name: string) => {
    const email = `qa-rls-${name}-${stamp}@launchbay.test`;
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true });
    if (error) throw error;
    userIds.push(data.user.id);
    const db = createClient(url, anonKey, { auth: { persistSession: false } });
    const s = await db.auth.signInWithPassword({ email, password: PASS });
    if (s.error) throw s.error;
    return { id: data.user.id, db };
  };

  test.beforeAll(async () => {
    const probes = await Promise.all([
      admin.from('orders').select('lines').limit(1),
      admin.from('ledger_entries').select('id').limit(1),
      admin.from('certificates').select('order_id').limit(1),
      admin.from('webhook_events').select('event_id').limit(1),
    ]);
    ready = probes.every((p) => !p.error);
    if (!ready) {
      if (strictStaging) throw new Error('Staging migrations are incomplete. RLS tests must FAIL, not silently skip.');
      return;
    }
    anon = createClient(url, anonKey, { auth: { persistSession: false } });
    users.buyer = await person('buyer');
    users.seller = await person('seller');
    users.other = await person('other');
    await admin.from('profiles').update({ role: 'seller' }).eq('id', users.seller.id);
    const o = await admin
      .from('orders')
      .insert({ buyer_id: users.buyer.id, seller_id: users.seller.id, kind: 'product', status: 'accepted', price_cents: 5000, fee_cents: 750, title: 'RLS order', lines: [['Site', 5000]], demo: true })
      .select('id')
      .single();
    orderId = o.data!.id as string;
    await admin.from('order_events').insert({ order_id: orderId, event: 'created', to_state: 'awaiting_payment' });
    await admin.from('messages').insert({ order_id: orderId, sender_id: users.buyer.id, body: 'private chat' });
    await admin.from('change_requests').insert({ order_id: orderId, seller_id: users.seller.id, title: 'Extra', price_cents: 1000, extra_days: 1 });
    await admin.rpc('ledger_post', {
      p_key: `rls:${orderId}`,
      p_order: orderId,
      p_memo: 'rls',
      p_lines: [
        { account: 'platform_cash', amountCents: 100, side: 'debit' },
        { account: `order_escrow:${orderId}`, amountCents: 100, side: 'credit' },
      ],
    });
  });
  test.afterAll(async () => {
    if (orderId) {
      await admin.from('disputes').delete().eq('order_id', orderId);
      await admin.from('orders').delete().eq('id', orderId);
    }
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
  });
  test.beforeEach(() => test.skip(!ready, 'migrations 0015 to 0017 are not applied yet'));

  test('orders: the buyer and the seller see their order, nobody else does', async () => {
    expect((await users.buyer.db.from('orders').select('id').eq('id', orderId)).data).toHaveLength(1);
    expect((await users.seller.db.from('orders').select('id').eq('id', orderId)).data).toHaveLength(1);
    expect(refused(await users.other.db.from('orders').select('id').eq('id', orderId))).toBe(true);
    expect(refused(await anon.from('orders').select('id').eq('id', orderId))).toBe(true);
  });
  test('orders: no client can create, change or delete one, not even the buyer or the seller', async () => {
    for (const who of [users.buyer, users.seller, users.other]) {
      expect((await who.db.from('orders').insert({ buyer_id: who.id, seller_id: users.seller.id, price_cents: 1, fee_cents: 0 })).error).toBeTruthy();
      expect(refused(await who.db.from('orders').update({ status: 'paid_out' }).eq('id', orderId).select('id'))).toBe(true);
      expect(refused(await who.db.from('orders').delete().eq('id', orderId).select('id'))).toBe(true);
    }
    expect((await admin.from('orders').select('status').eq('id', orderId).single()).data?.status).toBe('accepted');
  });
  test('the order history: parties read it, others do not, and nobody writes to it from a client', async () => {
    expect((await users.buyer.db.from('order_events').select('id').eq('order_id', orderId)).data!.length).toBeGreaterThan(0);
    expect(refused(await users.other.db.from('order_events').select('id').eq('order_id', orderId))).toBe(true);
    for (const who of [users.buyer, users.seller, users.other]) {
      expect((await who.db.from('order_events').insert({ order_id: orderId, event: 'forged' })).error).toBeTruthy();
      expect(refused(await who.db.from('order_events').update({ event: 'edited' }).eq('order_id', orderId).select('id'))).toBe(true);
      expect(refused(await who.db.from('order_events').delete().eq('order_id', orderId).select('id'))).toBe(true);
    }
    expect((await admin.from('order_events').select('event').eq('order_id', orderId)).data?.map((e) => e.event)).toEqual(['created']);
  });
  test('messages: only the two parties read them, and nobody inserts directly from a client', async () => {
    expect((await users.seller.db.from('messages').select('id').eq('order_id', orderId)).data).toHaveLength(1);
    expect(refused(await users.other.db.from('messages').select('id').eq('order_id', orderId))).toBe(true);
    expect(refused(await anon.from('messages').select('id').eq('order_id', orderId))).toBe(true);
    for (const who of [users.buyer, users.other]) expect((await who.db.from('messages').insert({ order_id: orderId, sender_id: who.id, body: 'sneaky' })).error).toBeTruthy();
  });
  test('extra work requests: only the parties read them; nobody creates or funds one from a client', async () => {
    expect((await users.buyer.db.from('change_requests').select('id').eq('order_id', orderId)).data).toHaveLength(1);
    expect(refused(await users.other.db.from('change_requests').select('id').eq('order_id', orderId))).toBe(true);
    for (const who of [users.buyer, users.seller, users.other]) {
      expect((await who.db.from('change_requests').insert({ order_id: orderId, seller_id: who.id, title: 'x', price_cents: 1000, extra_days: 1 })).error).toBeTruthy();
      expect(refused(await who.db.from('change_requests').update({ status: 'funded' }).eq('order_id', orderId).select('id'))).toBe(true);
    }
  });
  test('money tables are closed to every client: ledger, certificates, webhook events, download log, licences, payouts', async () => {
    for (const table of ['ledger_entries', 'certificates', 'webhook_events', 'ledger_accounts', 'download_events', 'licenses', 'payouts']) {
      for (const who of [users.buyer.db, users.seller.db, users.other.db, anon]) {
        expect(refused(await who.from(table).select('*').limit(5)), `${table} read`).toBe(true);
        expect((await who.from(table).insert({} as never)).error, `${table} insert`).toBeTruthy();
      }
    }
    expect(refused(await users.buyer.db.from('ledger_balances').select('*').limit(5))).toBe(true);
  });
  test('the money functions cannot be called by a client', async () => {
    for (const who of [users.buyer.db, anon]) {
      expect(
        (
          await who.rpc('ledger_post', {
            p_key: 'hack',
            p_order: orderId,
            p_memo: '',
            p_lines: [
              { account: 'platform_cash', amountCents: 1, side: 'debit' },
              { account: 'seller_available:x', amountCents: 1, side: 'credit' },
            ],
          })
        ).error,
      ).toBeTruthy();
      expect((await who.rpc('order_apply', { p_order: orderId, p_from: 'accepted', p_patch: { status: 'paid_out' }, p_event: { event: 'hack', at: new Date().toISOString() } })).error).toBeTruthy();
    }
    expect((await admin.from('orders').select('status').eq('id', orderId).single()).data?.status).toBe('accepted');
    expect((await admin.from('ledger_entries').select('id').eq('entry_id', 'hack')).data).toHaveLength(0);
  });
  test('disputes: no client can open one (the server does, after checking the window); nobody opens one in another name', async () => {
    expect((await users.other.db.from('disputes').insert({ order_id: orderId, opened_by: users.other.id, reason: 'malware', detail: 'x' })).error).toBeTruthy();
    expect((await users.seller.db.from('disputes').insert({ order_id: orderId, opened_by: users.seller.id, reason: 'malware', detail: 'x' })).error).toBeTruthy();
    expect((await users.buyer.db.from('disputes').insert({ order_id: orderId, opened_by: users.other.id, reason: 'malware', detail: 'x' })).error).toBeTruthy(); // in somebody else's name
    expect((await users.buyer.db.from('disputes').insert({ order_id: orderId, opened_by: users.buyer.id, reason: 'malware', detail: 'real problem' })).error).toBeTruthy(); // disputes are opened by the server, which checks the window
    expect(refused(await users.other.db.from('disputes').select('id').eq('order_id', orderId))).toBe(true);
  });
  test('reviews: a buyer who did not buy it, or a review in another name, is refused', async () => {
    const product = await admin
      .from('products')
      .insert({
        slug: `qa-rls-${stamp}`,
        seller_id: users.seller.id,
        name: 'RLS product',
        category: 'Scripts',
        description: 'A test listing for the access rules.',
        price_cents: 5000,
        delivery_days: 1,
        demo_url: 'about:blank',
        code_url: 'https://example.com/x',
        license: 'mine',
        status: 'live',
      })
      .select('id')
      .single();
    const productId = product.data!.id as string;
    try {
      const review = (who: { id: string; db: SupabaseClient }, as: string) => who.db.from('reviews').insert({ order_id: orderId, product_id: productId, buyer_id: as, rating: 5, body: 'great' });
      expect((await review(users.other, users.other.id)).error).toBeTruthy(); // did not buy it
      expect((await review(users.other, users.buyer.id)).error).toBeTruthy(); // in the buyer's name
      expect((await review(users.seller, users.seller.id)).error).toBeTruthy(); // the seller reviewing their own sale
    } finally {
      await admin.from('reviews').delete().eq('order_id', orderId);
      await admin.from('products').delete().eq('id', productId);
    }
  });
  test('profiles: you read only your own, and you cannot make yourself an admin or a seller', async () => {
    expect((await users.buyer.db.from('profiles').select('id').eq('id', users.buyer.id)).data).toHaveLength(1);
    expect(refused(await users.buyer.db.from('profiles').select('id').eq('id', users.seller.id))).toBe(true);
    expect(refused(await users.buyer.db.from('profiles').update({ role: 'admin' }).eq('id', users.buyer.id).select('id'))).toBe(true);
    expect(refused(await users.buyer.db.from('profiles').update({ banned: false, flagged: false, strikes: 0 }).eq('id', users.buyer.id).select('id'))).toBe(true);
    expect((await admin.from('profiles').select('role').eq('id', users.buyer.id).single()).data?.role).toBe('buyer');
  });
  test('products: the private file link is never readable by a client, even by its seller', async () => {
    const p = await admin
      .from('products')
      .insert({
        slug: `qa-rls2-${stamp}`,
        seller_id: users.seller.id,
        name: 'RLS product 2',
        category: 'Scripts',
        description: 'A test listing for the access rules.',
        price_cents: 5000,
        delivery_days: 1,
        demo_url: 'about:blank',
        code_url: 'https://example.com/secret-files',
        license: 'mine',
        status: 'in_review',
      })
      .select('id')
      .single();
    try {
      expect((await users.seller.db.from('products').select('code_url').eq('id', p.data!.id)).error).toBeTruthy();
      expect((await users.buyer.db.from('products').select('code_url').eq('id', p.data!.id)).error).toBeTruthy();
      expect((await anon.from('products').select('code_url').eq('id', p.data!.id)).error).toBeTruthy();
      // an in-review listing is invisible to everyone but its owner
      expect(refused(await users.other.db.from('products').select('id').eq('id', p.data!.id))).toBe(true);
      expect((await users.seller.db.from('products').select('id').eq('id', p.data!.id)).data).toHaveLength(1);
      // listings are written only by the server, which checks role, authenticator code, links and the scan (migration 0043)
      expect((await users.seller.db.from('products').update({ code_url: 'https://example.com/other' }).eq('id', p.data!.id)).error).toBeTruthy();
      const direct = {
        seller_id: users.buyer.id,
        name: 'Direct',
        category: 'Scripts',
        description: 'Written past the server.',
        price_cents: 500,
        delivery_days: 1,
        demo_url: 'about:blank',
        license: 'mine',
        status: 'in_review',
      };
      expect((await users.buyer.db.from('products').insert({ ...direct, slug: `qa-rls3-${stamp}` })).error).toBeTruthy();
    } finally {
      await admin.from('products').delete().eq('id', p.data!.id);
    }
  });
  test('private buckets: no client can list or download from the certificates or demo-file buckets', async () => {
    await admin.storage.from('certificates').upload(`${orderId}-rls.pdf`, new Uint8Array([37, 80, 68, 70]), { contentType: 'application/pdf', upsert: true });
    try {
      for (const bucket of ['certificates', 'demos']) {
        for (const who of [users.buyer.db, users.other.db, anon]) {
          expect(refused(await who.storage.from(bucket).list('')), `${bucket} list`).toBe(true);
          expect((await who.storage.from(bucket).download(`${orderId}-rls.pdf`)).error, `${bucket} download`).toBeTruthy();
          expect((await who.storage.from(bucket).upload(`x-${stamp}.txt`, new Uint8Array([1]))).error, `${bucket} upload`).toBeTruthy();
        }
      }
    } finally {
      await admin.storage.from('certificates').remove([`${orderId}-rls.pdf`]);
    }
  });
  test('notifications are private; strikes and suspensions cannot be written or lifted by the user', async () => {
    await admin.from('notifications').insert({ user_id: users.buyer.id, kind: 'order_funded', payload: {} });
    expect((await users.buyer.db.from('notifications').select('id').eq('user_id', users.buyer.id)).data!.length).toBeGreaterThan(0);
    expect(refused(await users.other.db.from('notifications').select('id').eq('user_id', users.buyer.id))).toBe(true);
    expect((await users.other.db.from('notifications').insert({ user_id: users.buyer.id, kind: 'forged' })).error).toBeTruthy();
    expect(refused(await users.other.db.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', users.buyer.id).select('id'))).toBe(true);
    expect((await users.buyer.db.from('notifications').update({ kind: 'edited' }).eq('user_id', users.buyer.id)).error).toBeTruthy(); // only read_at is writable
    await admin
      .from('profiles')
      .update({ suspended_until: new Date(Date.now() + 86_400_000).toISOString() })
      .eq('id', users.buyer.id);
    expect(refused(await users.buyer.db.from('profiles').update({ suspended_until: null }).eq('id', users.buyer.id).select('id'))).toBe(true);
    expect((await admin.from('profiles').select('suspended_until').eq('id', users.buyer.id).single()).data?.suspended_until).toBeTruthy();
    for (const who of [users.buyer.db, users.other.db, anon]) expect(refused(await who.from('account_actions').select('*').limit(5))).toBe(true);
  });
  test('dispute evidence follows the dispute: parties read it, others do not, and nobody writes it from a client', async () => {
    const d = await admin.from('disputes').select('id').eq('order_id', orderId).limit(1).maybeSingle();
    const disputeId =
      d.data?.id ?? (await admin.from('disputes').insert({ order_id: orderId, opened_by: users.buyer.id, reason: 'other', detail: 'x', status: 'open' }).select('id').single()).data!.id;
    await admin.from('dispute_evidence').insert({ dispute_id: disputeId, author_id: users.buyer.id, text: 'proof' });
    expect((await users.seller.db.from('dispute_evidence').select('id').eq('dispute_id', disputeId)).data!.length).toBeGreaterThan(0);
    expect(refused(await users.other.db.from('dispute_evidence').select('id').eq('dispute_id', disputeId))).toBe(true);
    for (const who of [users.buyer, users.seller, users.other]) expect((await who.db.from('dispute_evidence').insert({ dispute_id: disputeId, author_id: who.id, text: 'forged' })).error).toBeTruthy();
    expect(refused(await users.buyer.db.from('disputes').update({ decision: 'refund_full', status: 'decided' }).eq('id', disputeId).select('id'))).toBe(true);
  });
});

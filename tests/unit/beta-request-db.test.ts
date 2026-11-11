import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { describe, expect, it } from 'vitest';
import { toRow } from '@/lib/orders/store';
import type { Order } from '@/lib/orders/machine';
// @ts-expect-error plain JavaScript module without types
import { forPglite, migrationFiles, STAND_INS } from '../../scripts/lib/pgliteSupabase.mjs';

/*
 * A free beta request saved on a real Postgres with every migration applied (an in-process database, never production): the order row exactly as
 * lib/orders/store.ts writes it, then the beta_requests row exactly as lib/beta/service.ts writes it. A request failed once on the live site
 * (2026-11-07, a QA listing); this proves the schema takes both rows, and that a listing with an hours-based delivery still fits the order checks.
 */
describe('a free beta request is saved', () => {
  it('order + beta_requests rows, as the app writes them', { timeout: 180_000 }, async () => {
    const db = new PGlite({ extensions: { pg_trgm } });
    await db.exec(STAND_INS);
    for (const f of migrationFiles() as { sql: string }[]) await db.exec(forPglite(f.sql));

    const buyer = crypto.randomUUID();
    const seller = crypto.randomUUID();
    for (const [id, email] of [
      [buyer, 'buyer@example.test'],
      [seller, 'seller@example.test'],
    ])
      await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
    for (const id of [buyer, seller]) await db.query('insert into profiles (id) values ($1) on conflict (id) do nothing', [id]);
    await db.query(`update profiles set role = 'seller' where id = $1`, [seller]);

    const product = (
      await db.query<{ id: string }>(
        `insert into products (slug, seller_id, name, category, description, price_cents, delivery_days, status, demo_url, code_url, license)
         values ('beta-db-test', $1, 'Beta DB test', 'business', 'A website used only by this test.', 2000, 3, 'live', 'https://example.test', 'https://example.test/code.zip', 'standard') returning id`,
        [seller],
      )
    ).rows[0].id;

    const now = Date.now();
    const order: Order = {
      id: crypto.randomUUID(),
      kind: 'product',
      pkg: 'asis',
      deliveryType: 'download',
      state: 'beta_requested',
      title: 'Beta DB test',
      buyerId: buyer,
      sellerId: seller,
      productId: product,
      productKey: 'beta-db-test',
      devKey: null,
      lines: [['Beta DB test', 0]],
      priceCents: 0,
      feeCents: 0,
      refundedCents: 0,
      currency: 'USD',
      days: 3,

      express: false,
      instant: false,
      demo: false,
      licence: 'standard',
      payment: { ref: 'beta_free', brand: 'beta_free', last4: '' },
      attempts: 0,
      createdAt: now,
    };
    const row = toRow(order) as Record<string, unknown>;
    const cols = Object.keys(row).filter((k) => row[k] !== undefined);
    const vals = cols.map((k) => (row[k] !== null && typeof row[k] === 'object' ? JSON.stringify(row[k]) : row[k]));
    await db.query(`insert into orders (${cols.join(', ')}) values (${cols.map((_, i) => '$' + (i + 1)).join(', ')})`, vals);

    await db.query(
      `insert into beta_requests (order_id, buyer_id, product_id, product_key, name, email, country, company, use_for, domain, created_at)
       values ($1, $2, $3, 'beta-db-test', 'Test Buyer', 'buyer@example.test', 'US', '', 'A site for my bakery.', '', now())`,
      [order.id, buyer, product],
    );
    const saved = await db.query<{ n: number }>('select count(*)::int as n from beta_requests where order_id = $1', [order.id]);
    expect(saved.rows[0].n).toBe(1);
    await db.close();
  });
});

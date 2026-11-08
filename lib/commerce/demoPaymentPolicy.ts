import type { Order } from '../orders/machine';

/**
 * The test-card gateway must never fund a real seller listing or developer job
 * on the live site. Only built-in example product orders may use the demo
 * payment flow by default.
 *
 * The test-card form is retired for real orders (owner, 2026-11-07, Phase 7): the old ENABLE_TEST_CHECKOUT switch, which let test
 * cards fund real orders, is ignored. Only the made-up example orders of a demo or test server can still use it.
 */
export function canUseDemoPayment(order: Pick<Order, 'demo' | 'kind' | 'sellerId' | 'productId' | 'devKey'> & { quotationId?: string }): boolean {
  // SellOnBay 2.0: an order made from a quotation is a real purchase. It is paid by a verified method and reconciled; never by test cards,
  // and ENABLE_TEST_CHECKOUT no longer changes that (retired, Phase 7).
  if (order.quotationId) return false;
  return order.demo === true && order.kind === 'product' && !order.sellerId && !order.productId && !order.devKey;
}

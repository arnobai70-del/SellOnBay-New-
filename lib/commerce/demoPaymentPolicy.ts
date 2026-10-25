import type { Order } from '../orders/machine';

/**
 * The test-card gateway must never fund a real seller listing or developer job.
 * Only built-in example product orders may use the demo payment flow.
 * This is an entitlement boundary, not a UI toggle or a production-only check.
 */
export function canUseDemoPayment(order: Pick<Order, 'demo' | 'kind' | 'sellerId' | 'productId' | 'devKey'>): boolean {
  return order.demo === true && order.kind === 'product' && !order.sellerId && !order.productId && !order.devKey;
}

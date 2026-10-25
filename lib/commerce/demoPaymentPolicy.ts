import type { Order } from '../orders/machine';

/**
 * The test-card gateway must never fund a real seller listing or developer job
 * on the live site. Only built-in example product orders may use the demo
 * payment flow by default.
 *
 * ENABLE_TEST_CHECKOUT=1 extends the test gateway to real orders too, for
 * pre-launch testing before a real payment provider is connected. Remove or
 * unset this before opening the market to the public.
 */
export function canUseDemoPayment(order: Pick<Order, 'demo' | 'kind' | 'sellerId' | 'productId' | 'devKey'>): boolean {
  if (process.env.ENABLE_TEST_CHECKOUT === '1') return true;
  return order.demo === true && order.kind === 'product' && !order.sellerId && !order.productId && !order.devKey;
}

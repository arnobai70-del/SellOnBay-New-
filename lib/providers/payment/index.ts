import 'server-only';
import { FakePaymentProvider } from './fake';
import { PayPalProvider, paypalConfigured } from './paypal';
import type { PaymentProvider } from './types';

/* Real payments go through PayPal once its keys are set on the server (PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET); until then only the test gateway exists. */
const fake = ((globalThis as { __fakePay?: FakePaymentProvider }).__fakePay ??= new FakePaymentProvider());
const paypal = ((globalThis as { __paypalPay?: PayPalProvider }).__paypalPay ??= new PayPalProvider());
export const fakePayments = fake;
export const paypalPayments = paypal;
export const paymentProvider = (): PaymentProvider => (paypalConfigured() ? paypal : fake);
export { paypalConfigured };
export type { PaymentProvider, VerifiedEvent } from './types';

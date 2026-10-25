/* Test cards only. Anything else is refused on purpose so nobody types a real card into a demo form. Shared by the form and the server. */
export const TEST_CARDS: Record<string, { label: string; note: string; outcome: 'ok' | 'declined' | 'insufficient_funds' | 'otp' }> = {
  '4242424242424242': { label: 'Works', note: 'Payment goes through', outcome: 'ok' },
  '4000000000000002': { label: 'Declined', note: 'Card is declined', outcome: 'declined' },
  '4000000000009995': { label: 'No funds', note: 'Insufficient funds', outcome: 'insufficient_funds' },
  '4000002500003155': { label: 'Needs a code', note: 'Bank asks for a code (123456)', outcome: 'otp' },
};
export const DEMO_OTP = '123456';

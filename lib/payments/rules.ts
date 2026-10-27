/*
 * Manual-first payments (owner decisions D-I, F-4, F-5). Pure, tested. A buyer's proof is evidence only: an order is funded when Finance has
 * reconciled payments, against funds actually received, that add up to at least the amount due. Anything above it is owed back.
 */
export type MethodKind = 'bank_transfer' | 'local_wallet';
export const METHOD_KINDS: readonly MethodKind[] = ['bank_transfer', 'local_wallet'];

/* The reference compared for duplicates: case, spaces and separators do not make a reference new. */
export const referenceKey = (ref: string) => ref.toUpperCase().replace(/[\s\-_/.:#]+/g, '');

/* The code the buyer writes on the transfer so Finance can match it to the order. Derived from the order id; nothing secret. */
export const orderCode = (orderId: string) => 'SOB-' + orderId.replace(/-/g, '').slice(0, 10).toUpperCase();

export type Submission = { methodId: string; reference: string; amountCents: number; paidOn: string };
export function checkSubmission(s: Partial<Submission>, dueCents: number, today: string): { ok: true; value: Submission } | { ok: false; error: string } {
  const reference = typeof s.reference === 'string' ? s.reference.trim() : '';
  if (reference.length < 3 || reference.length > 100 || /[<>\u0000-\u001f]/.test(reference))
    return { ok: false, error: 'Enter the transaction reference from your bank or wallet (3 to 100 characters).' };
  if (referenceKey(reference).length < 3) return { ok: false, error: 'That reference is too short.' };
  const amount = Number(s.amountCents);
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, error: 'Enter the amount you sent.' };
  if (amount > dueCents * 10) return { ok: false, error: 'That amount is far above the amount due. Check it and try again.' };
  const paidOn = typeof s.paidOn === 'string' ? s.paidOn : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || paidOn > today) return { ok: false, error: 'Enter the date you paid (not in the future).' };
  if (typeof s.methodId !== 'string' || !s.methodId) return { ok: false, error: 'Choose how you paid.' };
  return { ok: true, value: { methodId: s.methodId, reference, amountCents: amount, paidOn } };
}

export type Reconciliation = { amountReceivedCents: number; statementRef: string; receivedAt: number };
export function checkReconciliation(r: Partial<Reconciliation>, now: number): { ok: true; value: Reconciliation } | { ok: false; error: string } {
  const amount = Number(r.amountReceivedCents);
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, error: 'Enter the amount that actually arrived, in cents. If nothing arrived, reject the payment instead.' };
  const statementRef = typeof r.statementRef === 'string' ? r.statementRef.trim() : '';
  if (statementRef.length < 3 || statementRef.length > 120) return { ok: false, error: 'Enter the reference on your bank or wallet statement (3 to 120 characters).' };
  const at = Number(r.receivedAt);
  if (!Number.isFinite(at) || at > now + 60_000 || at < now - 400 * 86_400_000) return { ok: false, error: 'Enter when the money arrived.' };
  return { ok: true, value: { amountReceivedCents: amount, statementRef, receivedAt: at } };
}

/* Does the money reconciled so far cover the order? Returns what is still missing and what is above the amount due. */
export function coverage(dueCents: number, reconciledCents: readonly number[]): { covered: boolean; receivedCents: number; shortCents: number; excessCents: number } {
  const received = reconciledCents.reduce((s, c) => s + c, 0);
  return { covered: received >= dueCents, receivedCents: received, shortCents: Math.max(0, dueCents - received), excessCents: Math.max(0, received - dueCents) };
}

/* A proof is a picture or a PDF, checked by its real bytes. */
export function proofKind(b: Uint8Array): { ext: string; type: string } | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: 'png', type: 'image/png' };
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
    return { ext: 'webp', type: 'image/webp' };
  if (b.length > 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return { ext: 'pdf', type: 'application/pdf' };
  return null;
}
export const PROOF_MAX_BYTES = 5 * 1024 * 1024;

export type MethodInput = { kind: MethodKind; label: string; instructions: string; currency: string; active: boolean };
export function checkMethod(m: Partial<MethodInput>): { ok: true; value: MethodInput } | { ok: false; error: string } {
  if (!METHOD_KINDS.includes(m.kind as MethodKind)) return { ok: false, error: 'Choose bank transfer or local wallet.' };
  const label = (m.label ?? '').trim();
  const instructions = (m.instructions ?? '').trim();
  if (label.length < 2 || label.length > 80) return { ok: false, error: 'Give the method a short name (2 to 80 characters).' };
  if (instructions.length < 10 || instructions.length > 2000) return { ok: false, error: 'Write the payment instructions buyers see (10 to 2000 characters).' };
  if (/<[a-z/!]/i.test(label + instructions)) return { ok: false, error: 'Plain text only.' };
  const currency = (m.currency ?? 'USD').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, error: 'Use a three-letter currency code, like USD or BDT.' };
  return { ok: true, value: { kind: m.kind as MethodKind, label, instructions, currency, active: m.active === true } };
}

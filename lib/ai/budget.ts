/**
 * Emergency AI spending controls. This is an upper-bound preflight, not a
 * concurrency-safe reservation or provider billing ledger.
 */
export function allowedAiBudget(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export function reservedAiTokens(prompt: string, maxOutputTokens: number): number {
  // Conservative overestimate for short site-ideas prompts. Provider-specific tokenisation and hard output caps require
  // additional vendor-specific verification before real paid use.
  return Buffer.byteLength(prompt, 'utf8') + maxOutputTokens + 256;
}

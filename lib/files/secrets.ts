/*
 * Finds credentials a seller must not ship inside a product (owner decision D-C). Pure, tested.
 * Reports where and what kind, never the secret itself: the finding text is safe to show the seller and to store.
 * Patterns are deliberately specific (low false alarms); a human review still follows every automatic check.
 */
export type SecretFinding = { file: string; kind: string; line?: number };

/* Files that hold credentials by their name alone. Example files (.env.example, sample, template) are allowed. */
const NAME_RULES: [RegExp, string][] = [
  [/(^|\/)\.env(\.[a-z0-9_-]+)?$/i, 'Environment file with settings'],
  [/(^|\/)(id_rsa|id_dsa|id_ecdsa|id_ed25519)$/i, 'SSH private key'],
  [/\.(pem|key|p12|pfx|jks|keystore)$/i, 'Private key or certificate store'],
  [/(^|\/)\.npmrc$/i, 'npm settings (can hold a token)'],
  [/(^|\/)\.pypirc$/i, 'PyPI settings (can hold a password)'],
  [/(^|\/)\.git-credentials$/i, 'Saved Git passwords'],
  [/(^|\/)(credentials|service[-_]?account)[^/]*\.json$/i, 'Cloud credentials file'],
  [/(^|\/)\.aws\/credentials$/i, 'AWS credentials file'],
  [/(^|\/)wp-config\.php$/i, 'WordPress config (holds the database password)'],
];
const EXAMPLE = /(\.|_|-)(example|sample|template|dist|defaults?)(\.|$)/i;

const CONTENT_RULES: [RegExp, string][] = [
  [/-----BEGIN (RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/, 'Private key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key'],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, 'GitHub token'],
  [/\bgithub_pat_[A-Za-z0-9_]{60,}\b/, 'GitHub token'],
  [/\bglpat-[A-Za-z0-9_-]{20,}\b/, 'GitLab token'],
  [/\bsk_live_[A-Za-z0-9]{20,}\b/, 'Stripe live secret key'],
  [/\brk_live_[A-Za-z0-9]{20,}\b/, 'Stripe live restricted key'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'Google API key'],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}\b/, 'Slack token'],
  [/\bsk-(proj-)?[A-Za-z0-9_-]{32,}\b/, 'AI service secret key'],
  [/\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/, 'SendGrid key'],
  [/\b(postgres(ql)?|mysql|mongodb(\+srv)?|redis|amqp):\/\/[^\s:'"/@]+:[^\s'"@]{3,}@[^\s'"]+/i, 'Database address with a password'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]*cm9sZSI6InNlcnZpY2Vfcm9sZS[A-Za-z0-9_-]*\.[A-Za-z0-9_-]{10,}/, 'Supabase service role key'],
];

const TEXT_EXT =
  /\.(js|mjs|cjs|ts|tsx|jsx|json|env|ya?ml|toml|ini|cfg|conf|config|properties|php|py|rb|go|java|kt|swift|cs|rs|sh|bash|zsh|ps1|bat|cmd|txt|md|xml|html?|vue|svelte|sql|gradle|plist|dart|lua|r|pl)$/i;

export const looksLikeText = (name: string, bytes: Uint8Array) => {
  if (TEXT_EXT.test(name) || /(^|\/)\.[a-z]+rc$/i.test(name) || /(^|\/)\.env/i.test(name)) return true;
  // Unknown extension: treat as text if the first KB has no zero bytes.
  return !bytes.subarray(0, 1024).includes(0);
};

/* Checks a file's name. */
export function secretByName(file: string): SecretFinding | null {
  if (EXAMPLE.test(file)) return null;
  for (const [re, kind] of NAME_RULES) if (re.test(file)) return { file, kind };
  return null;
}

const decoder = new TextDecoder('utf-8', { fatal: false });

/* Checks a text file's contents. At most one finding per kind per file; the line number helps the seller find it. */
export function secretsInText(file: string, bytes: Uint8Array): SecretFinding[] {
  const text = decoder.decode(bytes);
  const found: SecretFinding[] = [];
  for (const [re, kind] of CONTENT_RULES) {
    const m = re.exec(text);
    if (m && !found.some((f) => f.kind === kind)) found.push({ file, kind, line: text.slice(0, m.index).split('\n').length });
  }
  return found;
}

import type { EmailProvider, Mail } from './index';

type EmailEnv = Record<string, string | undefined>;
const DEFAULT_HOST = 'api.zeptomail.com';

/* A host name only: no scheme, path or port tricks, so the key can only ever go to the host that was set. */
export const zeptoHost = (env: EmailEnv = process.env) => {
  const host =
    env.ZEPTOMAIL_HOST?.trim()
      .replace(/^https:\/\//, '')
      .replace(/\/+$/, '') || DEFAULT_HOST;
  return /^[a-z0-9.-]+$/i.test(host) ? host : DEFAULT_HOST;
};
export const zeptoConfigured = (env: EmailEnv = process.env) => (env.ZEPTOMAIL_API_KEY?.trim().length ?? 0) >= 20;

/* "Name <a@b.c>" or "a@b.c" to ZeptoMail's shape. */
const address = (text: string) => {
  const m = /^\s*(?:(.+?)\s*<)?([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)>?\s*$/.exec(text);
  if (!m) throw new Error('Bad email address.');
  return m[1] ? { address: m[2], name: m[1] } : { address: m[2] };
};

/* App email through Zoho ZeptoMail's API. Human inboxes stay on Zoho Mail. Never logs the key, a recipient or a response body. */
export class ZeptoMailProvider implements EmailProvider {
  readonly name = 'zeptomail';
  constructor(
    private readonly apiKey: string,
    private readonly host: string,
    private readonly from: string,
    private readonly http: typeof fetch = fetch,
  ) {}
  async send(mail: Mail): Promise<void> {
    // ZeptoMail hands the key out with or without its scheme word.
    const token = this.apiKey.trim().replace(/^Zoho-enczapikey\s+/i, '');
    const response = await this.http(`https://${this.host}/v1.1/email`, {
      method: 'POST',
      headers: { Authorization: `Zoho-enczapikey ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        from: address(mail.from ?? this.from),
        to: [{ email_address: address(mail.to) }],
        ...(mail.replyTo ? { reply_to: [address(mail.replyTo)] } : {}),
        subject: mail.subject,
        textbody: mail.text,
        ...(mail.idempotencyKey ? { client_reference: mail.idempotencyKey } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Email provider rejected the notification.');
  }
}

/* Real delivery is explicitly opt-in. Missing credentials must not pretend to send. */
import { ResendEmailProvider, emailSender, resendConfigured } from './resend';
import { ZeptoMailProvider, zeptoConfigured, zeptoHost } from './zeptomail';
import { demoMode } from '../../demoMode';
import { emailAllowed, emailSenderFor, maskEmail } from '../../emailRouting';
/* `from` and `replyTo` are addresses from lib/emailRouting.ts; without `from` the sender is support@. */
export type Mail = { to: string; subject: string; text: string; idempotencyKey?: string; from?: string; replyTo?: string };
export interface EmailProvider {
  readonly name: string;
  send(mail: Mail): Promise<void>;
}

/* Test double and the development default: keeps what would have been sent. */
export class FakeEmailProvider implements EmailProvider {
  readonly name = 'fake';
  sent: Mail[] = [];
  async send(mail: Mail) {
    this.sent.push(mail);
  }
}

const fake = ((globalThis as { __fakeEmail?: FakeEmailProvider }).__fakeEmail ??= new FakeEmailProvider());
const unavailable: EmailProvider = {
  name: 'unconfigured',
  async send() {
    throw new Error('Email provider is not configured.');
  },
};
/* Until launch only our own and test addresses get real email. Anything else is logged, without its words, and counts as handled so the queue does not retry it. */
export const heldEmail = (real: EmailProvider, env: Record<string, string | undefined> = process.env): EmailProvider => ({
  name: real.name,
  async send(mail) {
    if (emailAllowed(mail.to, env)) return real.send(mail);
    console.info(JSON.stringify({ event: 'email_held', to: maskEmail(mail.to), subject: mail.subject }));
  },
});

/* In development nothing is sent: each email is written to the console, and kept like the fake provider's. */
const consoleProvider: EmailProvider = {
  name: 'console',
  async send(mail) {
    console.info(`[email] to ${mail.to} from ${mail.from ?? emailSenderFor()}: ${mail.subject}\n${mail.text}`);
    await fake.send(mail);
  },
};

/** ZeptoMail is the real provider (owner, 2026-11-07); Resend stays available only if it is asked for by name. */
export const emailProvider = (): EmailProvider => {
  if (process.env.NODE_ENV === 'development') return consoleProvider;
  if (process.env.EMAIL_PROVIDER === 'zeptomail' || (!process.env.EMAIL_PROVIDER && zeptoConfigured())) {
    if (!zeptoConfigured()) return unavailable;
    return heldEmail(new ZeptoMailProvider(process.env.ZEPTOMAIL_API_KEY!.trim(), zeptoHost(), emailSenderFor()));
  }
  // A Resend key alone turns real email on (EMAIL_PROVIDER=resend still works; fake or anything else keeps it off).
  if (process.env.EMAIL_PROVIDER === 'resend' || (!process.env.EMAIL_PROVIDER && process.env.RESEND_API_KEY)) {
    if (!resendConfigured()) return unavailable;
    return heldEmail(new ResendEmailProvider(process.env.RESEND_API_KEY!.trim(), emailSender()));
  }
  // Real production must not silently pretend to deliver email.
  if (process.env.EMAIL_PROVIDER && process.env.EMAIL_PROVIDER !== 'fake') return unavailable;
  if (process.env.NODE_ENV === 'production' && !demoMode()) return unavailable;
  return fake;
};
export const fakeEmail = fake;

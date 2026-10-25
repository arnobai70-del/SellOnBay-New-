/* Real delivery is explicitly opt-in. Missing credentials must not pretend to send. */
import { ResendEmailProvider, emailSender, resendConfigured } from './resend';
export type Mail = { to: string; subject: string; text: string; idempotencyKey?: string };
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
/** Resend is available only after the owner explicitly enables it with valid env settings. */
export const emailProvider = (): EmailProvider => {
  // A Resend key alone turns real email on (EMAIL_PROVIDER=resend still works; fake or anything else keeps it off).
  if (process.env.EMAIL_PROVIDER === 'resend' || (!process.env.EMAIL_PROVIDER && process.env.RESEND_API_KEY)) {
    if (!resendConfigured()) return unavailable;
    return new ResendEmailProvider(process.env.RESEND_API_KEY!.trim(), emailSender());
  }
  // Real production must not silently pretend to deliver email.
  if (process.env.EMAIL_PROVIDER && process.env.EMAIL_PROVIDER !== 'fake') return unavailable;
  if (process.env.NODE_ENV === 'production' && process.env.LAUNCHBAY_DEMO !== '1') return unavailable;
  return fake;
};
export const fakeEmail = fake;

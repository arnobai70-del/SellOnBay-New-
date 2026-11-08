import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyTurnstile } from '@/lib/bot/turnstile';
import { CONTACT_TOPICS, TOPIC_INBOX } from '@/lib/contact';
import { clientIp } from '@/lib/delivery/service';
import { senderFrom } from '@/lib/emailRouting';
import { contactRoutes } from '@/lib/site/contentStore';
import { maintenanceFor } from '@/lib/maintenance/service';
import { emailProvider } from '@/lib/providers/email';
import { limit } from '@/lib/rateLimit';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createAdminClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/validate';

export const runtime = 'nodejs';
const schema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  topic: z.enum(CONTACT_TOPICS),
  orderRef: z.string().trim().max(40).default(''),
  message: z.string().trim().min(10, 'Please write a little more.').max(4000),
  website: z.string().default(''),
  token: z.string().default(''),
  elapsedMs: z.number().default(0),
});

/* A message from someone who is not signed in. Bot traps first, then the bot check and a limit per address; saved, then emailed to the inbox for its topic. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('help');
  if (closed) return closed;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const m = body.data;
  if (m.website || m.elapsedMs < 1500) return NextResponse.json({ ok: true }); // a bot: it learns nothing
  const ip = clientIp(req);
  if (!(await limit(`contact:${ip}`, 5, 3_600_000))) return NextResponse.json({ error: 'Too many messages. Please try again later.' }, { status: 429 });
  if (!(await verifyTurnstile(m.token || undefined, ip))) return NextResponse.json({ error: 'Please complete the check and try again.' }, { status: 400 });
  if (supabaseConfigured) {
    const { error } = await createAdminClient().from('contact_messages').insert({ name: m.name, email: m.email, topic: m.topic, order_ref: m.orderRef, message: m.message });
    if (error) return NextResponse.json({ error: 'Could not send. Please try again.' }, { status: 500 });
  }
  // The message is saved, so a mail problem does not lose it.
  const routes = await contactRoutes();
  await emailProvider()
    .send({
      to: routes[TOPIC_INBOX[m.topic]],
      from: senderFrom(routes.support),
      replyTo: m.email,
      subject: `[Contact] ${m.topic}: ${m.name}`.slice(0, 150),
      text: `${m.name} <${m.email}>\nOrder: ${m.orderRef || 'none'}\n\n${m.message}`,
    })
    .catch(() => {});
  return NextResponse.json({ ok: true });
}

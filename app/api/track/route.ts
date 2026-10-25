import { z } from 'zod';
import { hitForBuy, hitsForPage, isBot } from '@/lib/analyticsCore';
import { record, visitorOf } from '@/lib/analytics';
import { clientAddress } from '@/lib/clientIp';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';

const Body = z.union([z.object({ p: z.string().max(200), q: z.string().max(300).default('') }), z.object({ buy: z.string().max(80) })]);
const none = () => new Response(null, { status: 204 });

/* Visitor analytics (lib/analytics.ts): one call per page open and per Buy click, sent by components/VisitTracker.tsx. Always answers 204. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('visitor'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const ua = req.headers.get('user-agent') ?? '';
  if (isBot(ua) || req.headers.get('purpose') === 'prefetch') return none();
  const raw = await req.text().catch(() => '');
  if (raw.length > 1000) return none();
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(JSON.parse(raw));
  } catch {
    return none();
  }
  const hits = 'buy' in body ? [hitForBuy(body.buy)].filter((h) => h !== null) : hitsForPage(body.p, body.q);
  if (hits.length) await record(visitorOf(clientAddress(req.headers), ua.slice(0, 300)), hits);
  return none();
}

import { z } from 'zod';

/* What the sale forms send (seller and admin). Times in UTC as "YYYY-MM-DD HH:MM" or ISO; the price in dollars. Pure. */
const when = z
  .string()
  .trim()
  .max(40)
  .transform((s, ctx) => {
    const t = Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s) ? `${s.replace(' ', 'T')}:00Z` : s);
    if (!Number.isFinite(t)) {
      ctx.addIssue({ code: 'custom', message: 'Write the time as YYYY-MM-DD HH:MM in UTC.' });
      return z.NEVER;
    }
    return t;
  });
export const saleForm = z.union([
  z.object({ action: z.literal('cancel'), saleId: z.string().uuid() }),
  z.object({
    action: z.literal('plan'),
    kind: z.enum(['sale', 'launch']),
    salePrice: z.union([z.number(), z.string()]).transform((v) => Math.round(Number(v) * 100)),
    startsAt: when,
    endsAt: when,
  }),
]);

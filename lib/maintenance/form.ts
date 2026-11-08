import { z } from 'zod';
import { MAINTENANCE_LIMITS } from './config';

/*
 * What the glass Maintenance page sends (Admin › Settings › Maintenance). Times are written in UTC as "YYYY-MM-DD HH:MM" (or ISO); empty means
 * "now" for the start and "until turned off" for the end. Pure, tested.
 */
const time = z
  .string()
  .trim()
  .max(40)
  .default('')
  .transform((s, ctx) => {
    if (!s) return null;
    const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s) ? `${s.replace(' ', 'T')}:00Z` : s;
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) {
      ctx.addIssue({ code: 'custom', message: 'Write the time as YYYY-MM-DD HH:MM in UTC.' });
      return z.NEVER;
    }
    return t;
  });
export const maintenanceForm = z.object({
  enabled: z.union([z.boolean(), z.enum(['on', 'off']).transform((v) => v === 'on')]),
  message: z.string().max(MAINTENANCE_LIMITS.message).default(''),
  startAt: time,
  endAt: time,
  bannerMinutes: z
    .union([z.number(), z.string()])
    .default(0)
    .transform((v) => (v === '' ? 0 : Number(v))),
});

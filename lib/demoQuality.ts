import type { Product } from './data';

/*
 * How well a listing shows what it is, from 0 to 1. Buyers cannot try most code and automation products before paying, so listings that
 * show them working rise a little in "Best match". The lift is small (at most +0.4 on a 5 point scale) so a great demo cannot beat great reviews.
 * Signals: a demo link, a free sample, a limited trial copy, 3 or more screenshots, a real description, 4 or more included items.
 */
const WEIGHTS = { demo: 0.3, sample: 0.15, trial: 0.1, shots: 0.15, desc: 0.15, inc: 0.15 } as const;
export const MAX_LIFT = 0.4;

export function demoQuality(p: Pick<Product, 'demo' | 'sample' | 'trial' | 'shots' | 'desc' | 'inc'>): number {
  const demo = p.demo?.type === 'upload' || (p.demo?.type === 'url' && /^https:\/\//.test(p.demo.src));
  const q =
    (demo ? WEIGHTS.demo : 0) +
    (p.sample ? WEIGHTS.sample : 0) +
    (p.trial ? WEIGHTS.trial : 0) +
    (Math.min(p.shots?.length ?? 0, 3) / 3) * WEIGHTS.shots +
    (p.desc.trim().length >= 120 ? WEIGHTS.desc : (Math.min(p.desc.trim().length, 120) / 120) * WEIGHTS.desc) +
    (Math.min(p.inc.length, 4) / 4) * WEIGHTS.inc;
  return Math.round(q * 1000) / 1000;
}

export const demoLift = (p: Parameters<typeof demoQuality>[0]) => demoQuality(p) * MAX_LIFT;

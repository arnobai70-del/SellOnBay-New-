import 'server-only';
import { DEVS as STARTERS, type Dev, type DevLevel, type Pack } from './developers';
import { getSettings } from './settings';
import { supabaseConfigured } from './supabase/env';
import { createAdminClient } from './supabase/server';

const isNextSignal = (e: unknown) => typeof e === 'object' && e !== null && 'digest' in e;

type Row = {
  user_id: string;
  handle: string;
  name: string;
  headline: string;
  gig: string;
  country: string;
  bio: string;
  langs: string[];
  skills: Dev['skills'];
  areas: string[];
  packs: Pack[];
  avail: Dev['avail'];
  created_at: string;
  credit_trial?: boolean;
  trial_price_cents?: number | null;
  trial_days?: number | null;
};

const toDev = (r: Row): Dev => ({
  id: r.handle,
  name: r.name,
  headline: r.headline,
  country: r.country || 'Remote',
  since: new Date(r.created_at).getFullYear(),
  level: 'New' as DevLevel,
  rating: 0,
  reviews: 0,
  orders: 0,
  respond: 'a day',
  avail: r.avail,
  langs: r.langs,
  skills: r.skills,
  areas: r.areas,
  bio: r.bio,
  gig: r.gig,
  hue: [...r.handle].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7),
  packs: r.packs,
  feedback: [],
  work: [],
  fromDb: true,
  creditTrial: !!r.credit_trial,
  trial: r.trial_price_cents && r.trial_days ? { price: Math.round(r.trial_price_cents / 100), days: r.trial_days } : undefined,
});

/* Starter profiles plus approved profiles from the database. A broken database never hides the starters. */
export async function getDevs(): Promise<Dev[]> {
  const DEVS = (await getSettings()).showExamples ? STARTERS : [];
  if (!supabaseConfigured) return DEVS;
  try {
    const { data } = await createAdminClient()
      .from('dev_profiles')
      .select('user_id, handle, name, headline, gig, country, bio, langs, skills, areas, packs, avail, created_at, credit_trial, trial_price_cents, trial_days')
      .eq('status', 'live');
    return [...(data ?? []).map((r) => toDev(r as Row)), ...DEVS];
  } catch (e) {
    if (isNextSignal(e)) throw e;
    return DEVS;
  }
}

export async function getDev(id: string, viewerId?: string): Promise<{ dev: Dev; status: string; userId?: string } | null> {
  const s = STARTERS.find((d) => d.id === id);
  if (s) return (await getSettings()).showExamples ? { dev: s, status: 'live' } : null;
  if (!supabaseConfigured) return null;
  try {
    const { data } = await createAdminClient()
      .from('dev_profiles')
      .select('user_id, handle, name, headline, gig, country, bio, langs, skills, areas, packs, avail, created_at, status, credit_trial, trial_price_cents, trial_days')
      .eq('handle', id)
      .maybeSingle();
    if (!data) return null;
    if (data.status !== 'live' && data.user_id !== viewerId) return null;
    return { dev: toDev(data as Row), status: data.status, userId: data.user_id };
  } catch (e) {
    if (isNextSignal(e)) throw e;
    return null;
  }
}

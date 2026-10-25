import { NextResponse } from 'next/server';
import { isBlocked } from '@/lib/chatFilter';
import { AREAS, DEVS, LANGS, SKILLS, parseTrialInput } from '@/lib/developers';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { developerSchema } from '@/lib/schemas';
import { readJson } from '@/lib/validate';
import { cannotAct } from '@/lib/accounts';
import { guard } from '@/lib/guard';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
const str = (v: unknown, max: number) =>
  String(v ?? '')
    .trim()
    .slice(0, max);
const inList = <T extends string>(v: unknown, list: readonly T[], max: number): T[] => [...new Set(Array.isArray(v) ? v : [])].filter((x): x is T => list.includes(x as T)).slice(0, max);

/* Creates or replaces the signed-in person's developer profile. Everything is re-validated here; the client form is only a convenience.
   Any save puts the profile back in review, so approved text cannot be swapped for something else afterwards. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('seller'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return fail('Sign in first.', 401);
  const { data: me } = await sb.from('profiles').select('role, banned, suspended_until').eq('id', user.id).single();
  if (!me || cannotAct(me)) return fail('This account cannot create a profile.', 403);
  const g = await guard('developer', user.id);
  if (!g.ok) return fail(g.error, g.status);
  if (me.role !== 'buyer') {
    const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== 'aal2') return fail('Enter your authenticator code first.', 403);
  }

  const parsed = await readJson(req, developerSchema);
  if (!parsed.ok) return parsed.res;
  const b = parsed.data;
  const name = str(b.name, 60),
    headline = str(b.headline, 120),
    gig = str(b.gig, 120),
    country = str(b.country, 60),
    bio = str(b.bio, 1200);
  const langs = inList(b.langs, LANGS, 8),
    areas = inList(b.areas, AREAS, 8);
  const avail = (['Available now', 'Busy for a week', 'Booked'] as const).find((a) => a === b.avail) ?? 'Available now';
  const skills = (Array.isArray(b.skills) ? b.skills : [])
    .slice(0, 10)
    .map((s: { name?: string; level?: string }) => ({ name: String(s?.name), level: ['Expert', 'Advanced', 'Intermediate'].includes(String(s?.level)) ? String(s.level) : 'Advanced' }))
    .filter((s) => (SKILLS as readonly string[]).includes(s.name));
  if (name.length < 2) return fail('Add your name.');
  if (headline.length < 10) return fail('Write a headline of at least 10 characters.');
  if (gig.length < 10) return fail('Say what you will do.');
  if (bio.length < 40) return fail('Tell buyers about yourself in at least 40 characters.');
  if (!langs.length) return fail('Pick at least one language.');
  if (!areas.length) return fail('Pick at least one kind of work.');
  if ([name, headline, gig, bio, country].some(isBlocked)) return fail('Keep emails, phone numbers and outside payment talk out of your profile.');

  const rawPacks = Array.isArray(b.packs) ? b.packs : [];
  const names = ['Basic', 'Standard', 'Premium'] as const;
  const packs = names.map((n, i) => {
    const p = (rawPacks[i] ?? {}) as { price?: number; days?: number; blurb?: string; features?: string[] };
    return {
      name: n,
      price: Math.round(Number(p.price)),
      days: Math.round(Number(p.days)),
      blurb: str(p.blurb, 90),
      features: (Array.isArray(p.features) ? p.features : [])
        .map((f) => str(f, 80))
        .filter(Boolean)
        .slice(0, 8),
    };
  });
  for (const p of packs) if (!(p.price >= 10 && p.price <= 2000) || !(p.days >= 1 && p.days <= 60) || p.blurb.length < 5 || !p.features.length) return fail(`Fill in the ${p.name} package.`);
  if (!(packs[0].price <= packs[1].price && packs[1].price <= packs[2].price)) return fail('Prices should go up from Basic to Premium.');
  if (packs.some((p) => [p.blurb, ...p.features].some(isBlocked))) return fail('Keep emails, phone numbers and outside payment talk out of your packages.');

  const admin = createAdminClient();
  const { data: mine } = await admin.from('dev_profiles').select('handle').eq('user_id', user.id).maybeSingle();
  let handle = mine?.handle ?? slugify(name);
  if (!mine) {
    if (handle.length < 3) handle = 'dev-' + handle;
    if (DEVS.some((d) => d.id === handle)) handle += '-' + Math.random().toString(36).slice(2, 5);
    const { data: taken } = await admin.from('dev_profiles').select('user_id').eq('handle', handle).maybeSingle();
    if (taken) handle += '-' + Math.random().toString(36).slice(2, 5);
  }
  const trial = parseTrialInput(b.trialPrice, b.trialDays);
  if (!trial.ok) return fail(trial.error);
  const row = {
    user_id: user.id,
    handle,
    name,
    headline,
    gig,
    country,
    bio,
    langs,
    skills,
    areas,
    packs,
    avail,
    credit_trial: b.creditTrial === true,
    trial_price_cents: trial.trial ? trial.trial.price * 100 : null,
    trial_days: trial.trial?.days ?? null,
    status: 'in_review' as const,
  };
  const { error } = await admin.from('dev_profiles').upsert(row, { onConflict: 'user_id' });
  if (error) return fail('Could not save your profile. Try again.', 500);
  return NextResponse.json({ ok: true, handle });
}

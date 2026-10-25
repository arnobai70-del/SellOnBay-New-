'use client';
import Link from 'next/link';
import { useState } from 'react';
import { AREAS, LANGS, SKILLS, type Avail, type Dev, type Mastery, type Pack } from '@/lib/developers';
import { DevCard } from './DevParts';
import { CONFIG } from '@/lib/config';

const NAMES = ['Basic', 'Standard', 'Premium'] as const;
const LEVELS: Mastery[] = ['Expert', 'Advanced', 'Intermediate'];
const hueOf = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

type PackIn = { price: string; days: string; blurb: string; features: string };
const EMPTY: PackIn[] = [
  { price: '', days: '', blurb: '', features: '' },
  { price: '', days: '', blurb: '', features: '' },
  { price: '', days: '', blurb: '', features: '' },
];

export function DevJoinForm({
  defaultName,
  existing,
  live,
  heading = 'Create your developer profile',
  intro = 'Buyers filter by language and skill, so be specific. Prices are fixed per package, and payment is held in escrow until the buyer accepts.',
}: {
  defaultName: string;
  live: boolean;
  existing: 'live' | 'in_review' | 'rejected' | 'paused' | 'draft' | null;
  heading?: string;
  intro?: string;
}) {
  const [name, setName] = useState(defaultName);
  const [headline, setHeadline] = useState('');
  const [gig, setGig] = useState('I will ');
  const [country, setCountry] = useState('');
  const [bio, setBio] = useState('');
  const [langs, setLangs] = useState<string[]>([]);
  const [skills, setSkills] = useState<Record<string, Mastery>>({});
  const [areas, setAreas] = useState<string[]>([]);
  const [avail, setAvail] = useState<Avail>('Available now');
  const [creditTrial, setCreditTrial] = useState(false);
  const [trialPrice, setTrialPrice] = useState('');
  const [trialDays, setTrialDays] = useState('');
  const [packs, setPacks] = useState<PackIn[]>(EMPTY);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  // The address the server gave the profile: it can differ from the name (taken, too short, or kept from an earlier save).
  const [handle, setHandle] = useState('');

  const toggle = (arr: string[], v: string, max: number) => (arr.includes(v) ? arr.filter((x) => x !== v) : arr.length < max ? [...arr, v] : arr);
  const setPack = (n: number, k: keyof PackIn, v: string) => setPacks((s) => s.map((p, j) => (j === n ? { ...p, [k]: v } : p)));
  const clean = (): Pack[] =>
    packs.map((p, n) => ({
      name: NAMES[n],
      price: Math.round(+p.price),
      days: Math.round(+p.days),
      blurb: p.blurb.trim(),
      features: p.features
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 8)
        .map((l) => l.slice(0, 80)),
    }));
  const preview: Dev = {
    id: slug(name) || 'you',
    name: name || 'Your name',
    headline,
    gig: gig.trim().length > 7 ? gig : 'I will do great work for you',
    country: country || 'Remote',
    since: new Date().getFullYear(),
    level: 'New',
    rating: 0,
    reviews: 0,
    orders: 0,
    respond: 'a day',
    avail,
    langs: langs.length ? langs : ['Your languages'],
    skills: Object.entries(skills).map(([n, level]) => ({ name: n, level })),
    areas,
    bio,
    hue: hueOf(slug(name) || 'you'),
    packs: clean().map((p) => ({ ...p, price: p.price || 0 })),
    feedback: [],
    work: [],
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    const body = {
      name: name.trim(),
      headline: headline.trim(),
      gig: gig.trim(),
      country: country.trim(),
      bio: bio.trim(),
      langs,
      skills: Object.entries(skills).map(([n, level]) => ({ name: n, level })),
      areas,
      avail,
      creditTrial,
      trialPrice: trialPrice.trim(),
      trialDays: trialDays.trim(),
      packs: clean(),
    };
    if (body.name.length < 2) return setErr('Add your name.');
    if (body.headline.length < 10) return setErr('Write a headline of at least 10 characters.');
    if (body.gig.length < 10) return setErr('Say what you will do, for example "I will customise your store".');
    if (body.bio.length < 40) return setErr('Tell buyers about yourself in at least 40 characters.');
    if (!langs.length) return setErr('Pick at least one language.');
    if (!areas.length) return setErr('Pick at least one kind of work.');
    for (const p of body.packs)
      if (!(p.price >= 10 && p.price <= 2000) || !(p.days >= 1 && p.days <= 60) || p.blurb.length < 5 || !p.features.length)
        return setErr(`Fill in the ${p.name} package: price $10 to $2000, days 1 to 60, a short line and what is included.`);
    if (!(body.packs[0].price <= body.packs[1].price && body.packs[1].price <= body.packs[2].price)) return setErr('Prices should go up from Basic to Premium.');
    if (!live) return setDone(true);
    setBusy(true);
    const res = await fetch('/api/developers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    setBusy(false);
    const out = await res.json().catch(() => ({}));
    if (!res.ok) return setErr(out.error ?? 'Something went wrong. Try again.');
    setHandle(typeof out.handle === 'string' ? out.handle : '');
    setDone(true);
  }

  if (done)
    return (
      <div className="wrap" style={{ maxWidth: 640, padding: '56px 20px' }}>
        <div className="done">
          <h2>Profile sent for review</h2>
          <p className="muted">We check every profile, usually within a day. You will be able to preview it in the meantime.</p>
          <div className="done-btns">
            {handle && (
              <Link className="btn btn-blue" href={`/developers/${handle}`}>
                Preview my profile
              </Link>
            )}
            <Link className="btn btn-line" href="/developers">
              See developers
            </Link>
          </div>
        </div>
      </div>
    );

  return (
    <div className="wrap dv-join">
      <h1>{heading}</h1>
      <p className="lead muted">{intro}</p>
      {existing && (
        <div className="note" style={{ margin: '16px 0' }}>
          <span>{existing === 'live' ? 'Your profile is live. Saving changes sends it back for a quick review.' : 'You already have a profile in review. Saving replaces it.'}</span>
        </div>
      )}
      <div className="dv-join-grid">
        <form onSubmit={submit} noValidate className="dv-form">
          <div className="panel">
            <h2>About you</h2>
            <label className="field">
              <span>Full name</span>
              <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              <span>Headline</span>
              <input value={headline} maxLength={120} onChange={(e) => setHeadline(e.target.value)} placeholder="Flutter developer: your app on both stores" />
            </label>
            <label className="field">
              <span>Your offer</span>
              <input value={gig} maxLength={120} onChange={(e) => setGig(e.target.value)} />
            </label>
            <label className="field">
              <span>Country</span>
              <input value={country} maxLength={60} onChange={(e) => setCountry(e.target.value)} />
            </label>
            <label className="field">
              <span>About</span>
              <textarea rows={5} value={bio} maxLength={1200} onChange={(e) => setBio(e.target.value)} placeholder="What you build, how you work, how fast you reply." />
            </label>
          </div>
          <div className="panel">
            <h2>Languages</h2>
            <p className="muted">Pick up to 8.</p>
            <div className="dv-pick">
              {LANGS.map((l) => (
                <button key={l} type="button" aria-pressed={langs.includes(l)} onClick={() => setLangs((s) => toggle(s, l, 8))}>
                  {l}
                </button>
              ))}
            </div>
            <h2 style={{ marginTop: 22 }}>Frameworks and skills</h2>
            <p className="muted">Tap what you know, then say how well.</p>
            <div className="dv-pick">
              {SKILLS.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={s in skills}
                  onClick={() =>
                    setSkills((m) => {
                      const n = { ...m };
                      if (s in n) delete n[s];
                      else if (Object.keys(n).length < 10) n[s] = 'Advanced';
                      return n;
                    })
                  }
                >
                  {s}
                </button>
              ))}
            </div>
            {Object.keys(skills).length > 0 && (
              <ul className="dv-skill-set">
                {Object.entries(skills).map(([s, lv]) => (
                  <li key={s}>
                    <span>{s}</span>
                    <select className="select" aria-label={`How well do you know ${s}`} value={lv} onChange={(e) => setSkills((m) => ({ ...m, [s]: e.target.value as Mastery }))}>
                      {LEVELS.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            )}
            <h2 style={{ marginTop: 22 }}>What you work on</h2>
            <div className="dv-pick">
              {AREAS.map((a) => (
                <button key={a} type="button" aria-pressed={areas.includes(a)} onClick={() => setAreas((s) => toggle(s, a, 8))}>
                  {a}
                </button>
              ))}
            </div>
            <div className="field" style={{ marginTop: 18 }}>
              <label htmlFor="trial-price">Your trial package (optional)</label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <input
                  id="trial-price"
                  inputMode="numeric"
                  value={trialPrice}
                  onChange={(e) => setTrialPrice(e.target.value.replace(/\D/g, ''))}
                  placeholder={`Price, $5 to $${CONFIG.trial.maxPriceCents / 100}`}
                  style={{ flex: '1 1 160px' }}
                />
                <select aria-label="Trial days" value={trialDays} onChange={(e) => setTrialDays(e.target.value)} style={{ flex: '1 1 120px' }}>
                  <option value="">Days</option>
                  {Array.from({ length: CONFIG.trial.maxDays - CONFIG.trial.minDays + 1 }, (_, k) => CONFIG.trial.minDays + k).map((d) => (
                    <option key={d} value={d}>
                      {d} days
                    </option>
                  ))}
                </select>
              </div>
              <small>A small paid test project buyers can try before a bigger one. Leave both empty and we suggest a price from your Basic package.</small>
            </div>
            <label style={{ display: 'flex', gap: 10, marginTop: 18, alignItems: 'start' }}>
              <input type="checkbox" checked={creditTrial} onChange={(e) => setCreditTrial(e.target.checked)} style={{ accentColor: '#2B3DFF', marginTop: 5 }} />
              <span>
                Credit the trial fee toward a full project
                <small className="muted" style={{ display: 'block' }}>
                  If a buyer starts a full project with you within {CONFIG.trial.creditWindowDays} days of accepting your trial, the trial price comes off the new price.
                </small>
              </span>
            </label>
            <label className="field" style={{ marginTop: 18 }}>
              <span>Availability</span>
              <select className="select" value={avail} onChange={(e) => setAvail(e.target.value as Avail)}>
                {['Available now', 'Busy for a week', 'Booked'].map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="panel">
            <h2>Packages</h2>
            <p className="muted">Three fixed offers. List everything included in each one.</p>
            {NAMES.map((nm, n) => (
              <fieldset key={nm} className="dv-pk">
                <legend>{nm}</legend>
                <div className="two">
                  <label className="field">
                    <span>Price ($)</span>
                    <input type="number" inputMode="numeric" min={10} max={2000} value={packs[n].price} onChange={(e) => setPack(n, 'price', e.target.value)} />
                  </label>
                  <label className="field">
                    <span>Days</span>
                    <input type="number" inputMode="numeric" min={1} max={60} value={packs[n].days} onChange={(e) => setPack(n, 'days', e.target.value)} />
                  </label>
                </div>
                <label className="field">
                  <span>One line</span>
                  <input value={packs[n].blurb} maxLength={90} onChange={(e) => setPack(n, 'blurb', e.target.value)} />
                </label>
                <label className="field">
                  <span>What is included (one per line)</span>
                  <textarea rows={3} value={packs[n].features} onChange={(e) => setPack(n, 'features', e.target.value)} />
                </label>
              </fieldset>
            ))}
            <p className="muted" style={{ fontSize: 13.5 }}>
              A 20% service fee comes out of your price when the buyer accepts. Buyers never pay extra.
            </p>
          </div>
          {err && (
            <p className="form-err" role="alert">
              {err}
            </p>
          )}
          <button className="btn btn-blue btn-lg" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Send for review'}
          </button>
        </form>
        <aside className="dv-join-prev" aria-label="Preview">
          <p className="muted">How buyers see you</p>
          <div className="dv-prev-card" aria-hidden="true">
            <DevCard dev={preview} />
          </div>
        </aside>
      </div>
    </div>
  );
}

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hostKind, levelOfAge, levelOfCount, levelOfDays, levelOfPct, pctOf } from '@/lib/admin/healthCore';
import { readSections, readVisitors, sectionReport, visitorReports } from '@/lib/ga4VisitorsCore';
import { checkCoupon, cleanCoupons, couponLive, couponSplit } from '@/lib/marketing/coupons';
import { checkContact, mergeContact } from '@/lib/site/contact';
import { checkSocialUrl, cleanSocial, shownSocial } from '@/lib/site/social';
import { SOCIAL_MARKS } from '@/lib/site/socialIcons';
import { EMAIL_ROUTES } from '@/lib/emailRouting';

const src = (p: string) => readFileSync(p, 'utf8');
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(path.join(dir, n)).isDirectory() ? walk(path.join(dir, n)) : [path.join(dir, n)]));

describe('contact addresses (owner, 2026-11-08)', () => {
  it('must end with @sellonbay.com; unchanged ones are not stored', () => {
    expect(checkContact({ support: 'help@sellonbay.com' })).toEqual({ ok: true, value: { support: 'help@sellonbay.com' } });
    expect(checkContact({ support: EMAIL_ROUTES.support })).toEqual({ ok: true, value: {} });
    expect(checkContact({ support: 'me@gmail.com' }).ok).toBe(false);
    expect(checkContact({ support: 'a@sellonbay.com.evil.io' }).ok).toBe(false);
    expect(checkContact({ hacker: 'x@sellonbay.com' }).ok).toBe(false);
  });
  it('routing falls back to the defaults and ignores bad stored values', () => {
    expect(mergeContact(null)).toEqual(EMAIL_ROUTES);
    expect(mergeContact({ sales: 'deals@sellonbay.com', dev: 'x@evil.io' })).toEqual({ ...EMAIL_ROUTES, sales: 'deals@sellonbay.com' });
  });
});

describe('social links', () => {
  it('takes the 14 networks, https on their own domain only', () => {
    expect(Object.keys(SOCIAL_MARKS)).toHaveLength(14);
    expect(checkSocialUrl('telegram', 'https://t.me/sellonbay').ok).toBe(true);
    expect(checkSocialUrl('whatsapp', 'https://wa.me/123').ok).toBe(true);
    expect(checkSocialUrl('discord', 'http://discord.gg/x').ok).toBe(false);
    expect(checkSocialUrl('behance', 'https://behance.net.evil.io/x').ok).toBe(false);
    expect(checkSocialUrl('myspace', 'https://myspace.com/x').ok).toBe(false);
  });
  it('keeps the order and the off switch, and shows only what is on', () => {
    const list = cleanSocial([
      { network: 'github', url: 'https://github.com/sellonbay', enabled: false },
      { network: 'x', url: 'https://x.com/sellonbay' },
    ]);
    expect(list.map((l) => l.network)).toEqual(['github', 'x']);
    expect(shownSocial(list).map((l) => l.network)).toEqual(['x']);
  });
  it('the row is accessible and opens a new tab with rel "noopener me"; Organization data lists the links', () => {
    const row = src('components/glass/SocialRow.tsx');
    expect(row).toMatch(/rel="noopener me"/);
    expect(row).toMatch(/target="_blank"/);
    expect(row).toMatch(/aria-label=\{`\$\{BRAND_NAME\} on \$\{name\}`\}/);
    expect(row).toMatch(/if \(!shown\.length\) return null/);
    expect(src('app/(glass)/page.tsx')).toMatch(/sameAs/);
  });
  it('contact and social changes are Super Admin only', () => {
    expect(src('app/api/admin/contact-social/route.ts')).toMatch(/adminOnly\('super'\)/);
    expect(src('app/api/admin/site/route.ts')).toMatch(/kind === 'social' && !a\.scopes\.includes\('super'\)/);
  });
});

describe('coupons: the platform pays the discount', () => {
  it('the seller keeps 78% of the list price whatever the discount', () => {
    expect(couponSplit(4900, 10)).toEqual({ buyerPays: 4410, seller: 3822, platform: 588, discount: 490 });
    const big = couponSplit(10000, 50);
    expect(big.seller).toBe(7800);
    expect(big.platform).toBe(-2800); // the platform pays
  });
  it('checks codes and limits', () => {
    expect(checkCoupon({ code: 'launch-10', percentOff: 10 }).ok).toBe(true);
    expect(checkCoupon({ code: 'x', percentOff: 10 }).ok).toBe(false);
    expect(checkCoupon({ code: 'BIG', percentOff: 95 }).ok).toBe(false);
    expect(
      cleanCoupons([
        { code: 'A1B', percentOff: 5 },
        { code: 'a1b', percentOff: 6 },
      ]),
    ).toHaveLength(1);
    expect(couponLive({ code: 'A', percentOff: 5, endsOn: '2026-01-01', maxUses: null, active: true }, '2026-11-08')).toBe(false);
  });
});

describe('server health levels', () => {
  it('under 80 normal, 80 to 90 warning, over 90 critical', () => {
    expect([levelOfPct(79.9), levelOfPct(80), levelOfPct(90), levelOfPct(90.1), levelOfPct(null)]).toEqual(['ok', 'warn', 'warn', 'bad', 'off']);
    expect(pctOf(450, 500)).toBe(90);
    expect([levelOfDays(10), levelOfDays(20), levelOfDays(60)]).toEqual(['bad', 'warn', 'ok']);
    expect([levelOfCount(0, 10), levelOfCount(3, 10), levelOfCount(10, 10)]).toEqual(['ok', 'warn', 'bad']);
    expect([levelOfAge(1, 1), levelOfAge(2, 1), levelOfAge(4, 1)]).toEqual(['ok', 'warn', 'bad']);
  });
  it('machine figures only on our own server', () => {
    expect(hostKind({})).toBe('shared');
    expect(hostKind({ HOST_KIND: 'server' })).toBe('server');
    expect(hostKind({ VERCEL: '1', HOST_KIND: 'server' })).toBe('serverless');
  });
  it('is read only, rate limited, Dev or Super, and alerts once an hour per metric', () => {
    const page = src('app/(dash)/admin/system/page.tsx');
    expect(page).toMatch(/scope: 'dev'/);
    expect(page).toMatch(/limit\(`health-page:/);
    const lib = src('lib/admin/health.ts');
    expect(lib).toMatch(/limit\(`health-alert:\$\{m\.key\}`, 1, 3_600_000\)/);
    expect(lib).not.toMatch(/process\.env\.[A-Z_]+\s*\}/); // no environment value is put into the page
  });
});

describe('GA4 visitors', () => {
  it('asks for the five reports and the section clicks', () => {
    expect(visitorReports().map((r) => r.dimensions[0].name)).toEqual(['date', 'newVsReturning', 'country', 'pagePath', 'deviceCategory']);
    expect(JSON.stringify(sectionReport())).toMatch(/section_click/);
  });
  it('reads totals and trends', () => {
    const daily = { rows: [{ dimensionValues: [{ value: '20261108' }], metricValues: [{ value: '5' }, { value: '2' }] }] };
    const r = readVisitors([daily, { rows: [{ dimensionValues: [{ value: 'new' }], metricValues: [{ value: '3' }] }] }, {}, {}, {}], '2026-11-08');
    expect(r.today).toBe(5);
    expect(r.last7).toBe(5);
    expect(r.trend7).toBeNull();
    expect(r.newVsReturning).toEqual([{ name: 'new', n: 3 }]);
    expect(readSections({ rows: [{ dimensionValues: [{ value: 'hero-search' }], metricValues: [{ value: '7' }] }] })).toEqual([{ name: 'hero-search', n: 7 }]);
  });
  it('clicks are sent only after consent, with the section name only', () => {
    const ga = src('components/GoogleAnalytics.tsx');
    expect(ga).toMatch(/if \(!on\) return;\s*const click/);
    expect(ga).toMatch(/'section_click', \{ section \}/);
    for (const f of ['app/(glass)/page.tsx', 'components/glass/PublicNav.tsx', 'app/(glass)/cart/CartClient.tsx', 'app/(glass)/sell/page.tsx']) expect(src(f), f).toMatch(/data-track="[a-z-]+"/);
  });
  it('the first-party count keeps no address or person', () => {
    const m = src('supabase/migrations/0080_admin_visitors_health.sql');
    const table = m.slice(m.indexOf('create table if not exists page_counts'), m.indexOf(');', m.indexOf('create table if not exists page_counts')));
    expect(table).not.toMatch(/visitor|ip|user/i);
    expect(m).toMatch(/revoke all on page_counts from anon, authenticated/);
  });
});

describe('admin pages', () => {
  it('every /admin page asks for the admin role and, except the overview, a permission', () => {
    for (const f of walk('app/(dash)/admin').filter((f) => f.endsWith('page.tsx'))) {
      const s = src(f);
      expect(s, f).toMatch(/roles: \['admin'\]/);
      // The overview and the top bar's search (it shows each part only to the permissions that may see it) are open to every admin.
      if (!f.endsWith(path.join('admin', 'page.tsx')) && !f.endsWith(path.join('admin', 'search', 'page.tsx'))) expect(s, f).toMatch(/scope: /);
    }
  });
  it('ID documents: Finance only, audited on every opening, 5-minute link', () => {
    const file = src('app/api/admin/verifications/[id]/file/route.ts');
    expect(file).toMatch(/adminOnly\('finance'\)/);
    expect(file).toMatch(/verification_file_opened/);
    expect(file).toMatch(/createSignedUrl\(path, 300\)/);
    expect(src('app/api/admin/verifications/[id]/route.ts')).toMatch(/adminOnly\('finance'\)/);
  });
  it('the test email is development only', () =>
    expect(src('app/api/admin/test-email/route.ts')).toMatch(/NODE_ENV !== 'development'\) return NextResponse\.json\(\{ error: 'Not found\.' \}, \{ status: 404 \}\)/));
});

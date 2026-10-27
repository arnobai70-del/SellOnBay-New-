import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { adapterFor } from '@/lib/ads/adapter';
import { canMovePromo, checkPromo, landingUrl } from '@/lib/ads/rules';
import { __openAdsForTests, draftPromotion, platformOpen, reviewPromotion, sellerPromotionAction, startPromotion } from '@/lib/ads/service';
import { openToken, sealToken, tokenFingerprint, tokenKey, TokenKeyError } from '@/lib/ads/tokens';
import { setFlag } from '@/lib/featureFlags';
import { memRequestable } from '@/lib/requests/products';

const ok = { platform: 'meta', productSlug: 'shop-kit', headline: 'A shop ready this week', text: 'A ready-made shop site set up on your own domain.', dailyBudgetCents: 1000, days: 7 };

describe('promotion rules (pure)', () => {
  it('checks words and SellOnBay budget guardrails', () => {
    expect(checkPromo(ok).ok).toBe(true);
    expect(checkPromo({ ...ok, platform: 'tiktok' })).toMatchObject({ ok: false });
    expect(checkPromo({ ...ok, text: 'Message me on WhatsApp for a discount today' })).toMatchObject({ ok: false });
    expect(checkPromo({ ...ok, headline: 'Guaranteed sales' })).toMatchObject({ ok: false });
    expect(checkPromo({ ...ok, dailyBudgetCents: 100 })).toMatchObject({ ok: false });
    expect(checkPromo({ ...ok, days: 31 })).toMatchObject({ ok: false });
    expect(checkPromo({ ...ok, dailyBudgetCents: 50_000, days: 30 })).toMatchObject({ ok: false }); // over the total cap
    expect(canMovePromo('draft', 'live')).toBe(false); // never live without review
    expect(canMovePromo('in_review', 'approved')).toBe(true);
  });
  it('the landing page is the public listing with campaign words and nothing about any buyer', () => {
    const u = new URL(landingUrl('https://sellonbay.com', '/templates/saas/shop-kit', 'meta', '12345678-aaaa'));
    expect(u.pathname).toBe('/templates/saas/shop-kit');
    expect([...u.searchParams.keys()].sort()).toEqual(['utm_campaign', 'utm_medium', 'utm_source']);
  });
});

describe('tokens are sealed, never plain', () => {
  const key = Buffer.alloc(32, 7);
  it('seals and opens with the same key and account; refuses another account or a bad key', () => {
    const sealed = sealToken('secret-token', 'acct-1', key);
    expect(sealed).not.toContain('secret-token');
    expect(openToken(sealed, 'acct-1', key)).toBe('secret-token');
    expect(() => openToken(sealed, 'acct-2', key)).toThrow();
    expect(() => tokenKey({ AD_TOKEN_KEY: 'short' })).toThrow(TokenKeyError);
    expect(tokenKey({ AD_TOKEN_KEY: 'a'.repeat(64) })).toHaveLength(32);
    expect(tokenFingerprint('secret-token')).toHaveLength(10);
  });
});

describe('nothing reaches an ad platform before B-9', () => {
  afterEach(() => __openAdsForTests(false));
  it('flags are locked and there is no adapter', async () => {
    expect(await setFlag('super-1', 'ads.meta', true, 'Try to switch it on.')).toMatchObject({ ok: false, status: 409 });
    expect(await platformOpen('meta')).toBe(false);
    expect(await platformOpen('google')).toBe(false);
    expect(adapterFor('meta')).toBeNull();
    expect(adapterFor('google')).toBeNull();
    expect(await draftPromotion('s-ads', ok)).toMatchObject({ ok: false, status: 409 });
  });
  it('the review flow works (test hook only) but starting always refuses: nothing is sent or charged', async () => {
    __openAdsForTests(true);
    const id = crypto.randomUUID();
    memRequestable({
      id,
      slug: 'shop-kit',
      name: 'Shop kit',
      sellerId: 's-ads',
      ownerType: 'seller',
      status: 'live',
      platform: 'web',
      deliveryType: 'live_site',
      deliveryDays: 3,
      deliveryHours: null,
      supportDays: 0,
      updateDays: 0,
      priceCents: 4900,
      setupCents: null,
      customCents: null,
      expressCents: null,
      expressHelps: true,
      latestVersionId: null,
    });
    expect(await draftPromotion('other-seller', ok)).toMatchObject({ ok: false, status: 404 }); // only the seller's own live listing
    const d = await draftPromotion('s-ads', ok);
    if (!d.ok) throw new Error(d.error);
    expect(await reviewPromotion('catalog-1', d.value.id, 'approve', '')).toMatchObject({ ok: false, status: 409 }); // still a draft
    expect((await sellerPromotionAction('s-ads', d.value.id, 'submit')).ok).toBe(true);
    expect(await reviewPromotion('catalog-1', d.value.id, 'reject', '')).toMatchObject({ ok: false, status: 400 });
    expect((await reviewPromotion('catalog-1', d.value.id, 'approve', 'Fine.')).ok).toBe(true);
    expect(await startPromotion('s-ads', d.value.id)).toMatchObject({ ok: false, status: 409, error: expect.stringMatching(/Nothing was sent/) });
  });
  it('the test hook cannot be used outside the tests, and no source file calls an ad API', () => {
    const old = process.env.VITEST;
    process.env.VITEST = 'false';
    expect(() => __openAdsForTests(true)).toThrow();
    process.env.VITEST = old;
    const dir = join(process.cwd(), 'lib', 'ads');
    for (const f of readdirSync(dir)) expect(readFileSync(join(dir, f), 'utf8')).not.toMatch(/graph\.facebook\.com|googleads\.googleapis\.com|adwords/i);
  });
});

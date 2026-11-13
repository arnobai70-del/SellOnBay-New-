import type { Metadata } from 'next';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { CONFIG } from '@/lib/config';
import { sellerDashboard } from '@/lib/dashboard';
import { AD_PLATFORMS, type AdPlatform } from '@/lib/ads/rules';
import { platformOpen, promotionsOf } from '@/lib/ads/service';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Promote a product'), robots: { index: false } });
export const dynamic = 'force-dynamic';

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

/*
 * Promote a live listing on the seller's own Meta or Google Ads account (lib/ads, model A). Not available until Meta and Google confirm access
 * (B-9) and counsel reviews the terms (B-10): this page says so and offers nothing that would reach an ad platform.
 */
export default async function Promote() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/dashboard/seller/promote', roles: ['seller'] });
  const me = viewer?.id ?? null;
  const open = Object.fromEntries(await Promise.all((Object.keys(AD_PLATFORMS) as AdPlatform[]).map(async (p) => [p, await platformOpen(p)] as const))) as Record<AdPlatform, boolean>;
  const any = Object.values(open).some(Boolean);
  const live = me ? ((await sellerDashboard(me))?.listings ?? []).filter((l) => l.status === 'live') : [];
  const mine = me ? await promotionsOf(me) : [];
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="seller" active="seller-promote" title={tx('Promote a product')}>
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Promote a product'} />
            </h2>
            <p className="tag">
              <T
                s={
                  "Run an ad for one of your live listings on your own {label} or {label2} account. The platform bills you directly; SellOnBay never charges for ads and never shares buyer data. SellOnBay checks the words first; the platform's own review still applies."
                }
                v={{ label: AD_PLATFORMS.meta.label, label2: AD_PLATFORMS.google.label }}
              />
            </p>
          </div>
        </div>
        {!any ? (
          <p className="muted" data-ads-state="not-available">
            <T
              s={
                "Not available yet. Promotions wait for Meta and Google to confirm that SellOnBay may connect sellers' ad accounts, and for a legal review of the terms. Nothing is connected and nothing is charged."
              }
            />
          </p>
        ) : live.length === 0 ? (
          <p className="muted">
            <T s={'You need a live listing to promote.'} />
          </p>
        ) : (
          <AdminForm
            endpoint="/api/seller/promotions"
            fixed={{ action: 'draft' }}
            openLabel={tx('Draft a promotion')}
            submit={tx('Save the draft')}
            fields={[
              {
                name: 'platform',
                label: tx('Where'),
                kind: 'select',
                options: (Object.keys(AD_PLATFORMS) as AdPlatform[]).filter((p) => open[p]).map((p) => [p, AD_PLATFORMS[p].label] as [string, string]),
              },
              { name: 'productSlug', label: tx('Listing'), kind: 'select', options: live.map((l) => [l.slug, l.name] as [string, string]) },
              { name: 'headline', label: tx('Headline'), kind: 'text', required: true, max: CONFIG.ads.headlineMax },
              { name: 'text', label: tx('Text'), kind: 'textarea', required: true, max: CONFIG.ads.textMax },
              {
                name: 'dailyBudget',
                label: tx('Daily budget in dollars ({usd} to {usd2})', { usd: usd(CONFIG.ads.minDailyCents), usd2: usd(CONFIG.ads.maxDailyCents) }),
                kind: 'dollars',
                required: true,
              },
              { name: 'days', label: tx('Days (1 to {maxDays})', { maxDays: CONFIG.ads.maxDays }), kind: 'text', required: true, value: '7', max: 2 },
            ]}
          />
        )}
      </div>
      {mine.length > 0 && (
        <div className="glass card sob-sec">
          <div className="row sob-hd">
            <div>
              <h2>
                <T s={'Your promotions'} />
              </h2>
            </div>
          </div>
          <ul className="sob-list">
            {mine.map((p) => (
              <li key={p.id}>
                <div className="sob-grow">
                  <b>{p.headline}</b>{' '}
                  <T
                    s={'· {productName} · {label} · {v2} a day for {days} days · {v4}'}
                    v={{ productName: p.productName, label: AD_PLATFORMS[p.platform].label, v2: usd(p.dailyBudgetCents), days: p.days, v4: p.status.replace('_', ' ') }}
                  />
                  {p.reviewNote && (
                    <p className="muted">
                      <T s={'SellOnBay: {reviewNote}'} v={{ reviewNote: p.reviewNote }} />
                    </p>
                  )}
                </div>
                <div className="sob-acts">
                  {p.status === 'draft' && <AdminForm endpoint="/api/seller/promotions" fixed={{ action: 'submit', id: p.id }} fields={[]} submit={tx('Send for review')} />}
                  {p.status === 'rejected' && <AdminForm endpoint="/api/seller/promotions" fixed={{ action: 'edit', id: p.id }} fields={[]} submit={tx('Back to draft')} tone="line" />}
                  {p.status === 'approved' && <AdminForm endpoint="/api/seller/promotions" fixed={{ action: 'start', id: p.id }} fields={[]} submit={tx('Start')} />}
                  {p.status !== 'ended' && <AdminForm endpoint="/api/seller/promotions" fixed={{ action: 'end', id: p.id }} fields={[]} submit={tx('End')} tone="line" />}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </DashShell>
  );
}

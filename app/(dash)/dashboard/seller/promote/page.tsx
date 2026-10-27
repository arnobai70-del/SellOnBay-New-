import type { Metadata } from 'next';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { CONFIG } from '@/lib/config';
import { sellerDashboard } from '@/lib/dashboard';
import { AD_PLATFORMS, type AdPlatform } from '@/lib/ads/rules';
import { platformOpen, promotionsOf } from '@/lib/ads/service';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Promote a product', robots: { index: false } };
export const dynamic = 'force-dynamic';

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

/*
 * Promote a live listing on the seller's own Meta or Google Ads account (lib/ads, model A). Not available until Meta and Google confirm access
 * (B-9) and counsel reviews the terms (B-10): this page says so and offers nothing that would reach an ad platform.
 */
export default async function Promote() {
  const viewer = await requireViewer({ path: '/dashboard/seller/promote', roles: ['seller'] });
  const me = viewer?.id ?? null;
  const open = Object.fromEntries(await Promise.all((Object.keys(AD_PLATFORMS) as AdPlatform[]).map(async (p) => [p, await platformOpen(p)] as const))) as Record<AdPlatform, boolean>;
  const any = Object.values(open).some(Boolean);
  const live = me ? ((await sellerDashboard(me))?.listings ?? []).filter((l) => l.status === 'live') : [];
  const mine = me ? await promotionsOf(me) : [];
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="seller" active="seller-promote" title="Promote a product">
      <div className="dp">
        <div className="hd">
          <div>
            <h2>Promote a product</h2>
            <p className="sub">
              Run an ad for one of your live listings on your own {AD_PLATFORMS.meta.label} or {AD_PLATFORMS.google.label} account. The platform bills you directly; SellOnBay never charges for ads and
              never shares buyer data. SellOnBay checks the words first; the platform&apos;s own review still applies.
            </p>
          </div>
        </div>
        {!any ? (
          <p className="muted" data-ads-state="not-available">
            Not available yet. Promotions wait for Meta and Google to confirm that SellOnBay may connect sellers&apos; ad accounts, and for a legal review of the terms. Nothing is connected and
            nothing is charged.
          </p>
        ) : live.length === 0 ? (
          <p className="muted">You need a live listing to promote.</p>
        ) : (
          <AdminForm
            endpoint="/api/seller/promotions"
            fixed={{ action: 'draft' }}
            openLabel="Draft a promotion"
            submit="Save the draft"
            fields={[
              {
                name: 'platform',
                label: 'Where',
                kind: 'select',
                options: (Object.keys(AD_PLATFORMS) as AdPlatform[]).filter((p) => open[p]).map((p) => [p, AD_PLATFORMS[p].label] as [string, string]),
              },
              { name: 'productSlug', label: 'Listing', kind: 'select', options: live.map((l) => [l.slug, l.name] as [string, string]) },
              { name: 'headline', label: 'Headline', kind: 'text', required: true, max: CONFIG.ads.headlineMax },
              { name: 'text', label: 'Text', kind: 'textarea', required: true, max: CONFIG.ads.textMax },
              { name: 'dailyBudget', label: `Daily budget in dollars (${usd(CONFIG.ads.minDailyCents)} to ${usd(CONFIG.ads.maxDailyCents)})`, kind: 'dollars', required: true },
              { name: 'days', label: `Days (1 to ${CONFIG.ads.maxDays})`, kind: 'text', required: true, value: '7', max: 2 },
            ]}
          />
        )}
      </div>
      {mine.length > 0 && (
        <div className="dp">
          <div className="hd">
            <div>
              <h2>Your promotions</h2>
            </div>
          </div>
          <ul className="list">
            {mine.map((p) => (
              <li key={p.id}>
                <div className="grow">
                  <b>{p.headline}</b> · {p.productName} · {AD_PLATFORMS[p.platform].label} · {usd(p.dailyBudgetCents)} a day for {p.days} days · {p.status.replace('_', ' ')}
                  {p.reviewNote && <p className="muted">SellOnBay: {p.reviewNote}</p>}
                </div>
                <div className="act-row">
                  {p.status === 'draft' && <AdminForm endpoint="/api/seller/promotions" fixed={{ action: 'submit', id: p.id }} fields={[]} submit="Send for review" />}
                  {p.status === 'rejected' && <AdminForm endpoint="/api/seller/promotions" fixed={{ action: 'edit', id: p.id }} fields={[]} submit="Back to draft" tone="line" />}
                  {p.status === 'approved' && <AdminForm endpoint="/api/seller/promotions" fixed={{ action: 'start', id: p.id }} fields={[]} submit="Start" />}
                  {p.status !== 'ended' && <AdminForm endpoint="/api/seller/promotions" fixed={{ action: 'end', id: p.id }} fields={[]} submit="End" tone="line" />}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </DashShell>
  );
}

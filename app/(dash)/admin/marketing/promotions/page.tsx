import type { Metadata } from 'next';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { AD_PLATFORMS, type AdPlatform } from '@/lib/ads/rules';
import { platformOpen, promotionsToReview } from '@/lib/ads/service';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Promotions'), robots: { index: false } });
export const dynamic = 'force-dynamic';

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

/* Catalog reviews sellers' promotion text (lib/ads). Locked until Meta and Google confirm access (B-9) and legal review (B-10). */
export default async function AdminPromotions() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/marketing/promotions', roles: ['admin'], scope: 'catalog' });
  const open = await Promise.all((Object.keys(AD_PLATFORMS) as AdPlatform[]).map((p) => platformOpen(p)));
  const queue = await promotionsToReview();
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-promotions" title={tx('Promotions')}>
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Promotions to review ({length})'} v={{ length: queue.length }} />
            </h2>
            <p className="tag">
              <T
                s={
                  'Sellers promote their own live listings on their own ad accounts. Check the words and the budget; the ad links to the listing and carries no buyer data. No advertising pixel is on the site.'
                }
              />
            </p>
          </div>
        </div>
        {!open.some(Boolean) ? (
          <p className="muted" data-ads-state="not-available">
            <T s={'Not available yet: waiting for Meta and Google to confirm access in writing (B-9) and for the legal review (B-10). No ad account can be connected and no ad API is called.'} />
          </p>
        ) : queue.length === 0 ? (
          <p className="muted">
            <T s={'Nothing waiting.'} />
          </p>
        ) : (
          <ul className="sob-list">
            {queue.map((p) => (
              <li key={p.id}>
                <div className="sob-grow">
                  <b>{p.headline}</b> · {p.productName} · {AD_PLATFORMS[p.platform].label}
                  <p>{p.text}</p>
                  <small className="muted">
                    <T s={'{v0} a day for {days} days ({v2} at most, billed by the platform to the seller)'} v={{ v0: usd(p.dailyBudgetCents), days: p.days, v2: usd(p.dailyBudgetCents * p.days) }} />
                  </small>
                </div>
                <div className="sob-acts">
                  <AdminForm endpoint={`/api/admin/promotions/${p.id}`} fixed={{ decision: 'approve' }} fields={[]} submit="Approve" />
                  <AdminForm
                    endpoint={`/api/admin/promotions/${p.id}`}
                    fixed={{ decision: 'reject' }}
                    openLabel="Reject"
                    submit="Reject"
                    tone="line"
                    fields={[{ name: 'note', label: tx('What to change'), kind: 'textarea', required: true, max: 500 }]}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashShell>
  );
}

import { ActionButton } from '@/components/ActionButton';
import { offeredNow, planVersions, sellerSubSettings } from '@/lib/plans/admin';
import { PLAN_CODES } from '@/lib/plans/rules';
import { sellerPlan } from '@/lib/plans/service';

const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0 })}`;

/*
 * The seller's plan (owner, 2026-11-12): what they are on, and, only while Admin › Subscription Management has seller subscriptions on, the paid
 * plans they may ask for (the existing request, POST /api/seller/plan; an admin takes it from there). Off: just the current plan.
 */
export async function SellerPlanCard({ sellerId }: { sellerId: string }) {
  const [{ plan, subscription }, settings, versions] = await Promise.all([sellerPlan(sellerId), sellerSubSettings(), planVersions()]);
  const now = offeredNow(versions);
  const offers =
    settings.enabled && !subscription ? PLAN_CODES.filter((c) => c !== 'free' && now[c] && settings.display[c].visible).sort((a, b) => settings.display[a].sort - settings.display[b].sort) : [];
  return (
    <section className="glass card" id="plan" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="row">
        <h2>Your plan</h2>
        <span className="status st-ok">{plan.name}</span>
      </div>
      <div className="tag" style={{ margin: 0 }}>
        {plan.commissionBps / 100}% commission · up to {plan.listingLimit} published listings
        {subscription ? ` · ${subscription.status.replace('_', ' ')}` : ''}
      </div>
      {offers.map((c) => {
        const p = now[c]!;
        const d = settings.display[c];
        return (
          <div key={c} className="li" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 500 }}>
                {p.name} {d.badge && <span className="tag">· {d.badge}</span>}
              </div>
              <div className="tag" style={{ margin: 0 }}>
                {usd(p.monthlyCents)} a month or {usd(p.yearlyCents)} a year · {p.commissionBps / 100}% commission · {p.listingLimit} listings
              </div>
              {d.description && (
                <div className="muted" style={{ fontSize: 13 }}>
                  {d.description}
                </div>
              )}
              {d.benefits.filter((b) => b.on).length > 0 && (
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>
                  {d.benefits
                    .filter((b) => b.on)
                    .map((b) => (
                      <li key={b.text}>{b.text}</li>
                    ))}
                </ul>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <ActionButton
                endpoint="/api/seller/plan"
                body={{ plan: c, billing: 'monthly' }}
                label="Ask monthly"
                tone="line"
                confirm={`Ask for ${p.name}, paid monthly? We send payment details; nothing is charged now.`}
              />
              <ActionButton
                endpoint="/api/seller/plan"
                body={{ plan: c, billing: 'yearly' }}
                label="Ask yearly"
                confirm={`Ask for ${p.name}, paid yearly? We send payment details; nothing is charged now.`}
              />
            </div>
          </div>
        );
      })}
    </section>
  );
}

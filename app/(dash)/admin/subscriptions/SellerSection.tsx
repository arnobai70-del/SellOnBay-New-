import Link from 'next/link';
import { SellerPlanVersionForm, SellerSettingsForm } from '@/components/glass/SellerPlanForms';
import { offeredNow, planVersions, sellerSubSettings } from '@/lib/plans/admin';
import { givesBenefits, PLAN_CODES } from '@/lib/plans/rules';
import { listSubscriptions } from '@/lib/plans/store';

import { T } from '@/components/i18n/T';
const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0 })}`;

/*
 * Admin › Subscription Management › Seller (owner, 2026-11-12). The existing seller plan system (migration 0057, lib/plans), not a copy: the
 * switch and display words are one setting, a plan edit is its next version, and seller subscriptions are still moved where they always were
 * (Users › Sellers, the same actions and log).
 */
export async function SellerSection({ superAdmin }: { superAdmin: boolean }) {
  const [settings, versions, subs] = await Promise.all([sellerSubSettings(), planVersions(), listSubscriptions().catch(() => [])]);
  const now = offeredNow(versions);
  const names = Object.fromEntries(PLAN_CODES.map((c) => [c, now[c]?.name ?? versions.find((v) => v.code === c)?.name ?? c]));
  const counts = {
    open: subs.filter((s) => givesBenefits(s.status)).length,
    waiting: subs.filter((s) => ['requested', 'pending_payment'].includes(s.status)).length,
  };
  return (
    <>
      <div className="kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: 12 }}>
        {[
          ['Seller subscriptions', settings.enabled ? 'On' : 'Off', settings.enabled ? 'sellers can ask for a plan' : 'no new requests'],
          ['Running', String(counts.open), 'keep their plan whatever you change'],
          ['Waiting', String(counts.waiting), 'requests and payments to check'],
        ].map(([l, v, s]) => (
          <div key={l} className="glass kpi">
            <div className="l">{l}</div>
            <div className="v">{v}</div>
            <div className="s">{s}</div>
          </div>
        ))}
      </div>

      {superAdmin && (
        <section className="glass card">
          <div className="row" style={{ marginBottom: 8 }}>
            <h2>
              <T s={'Seller switch and plan words'} />
            </h2>
            <span className={`status ${settings.enabled ? 'st-ok' : 'st-draft'}`}>{settings.enabled ? 'Open' : 'Off'}</span>
          </div>
          <SellerSettingsForm enabled={settings.enabled} display={settings.display} names={names} />
        </section>
      )}

      <section className="glass card">
        <div className="row" style={{ marginBottom: 8 }}>
          <h2>
            <T s={'Seller plans'} />
          </h2>
          <span className="tag" style={{ margin: 0 }}>
            <T s={"A change is saved as the plan's next version: running seller subscriptions and every recorded order fee keep theirs."} />
          </span>
        </div>
        {PLAN_CODES.map((code) => {
          const current = now[code] ?? versions.find((v) => v.code === code) ?? null;
          if (!current) return null;
          const history = versions.filter((v) => v.code === code);
          return (
            <div key={code} style={{ borderTop: '1px solid #E3ECF1', padding: '14px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                <h3 style={{ fontSize: 18 }}>
                  {current.name} <span className="tag">v{current.version}</span>
                </h3>
                <span className={`status ${now[code] ? 'st-ok' : 'st-draft'}`}>{now[code] ? 'Offered' : 'Withdrawn'}</span>
              </div>
              <div className="tag" style={{ margin: 0 }}>
                <T
                  s={'{v0} a month · {v1} a year · {v2}% commission · {listingLimit} listings{v4} · {length} {v6}'}
                  v={{
                    v0: usd(current.monthlyCents),
                    v1: usd(current.yearlyCents),
                    v2: current.commissionBps / 100,
                    listingLimit: current.listingLimit,
                    v4: current.featured ? ' · featured' : '',
                    length: history.length,
                    v6: history.length === 1 ? 'version' : 'versions',
                  }}
                />
              </div>
              {superAdmin && <SellerPlanVersionForm plan={current} offered={!!now[code]} />}
            </div>
          );
        })}
      </section>

      <section className="glass card">
        <h2>
          <T s={'Seller requests and subscriptions'} />
        </h2>
        <p className="muted" style={{ margin: '8px 0 12px', fontSize: 14, lineHeight: 1.6 }}>
          <T s={'Approving, taking payment, renewing, cancelling and ending seller plans stay in the existing tool, with the same steps and history.'} />
        </p>
        <Link className="btn sm" href="/admin/users/sellers" prefetch={false}>
          <T s={'Open seller subscriptions'} />
        </Link>
      </section>
    </>
  );
}

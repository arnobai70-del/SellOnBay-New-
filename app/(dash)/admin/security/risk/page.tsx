import type { Metadata } from 'next';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { CONFIG } from '@/lib/config';
import { listHolds } from '@/lib/holds';
import { getSettings } from '@/lib/settings';
import { listSellerRules } from '@/lib/reserve';
import { METRICS, METRIC_LABEL, findAnomalies, series } from '@/lib/metrics';
import { switchStates } from '@/lib/switches';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
import type { Tx } from '@/lib/i18n/tx';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Risk'), robots: { index: false } });
export const dynamic = 'force-dynamic';

const money = (c: number) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0 });
const why = (tx: Tx) => ({ name: 'note', label: tx('Why (goes in the audit log)'), kind: 'textarea' as const, required: true });

export default async function Risk() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/security/risk', roles: ['admin'], scope: 'finance' });
  const [days, holds, switches, rules] = await Promise.all([series(14), listHolds(), switchStates(), listSellerRules()]);
  const odd = findAnomalies(days.slice(-CONFIG.risk.anomaly.baselineDays - 1));
  const today = days[days.length - 1];
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-risk" title={tx('Risk')}>
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Today'} />
            </h2>
            <p className="tag">
              <T s={'Counted as it happens. A number far above the days before it (at least {factor} times the average) sends an alert.'} v={{ factor: CONFIG.risk.anomaly.factor }} />
            </p>
          </div>
        </div>
        {odd.length > 0 && (
          <div className="sob-alert">
            <div>
              <b>
                <T s={'Unusual today'} />
              </b>
              <span>{odd.map((a) => `${METRIC_LABEL[a.metric]}: ${a.today} (usually ${a.average})`).join(', ')}</span>
            </div>
          </div>
        )}
        <div className="sob-alert">
          {METRICS.map((m) => (
            <div key={m}>
              <small>{METRIC_LABEL[m]}</small>
              <b>{today.values[m]}</b>
            </div>
          ))}
        </div>
        <div className="tbl">
          <table className="">
            <thead>
              <tr>
                <th>
                  <T s={'Day'} />
                </th>
                {METRICS.map((m) => (
                  <th key={m}>{METRIC_LABEL[m]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...days].reverse().map((d) => (
                <tr key={d.day}>
                  <td>{d.day}</td>
                  {METRICS.map((m) => (
                    <td key={m}>{d.values[m]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Emergency switch'} />
            </h2>
            <p className="tag">
              <T
                s={'When a flood of fake buyers comes, pause checkout for new buyers only. Signed-out visitors and accounts younger than {newAccountDays} days cannot order; everyone else can.'}
                v={{ newAccountDays: CONFIG.limits.newAccountDays }}
              />
            </p>
          </div>
        </div>
        {switches.map((s) => (
          <div className="sob-item" key={s.key}>
            <b>{s.label}</b>{' '}
            <span className={s.enabled ? 'status st-bad' : 'status st-ok'}>
              <i />
              {s.enabled ? tx('On, new buyers are stopped') : tx('Off')}
            </span>
            {s.reason && <p className="muted">{s.reason}</p>}
            <AdminForm
              endpoint="/api/admin/risk/switch"
              fixed={{ key: s.key, state: s.enabled ? 'off' : 'on' }}
              fields={[{ name: 'reason', label: tx('Why (goes in the audit log)'), kind: 'textarea', required: true }]}
              submit={s.enabled ? tx('Turn it off') : tx('Turn it on')}
              openLabel={s.enabled ? tx('Turn off') : tx('Turn on')}
              tone={s.enabled ? 'line' : 'dark'}
            />
          </div>
        ))}
      </div>

      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Orders waiting for a safety check ({length})'} v={{ length: holds.length }} />
            </h2>
            <p className="tag">
              <T
                s={
                  'Paid orders from a flagged buyer, or from an account under {newAccountDays} days paying {v1} or more. The money is in escrow. The seller cannot start and no file is released until you decide. Release lets it go ahead; cancel refunds the buyer from escrow.'
                }
                v={{ newAccountDays: CONFIG.limits.newAccountDays, v1: money((await getSettings()).holdNewBuyerMinCents) }}
              />
            </p>
          </div>
        </div>
        {holds.length === 0 && (
          <p className="muted">
            <T s={'Nothing is waiting.'} />
          </p>
        )}
        {holds.map((h) => (
          <div className="sob-item" key={h.orderId}>
            <b>{h.title || tx('Order')}</b>{' '}
            <small className="muted">
              <T s={'{v0} · {v1} · {v2} UTC'} v={{ v0: money(h.priceCents), v1: h.orderId.slice(0, 8), v2: new Date(h.createdAt).toISOString().slice(0, 16).replace('T', ' ') }} />
            </small>
            <p>{h.reason}</p>
            <AdminForm
              endpoint={`/api/admin/risk/holds/${h.orderId}/decide`}
              fields={[
                {
                  name: 'decision',
                  label: tx('Decision'),
                  kind: 'select',
                  options: [
                    ['release', tx('Release: work and files go ahead')],
                    ['cancel', tx('Cancel and refund the buyer')],
                  ],
                },
                why(tx),
              ]}
              submit={tx('Decide')}
              openLabel={tx('Decide')}
              tone="dark"
            />
          </div>
        ))}
      </div>

      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Seller reserve'} />
            </h2>
            <p className="tag">
              <T
                s={
                  "A share of a seller's earnings kept back for some days after the payout hold, to cover a refund or chargeback that comes late. The site-wide default is {percent} percent for {days} days ({v2}). Set a different rule for one seller below."
                }
                v={{ percent: CONFIG.reserve.percent, days: CONFIG.reserve.days, v2: CONFIG.reserve.percent === 0 ? 'off' : 'on' }}
              />
            </p>
          </div>
        </div>
        {rules.length === 0 && (
          <p className="muted">
            <T s={'No seller has their own rule.'} />
          </p>
        )}
        {rules.map((r) => (
          <div className="sob-item" key={r.sellerId}>
            <b>{r.sellerId.slice(0, 8)}</b>{' '}
            <small className="muted">
              <T s={'{percent} percent for {days} days'} v={{ percent: r.percent, days: r.days }} />
            </small>
            <p>{r.note}</p>
            <AdminForm
              endpoint="/api/admin/risk/reserve"
              fixed={{ sellerId: r.sellerId, remove: true }}
              fields={[why(tx)]}
              submit={tx('Back to the default')}
              openLabel={tx('Remove the rule')}
              tone="line"
            />
          </div>
        ))}
        <div className="sob-item">
          <b>
            <T s={'Set a rule for a seller'} />
          </b>
          <AdminForm
            endpoint="/api/admin/risk/reserve"
            fields={[
              { name: 'sellerId', label: tx('Seller account id (from the Accounts page)'), kind: 'text', required: true },
              { name: 'percent', label: tx('Percent kept back (0 to 100)'), kind: 'text', required: true },
              { name: 'days', label: tx('For how many days (0 to 180)'), kind: 'text', required: true },
              why(tx),
            ]}
            submit={tx('Save the rule')}
            openLabel={tx('Set a rule')}
            tone="dark"
          />
        </div>
      </div>

      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Clean up'} />
            </h2>
            <p className="tag">
              <T
                s={
                  'Removing a fake account bans it for good and deletes the reviews and abuse reports it wrote. Orders, chat, downloads and the logs are kept as evidence. An account with a paid order is refused: use a dispute or a refund, and remove its reviews with the second form.'
                }
              />
            </p>
          </div>
        </div>
        <div className="sob-item">
          <b>
            <T s={'Remove a fake account'} />
          </b>
          <AdminForm
            endpoint="/api/admin/risk/clean"
            fixed={{ what: 'account' }}
            fields={[{ name: 'id', label: tx('Account id (from the Accounts page)'), kind: 'text', required: true }, why(tx)]}
            submit={tx('Remove the account')}
            openLabel={tx('Remove an account')}
            tone="dark"
          />
        </div>
        <div className="sob-item">
          <b>
            <T s={'Remove all reviews by an account'} />
          </b>
          <AdminForm
            endpoint="/api/admin/risk/clean"
            fixed={{ what: 'reviews_by' }}
            fields={[{ name: 'id', label: tx('Account id (from the Accounts page)'), kind: 'text', required: true }, why(tx)]}
            submit={tx('Remove the reviews')}
            openLabel={tx('Remove reviews by an account')}
            tone="line"
          />
        </div>
        <div className="sob-item">
          <b>
            <T s={'Remove a fake review'} />
          </b>
          <AdminForm
            endpoint="/api/admin/risk/clean"
            fixed={{ what: 'review' }}
            fields={[{ name: 'id', label: tx('Order id of the review'), kind: 'text', required: true }, why(tx)]}
            submit={tx('Remove the review')}
            openLabel={tx('Remove a review')}
            tone="line"
          />
        </div>
      </div>
    </DashShell>
  );
}

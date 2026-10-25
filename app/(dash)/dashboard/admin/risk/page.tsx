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

export const metadata: Metadata = { title: 'Risk', robots: { index: false } };
export const dynamic = 'force-dynamic';

const money = (c: number) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0 });
const why = { name: 'note', label: 'Why (goes in the audit log)', kind: 'textarea' as const, required: true };

export default async function Risk() {
  const viewer = await requireViewer({ path: '/dashboard/admin/risk', roles: ['admin'] });
  const [days, holds, switches, rules] = await Promise.all([series(14), listHolds(), switchStates(), listSellerRules()]);
  const odd = findAnomalies(days.slice(-CONFIG.risk.anomaly.baselineDays - 1));
  const today = days[days.length - 1];
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-risk" title="Risk">
      <div className="dp">
        <div className="hd">
          <div>
            <h2>Today</h2>
            <p className="sub">Counted as it happens. A number far above the days before it (at least {CONFIG.risk.anomaly.factor} times the average) sends an alert.</p>
          </div>
        </div>
        {odd.length > 0 && (
          <div className="alert-strip">
            <div>
              <b>Unusual today</b>
              <span>{odd.map((a) => `${METRIC_LABEL[a.metric]}: ${a.today} (usually ${a.average})`).join(', ')}</span>
            </div>
          </div>
        )}
        <div className="strip">
          {METRICS.map((m) => (
            <div key={m}>
              <small>{METRIC_LABEL[m]}</small>
              <b>{today.values[m]}</b>
            </div>
          ))}
        </div>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Day</th>
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

      <div className="dp">
        <div className="hd">
          <div>
            <h2>Emergency switch</h2>
            <p className="sub">
              When a flood of fake buyers comes, pause checkout for new buyers only. Signed-out visitors and accounts younger than {CONFIG.limits.newAccountDays} days cannot order; everyone else can.
            </p>
          </div>
        </div>
        {switches.map((s) => (
          <div className="adm-card" key={s.key}>
            <b>{s.label}</b>{' '}
            <span className={s.enabled ? 'chip rose' : 'chip mint'}>
              <i />
              {s.enabled ? 'On, new buyers are stopped' : 'Off'}
            </span>
            {s.reason && <p className="muted">{s.reason}</p>}
            <AdminForm
              endpoint="/api/admin/risk/switch"
              fixed={{ key: s.key, state: s.enabled ? 'off' : 'on' }}
              fields={[{ name: 'reason', label: 'Why (goes in the audit log)', kind: 'textarea', required: true }]}
              submit={s.enabled ? 'Turn it off' : 'Turn it on'}
              openLabel={s.enabled ? 'Turn off' : 'Turn on'}
              tone={s.enabled ? 'line' : 'dark'}
            />
          </div>
        ))}
      </div>

      <div className="dp">
        <div className="hd">
          <div>
            <h2>Orders waiting for a safety check ({holds.length})</h2>
            <p className="sub">
              Paid orders from a flagged buyer, or from an account under {CONFIG.limits.newAccountDays} days paying {money((await getSettings()).holdNewBuyerMinCents)} or more. The money is in escrow.
              The seller cannot start and no file is released until you decide. Release lets it go ahead; cancel refunds the buyer from escrow.
            </p>
          </div>
        </div>
        {holds.length === 0 && <p className="muted">Nothing is waiting.</p>}
        {holds.map((h) => (
          <div className="adm-card" key={h.orderId}>
            <b>{h.title || 'Order'}</b>{' '}
            <small className="muted">
              {money(h.priceCents)} · {h.orderId.slice(0, 8)} · {new Date(h.createdAt).toISOString().slice(0, 16).replace('T', ' ')} UTC
            </small>
            <p>{h.reason}</p>
            <AdminForm
              endpoint={`/api/admin/risk/holds/${h.orderId}/decide`}
              fields={[
                {
                  name: 'decision',
                  label: 'Decision',
                  kind: 'select',
                  options: [
                    ['release', 'Release: work and files go ahead'],
                    ['cancel', 'Cancel and refund the buyer'],
                  ],
                },
                why,
              ]}
              submit="Decide"
              openLabel="Decide"
              tone="dark"
            />
          </div>
        ))}
      </div>

      <div className="dp">
        <div className="hd">
          <div>
            <h2>Seller reserve</h2>
            <p className="sub">
              A share of a seller&apos;s earnings kept back for some days after the payout hold, to cover a refund or chargeback that comes late. The site-wide default is {CONFIG.reserve.percent}{' '}
              percent for {CONFIG.reserve.days} days ({CONFIG.reserve.percent === 0 ? 'off' : 'on'}). Set a different rule for one seller below.
            </p>
          </div>
        </div>
        {rules.length === 0 && <p className="muted">No seller has their own rule.</p>}
        {rules.map((r) => (
          <div className="adm-card" key={r.sellerId}>
            <b>{r.sellerId.slice(0, 8)}</b>{' '}
            <small className="muted">
              {r.percent} percent for {r.days} days
            </small>
            <p>{r.note}</p>
            <AdminForm endpoint="/api/admin/risk/reserve" fixed={{ sellerId: r.sellerId, remove: true }} fields={[why]} submit="Back to the default" openLabel="Remove the rule" tone="line" />
          </div>
        ))}
        <div className="adm-card">
          <b>Set a rule for a seller</b>
          <AdminForm
            endpoint="/api/admin/risk/reserve"
            fields={[
              { name: 'sellerId', label: 'Seller account id (from the Accounts page)', kind: 'text', required: true },
              { name: 'percent', label: 'Percent kept back (0 to 100)', kind: 'text', required: true },
              { name: 'days', label: 'For how many days (0 to 180)', kind: 'text', required: true },
              why,
            ]}
            submit="Save the rule"
            openLabel="Set a rule"
            tone="dark"
          />
        </div>
      </div>

      <div className="dp">
        <div className="hd">
          <div>
            <h2>Clean up</h2>
            <p className="sub">
              Removing a fake account bans it for good and deletes the reviews and abuse reports it wrote. Orders, chat, downloads and the logs are kept as evidence. An account with a paid order is
              refused: use a dispute or a refund, and remove its reviews with the second form.
            </p>
          </div>
        </div>
        <div className="adm-card">
          <b>Remove a fake account</b>
          <AdminForm
            endpoint="/api/admin/risk/clean"
            fixed={{ what: 'account' }}
            fields={[{ name: 'id', label: 'Account id (from the Accounts page)', kind: 'text', required: true }, why]}
            submit="Remove the account"
            openLabel="Remove an account"
            tone="dark"
          />
        </div>
        <div className="adm-card">
          <b>Remove all reviews by an account</b>
          <AdminForm
            endpoint="/api/admin/risk/clean"
            fixed={{ what: 'reviews_by' }}
            fields={[{ name: 'id', label: 'Account id (from the Accounts page)', kind: 'text', required: true }, why]}
            submit="Remove the reviews"
            openLabel="Remove reviews by an account"
            tone="line"
          />
        </div>
        <div className="adm-card">
          <b>Remove a fake review</b>
          <AdminForm
            endpoint="/api/admin/risk/clean"
            fixed={{ what: 'review' }}
            fields={[{ name: 'id', label: 'Order id of the review', kind: 'text', required: true }, why]}
            submit="Remove the review"
            openLabel="Remove a review"
            tone="line"
          />
        </div>
      </div>
    </DashShell>
  );
}

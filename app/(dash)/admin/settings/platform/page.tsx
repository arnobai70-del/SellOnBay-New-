import type { Metadata } from 'next';
import { AdminForm } from '@/components/AdminForm';
import { examplesAllowed } from '@/lib/exampleMode';
import { DashShell } from '@/components/DashShell';
import { auditList } from '@/lib/admin/audit';
import { allowedHours, barText, getSettings } from '@/lib/settings';
import { CONFIG } from '@/lib/config';
import { MAX_HOURS, hoursText } from '@/lib/deliveryTime';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const metadata: Metadata = { title: 'Settings', robots: { index: false } };
export const dynamic = 'force-dynamic';

const money = (c: number) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0 });
const why = { name: 'reason', label: 'Why (goes in the audit log)', kind: 'textarea' as const, required: true };

export default async function Settings() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/settings/platform', roles: ['admin'], scope: 'super' });
  const s = await getSettings();
  const history = (await auditList(300)).filter((e) => e.action === 'settings_changed').slice(0, 15);
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-settings" title={tx('Settings')}>
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'What is sold, and for how much'} />
            </h2>
            <p className="tag">
              <T
                s={
                  'While the shop opens in small steps, products cost from {v0} to {v1}, with setup help or customisation added. This applies to new and saved listings; a listing already live stays as it is. To open up later, raise the highest price here.'
                }
                v={{ v0: money(s.priceMinCents), v1: money(s.priceMaxCents) }}
              />
            </p>
          </div>
        </div>
        <div className="sob-item">
          <b>
            <T s={'Price range: {v0} to {v1}'} v={{ v0: money(s.priceMinCents), v1: money(s.priceMaxCents) }} />
          </b>
          <AdminForm
            endpoint="/api/admin/settings"
            fields={[
              { name: 'priceMinCents', label: 'Lowest price in dollars', kind: 'text', required: true },
              { name: 'priceMaxCents', label: 'Highest price in dollars (with setup help or customisation)', kind: 'text', required: true },
              why,
            ]}
            submit="Save the range"
            openLabel="Change the range"
            tone="dark"
          />
        </div>
        <div className="sob-item">
          <b>
            <T s={'Safety check from {v0}'} v={{ v0: s.holdNewBuyerMinCents ? money(s.holdNewBuyerMinCents) : 'never' }} />
          </b>
          <p className="muted">
            <T s={'A paid order from an account under a week old, of this size or more, waits for an admin before the seller starts. 0 turns it off.'} />
          </p>
          <AdminForm
            endpoint="/api/admin/settings"
            fields={[{ name: 'holdNewBuyerMinCents', label: 'Size in dollars (0 = never)', kind: 'text', required: true }, why]}
            submit="Save"
            openLabel="Change it"
            tone="line"
          />
        </div>
        <div className="sob-item">
          <b>
            <T s={'Early access bar:'} />{' '}
            <span className={s.earlyAccessOn ? 'status st-ok' : 'status'}>
              <i />
              {s.earlyAccessOn ? 'On' : 'Off'}
            </span>
          </b>
          <p className="muted">
            <T s={'Shown on top of every page: “{v0}”'} v={{ v0: barText(s) }} />
          </p>
          <AdminForm
            endpoint="/api/admin/settings"
            fields={[
              {
                name: 'earlyAccessOn',
                label: 'The bar',
                kind: 'select',
                options: [
                  ['on', 'Show it'],
                  ['off', 'Hide it'],
                ],
              },
              { name: 'earlyAccessText', label: 'Own words (empty = the standard words with the price range)', kind: 'text' },
              why,
            ]}
            submit="Save"
            openLabel="Change the bar"
            tone="line"
          />
        </div>
        <div className="sob-item" data-delivery-hours>
          <b>
            <T s={'Delivery in hours:'} />{' '}
            <span className={s.deliveryHoursOn ? 'status st-ok' : 'status'}>
              <i />
              {s.deliveryHoursOn ? 'On' : 'Off'}
            </span>
          </b>
          <p className="muted">
            <T
              s={
                '{v0}, or {minDays} to {maxDays} days. The timer starts when the buyer pays. A listing that already promises hours keeps them when a choice is removed here; an admin can set any time on one listing from its edit page.'
              }
              v={{
                v0: s.deliveryHoursOn ? `Sellers can promise ${allowedHours(s).map(hoursText).join(', ')}` : 'Sellers promise whole days only',
                minDays: CONFIG.delivery.minDays,
                maxDays: CONFIG.delivery.maxDays,
              }}
            />
          </p>
          <AdminForm
            endpoint="/api/admin/settings"
            fields={[
              {
                name: 'deliveryHoursOn',
                label: 'Delivery in hours',
                kind: 'select',
                options: [
                  ['on', 'Sellers may promise hours'],
                  ['off', 'Whole days only'],
                ],
              },
              {
                name: 'deliveryHourChoices',
                label: `Hour choices, separated by commas (${CONFIG.deliveryHours.minHours} to ${MAX_HOURS}, at most ${CONFIG.deliveryHours.maxChoices})`,
                kind: 'text',
                value: s.deliveryHourChoices,
                showWhen: { field: 'deliveryHoursOn', equals: 'on' },
              },
              why,
            ]}
            submit="Save"
            openLabel="Change the hours"
            tone="line"
          />
        </div>
        <div className="sob-item" data-examples>
          <b>
            <T s={'Example listings:'} />{' '}
            <span className={s.showExamples ? 'status st-ok' : 'status'}>
              <i />
              {s.showExamples ? 'Shown' : examplesAllowed() ? 'Hidden' : 'Removed'}
            </span>
          </b>
          <p className="muted">
            <T
              s={
                'The made-up starter products and developer profiles that show how the shop works. They are marked Example, have no ratings or sales, and cannot be bought. Hide them once real sellers have listed enough. On a live site with a database they are always removed, so there is nothing to switch.'
              }
            />
          </p>
          {examplesAllowed() && (
            <AdminForm
              endpoint="/api/admin/settings"
              fields={[
                {
                  name: 'showExamples',
                  label: 'Example listings',
                  kind: 'select',
                  options: [
                    ['on', 'Show them'],
                    ['off', 'Hide them'],
                  ],
                },
                why,
              ]}
              submit="Save"
              openLabel="Change it"
              tone="line"
            />
          )}
        </div>
      </div>
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Recent changes'} />
            </h2>
          </div>
        </div>
        {history.length === 0 && (
          <p className="muted">
            <T s={'Nothing has been changed yet. The standard values are in use.'} />
          </p>
        )}
        <ul className="sob-list">
          {history.map((e, i) => (
            <li key={i}>
              <div className="sob-grow">
                <b>{e.targetRef}</b>
                <small>
                  {JSON.stringify((e.detail as { to?: unknown })?.to ?? {})} · {String((e.detail as { reason?: string })?.reason ?? '')}
                </small>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </DashShell>
  );
}

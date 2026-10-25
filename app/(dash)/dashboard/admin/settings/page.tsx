import type { Metadata } from 'next';
import { AdminForm } from '@/components/AdminForm';
import { examplesAllowed } from '@/lib/exampleMode';
import { DashShell } from '@/components/DashShell';
import { auditList } from '@/lib/admin/audit';
import { barText, getSettings } from '@/lib/settings';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Settings', robots: { index: false } };
export const dynamic = 'force-dynamic';

const money = (c: number) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0 });
const why = { name: 'reason', label: 'Why (goes in the audit log)', kind: 'textarea' as const, required: true };

export default async function Settings() {
  const viewer = await requireViewer({ path: '/dashboard/admin/settings', roles: ['admin'] });
  const s = await getSettings();
  const history = (await auditList(300)).filter((e) => e.action === 'settings_changed').slice(0, 15);
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-settings" title="Settings">
      <div className="dp">
        <div className="hd">
          <div>
            <h2>What is sold, and for how much</h2>
            <p className="sub">
              While the shop opens in small steps, products cost from {money(s.priceMinCents)} to {money(s.priceMaxCents)}, with setup help or customisation added. This applies to new and saved
              listings; a listing already live stays as it is. To open up later, raise the highest price here.
            </p>
          </div>
        </div>
        <div className="adm-card">
          <b>
            Price range: {money(s.priceMinCents)} to {money(s.priceMaxCents)}
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
        <div className="adm-card">
          <b>Safety check from {s.holdNewBuyerMinCents ? money(s.holdNewBuyerMinCents) : 'never'}</b>
          <p className="muted">A paid order from an account under a week old, of this size or more, waits for an admin before the seller starts. 0 turns it off.</p>
          <AdminForm
            endpoint="/api/admin/settings"
            fields={[{ name: 'holdNewBuyerMinCents', label: 'Size in dollars (0 = never)', kind: 'text', required: true }, why]}
            submit="Save"
            openLabel="Change it"
            tone="line"
          />
        </div>
        <div className="adm-card">
          <b>
            Early access bar:{' '}
            <span className={s.earlyAccessOn ? 'chip mint' : 'chip'}>
              <i />
              {s.earlyAccessOn ? 'On' : 'Off'}
            </span>
          </b>
          <p className="muted">Shown on top of every page: &ldquo;{barText(s)}&rdquo;</p>
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
        <div className="adm-card" data-examples>
          <b>
            Example listings:{' '}
            <span className={s.showExamples ? 'chip mint' : 'chip'}>
              <i />
              {s.showExamples ? 'Shown' : examplesAllowed() ? 'Hidden' : 'Removed'}
            </span>
          </b>
          <p className="muted">
            The made-up starter products and developer profiles that show how the shop works. They are marked Example, have no ratings or sales, and cannot be bought. Hide them once real sellers have
            listed enough. On a live site with a database they are always removed, so there is nothing to switch.
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
      <div className="dp">
        <div className="hd">
          <div>
            <h2>Recent changes</h2>
          </div>
        </div>
        {history.length === 0 && <p className="muted">Nothing has been changed yet. The standard values are in use.</p>}
        <ul className="lst">
          {history.map((e, i) => (
            <li key={i}>
              <div className="grow">
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

import { SellForm } from '@/components/SellForm';
import { hasDeliveryHours } from '@/lib/catalog';
import { CONFIG } from '@/lib/config';
import { flags } from '@/lib/flags';
import { usd } from '@/lib/glass/orderStatus';
import { hasTags } from '@/lib/listingTagsStore';
import { sellerPlan } from '@/lib/plans/service';
import { allowedHours, getSettings } from '@/lib/settings';
import { supabaseConfigured } from '@/lib/supabase/env';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
/*
 * "Upload a new website" of design-reference/seller-websites.html: the wizard's steps, the one listing form every seller uses (SellForm, with its
 * own check step, drafts and edits through ?draft= and ?edit=) and the reviewer's checklist beside it. Server component.
 */
export async function UploadSection({ viewer, editing = false }: { viewer: { id: string; role: string } | null; editing?: boolean }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const lim = await getSettings();
  const plan = viewer?.role === 'seller' ? (await sellerPlan(viewer.id)).plan : null;
  const checks = [
    'Live demo works',
    'Frontend + backend files',
    'Database schema included',
    'Setup guide included',
    `Price at least ${usd(Math.max(lim.priceMinCents, CONFIG.sale.priceMinCents))}`,
    'No copied brand assets',
  ];
  return (
    <section id="upload" className="glass card" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="row">
        <h2>{editing ? 'Edit your website' : 'Upload a new website'}</h2>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          {['Details', 'Files', 'Checklist', 'Review'].map((s, i) => (
            <span key={s} className={i < 2 ? 'stp on' : 'stp'}>
              <b>{i + 1}</b> {s}
            </span>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '999 1 420px', minWidth: 0 }}>
          <SellForm
            embedded
            live={supabaseConfigured}
            trialEnabled={flags.trialCopy}
            sampleEnabled={flags.freeSample}
            minPrice={lim.priceMinCents / 100}
            maxPrice={lim.priceMaxCents / 100}
            hourChoices={(await hasDeliveryHours()) ? allowedHours(lim) : []}
            commissionBps={plan?.commissionBps ?? undefined}
            planName={plan?.name ?? undefined}
            tagsEnabled={await hasTags()}
          />
        </div>
        <aside style={{ flex: '1 1 260px', padding: 18, borderRadius: 16, background: 'rgba(255,255,255,.7)', border: '1px solid #DCE7EC' }} aria-label={tx('Reviewer checklist')}>
          <div style={{ fontWeight: 500, marginBottom: 6 }}>
            <T s={'Reviewer checklist'} />
          </div>
          <div className="tag" style={{ margin: '0 0 8px' }}>
            <T s={'A person checks these before your website goes live'} />
          </div>
          {checks.map((c) => (
            <div key={c} className="ck">
              <i style={{ background: '#3F8F77' }} aria-hidden="true">
                ✓
              </i>
              {c}
            </div>
          ))}
        </aside>
      </div>
    </section>
  );
}

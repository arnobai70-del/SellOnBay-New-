import type { Metadata } from 'next';
import { GlassCard } from '@/components/glass/GlassCard';
import { SellerShell } from '@/components/glass/SellerShell';
import { SellForm } from '@/components/SellForm';
import { hasDeliveryHours } from '@/lib/catalog';
import { CONFIG } from '@/lib/config';
import { flags } from '@/lib/flags';
import { usd } from '@/lib/glass/orderStatus';
import { hasTags } from '@/lib/listingTagsStore';
import { sellerPlan } from '@/lib/plans/service';
import { allowedHours, getSettings } from '@/lib/settings';
import { supabaseConfigured } from '@/lib/supabase/env';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Upload a website', robots: { index: false } };
export const dynamic = 'force-dynamic';

/*
 * The upload wizard: the one listing form every seller uses (SellForm, with its own check step, drafts and edits through ?draft= and ?edit=),
 * inside the seller dashboard, with the reviewer's checklist beside it. /sell/new keeps working with the same form.
 */
export default async function UploadWebsite({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const viewer = await requireViewer({ path: '/dashboard/seller/websites/new', roles: ['seller', 'admin'] });
  const { edit } = await searchParams;
  const lim = await getSettings();
  const plan = viewer?.role === 'seller' ? (await sellerPlan(viewer.id)).plan : null;
  const checks = [
    'Live demo works',
    'Frontend and backend files',
    'Database schema included',
    'Setup guide included',
    `Price at least ${usd(Math.max(lim.priceMinCents, CONFIG.sale.priceMinCents))}`,
    'No copied brand assets',
  ];
  return (
    <SellerShell viewer={viewer} active="websites" title={edit ? 'Edit your website' : 'Upload a website'} subtitle="A person checks every listing before it goes live.">
      <GlassCard as="aside" aria-label="Reviewer checklist">
        <h2>Reviewer checklist</h2>
        <p className="g-tag">We check these before your website goes live</p>
        <ul className="g-checks" style={{ marginTop: 10, paddingLeft: 18, fontSize: 14, lineHeight: 1.8 }}>
          {checks.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </GlassCard>
      <div className="g-sellform">
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
    </SellerShell>
  );
}

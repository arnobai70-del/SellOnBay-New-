import type { Metadata } from 'next';
import { SellForm } from '@/components/SellForm';
import { flags } from '@/lib/flags';
import { supabaseConfigured } from '@/lib/supabase/env';
import { allowedHours, getSettings } from '@/lib/settings';
import { hasDeliveryHours } from '@/lib/catalog';
import { hasTags } from '@/lib/listingTagsStore';
import { requireViewer } from '@/lib/supabase/viewer';
import { sellerPlan } from '@/lib/plans/service';

export const metadata: Metadata = { title: 'List a site' };

export default async function Sell() {
  const viewer = await requireViewer({ path: '/sell/new' });
  const lim = await getSettings();
  const plan = viewer?.role === 'seller' ? (await sellerPlan(viewer.id)).plan : null;
  return (
    <SellForm
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
  );
}

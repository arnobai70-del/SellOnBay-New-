import type { Metadata } from 'next';
import { SellForm } from '@/components/SellForm';
import { flags } from '@/lib/flags';
import { supabaseConfigured } from '@/lib/supabase/env';
import { getSettings } from '@/lib/settings';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'List a site' };

export default async function Sell() {
  await requireViewer({ path: '/sell/new' });
  const lim = await getSettings();
  return <SellForm live={supabaseConfigured} trialEnabled={flags.trialCopy} sampleEnabled={flags.freeSample} minPrice={lim.priceMinCents / 100} maxPrice={lim.priceMaxCents / 100} />;
}

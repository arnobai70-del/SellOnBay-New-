import { DevJoinForm } from '@/components/DevJoinForm';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createAdminClient } from '@/lib/supabase/server';
import { getViewerId, requireViewer } from '@/lib/supabase/viewer';
import { pageMetadata } from '@/lib/seo/pageMeta';
import { pageWords } from '@/lib/seo/pageWords';
import { PageExtras } from '@/components/PageExtras';

export const generateMetadata = () => pageMetadata('/developers/join');
export const dynamic = 'force-dynamic';

export default async function Join() {
  const v = await requireViewer({ path: '/developers/join' });
  let existing: 'live' | 'in_review' | 'rejected' | 'paused' | 'draft' | null = null;
  const uid = await getViewerId();
  if (supabaseConfigured && uid) {
    const { data } = await createAdminClient().from('dev_profiles').select('status').eq('user_id', uid).maybeSingle();
    existing = (data?.status as typeof existing) ?? null;
  }
  const w = await pageWords('/developers/join');
  return (
    <>
      <DevJoinForm heading={w.heading} intro={w.intro ?? ''} defaultName={v?.name && !v.name.includes('@') ? v.name : ''} existing={existing} live={supabaseConfigured} />
      <PageExtras path="/developers/join" />
    </>
  );
}

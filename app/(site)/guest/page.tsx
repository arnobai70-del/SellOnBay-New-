import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { GuestPanel } from '@/components/GuestPanel';
import { getViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Your visit', robots: { index: false, follow: true } };
export const dynamic = 'force-dynamic';

/* The visitor panel (owner, 2026-10-20): a basic dashboard for someone who is not signed in. Signed-in people go to their own dashboard. */
export default async function Guest() {
  const viewer = await getViewer();
  if (viewer) redirect('/dashboard/' + viewer.role);
  return <GuestPanel />;
}

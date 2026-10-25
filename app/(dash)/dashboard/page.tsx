import { redirect } from 'next/navigation';
import { requireViewer } from '@/lib/supabase/viewer';

export const dynamic = 'force-dynamic';

/* /dashboard on its own opens the dashboard of the signed-in person's role (buyers' in demo mode). */
export default async function Dashboard() {
  const viewer = await requireViewer({ path: '/dashboard' });
  redirect('/dashboard/' + (viewer?.role ?? 'buyer'));
}

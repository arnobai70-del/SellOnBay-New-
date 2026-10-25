import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DashShell } from '@/components/DashShell';
import { PostEditor } from '@/components/PostEditor';
import { postById } from '@/lib/posts';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Write a post', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function PostPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const viewer = await requireViewer({ path: '/dashboard/admin/seo/post' + (id ? `?id=${encodeURIComponent(id)}` : ''), roles: ['admin'] });
  const post = id ? await postById(id) : null;
  if (id && !post) notFound();
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-seo" title={post ? 'Edit the post' : 'Write a post'}>
      <div className="dp">
        <PostEditor key={post?.id ?? 'new'} post={post} siteUrl={SITE_URL} siteName={SITE_NAME} />
      </div>
    </DashShell>
  );
}

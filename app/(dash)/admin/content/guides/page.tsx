import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminShell } from '@/components/glass/AdminShell';
import { Button } from '@/components/glass/Button';
import { DataTable } from '@/components/glass/DataTable';
import { GlassCard } from '@/components/glass/GlassCard';
import { StatusPill, type PillTone } from '@/components/glass/StatusPill';
import { shortDate } from '@/lib/glass/orderStatus';
import { allPosts, type Post } from '@/lib/posts';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Guides'), robots: { index: false } });
export const dynamic = 'force-dynamic';

const TONE: Record<Post['status'], [string, PillTone]> = { draft: ['Draft', 'draft'], scheduled: ['Scheduled', 'info'], published: ['Published', 'ok'], unpublished: ['Unpublished', 'wait'] };

/* Admin › Content › Guides (owner, 2026-11-08): every guide with its state; open one to write in the block editor. */
export default async function GuidesAdmin() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/content/guides', roles: ['admin'], scope: 'content' });
  const posts = await allPosts();
  return (
    <AdminShell
      viewer={viewer}
      active="guides"
      title={tx('Guides')}
      subtitle="Write, schedule and publish guides. Every publish is in the audit log."
      actions={
        <Button href="/admin/content/guides/edit">
          <T s={'New guide'} />
        </Button>
      }
    >
      <GlassCard as="section" pad={false} style={{ padding: '14px 8px 4px' }}>
        <DataTable<Post>
          caption="Guides"
          rows={posts}
          rowKey={(p) => p.id}
          empty="No guides yet. Write the first one."
          columns={[
            { key: 'title', label: tx('Title'), cell: (p) => <Link href={`/admin/content/guides/edit?id=${p.id}`}>{p.title}</Link> },
            { key: 'cat', label: tx('Category'), cell: (p) => p.category || '-' },
            { key: 'updated', label: tx('Changed'), cell: (p) => shortDate(p.updatedAt) },
            {
              key: 'state',
              label: tx('State'),
              cell: (p) => (
                <StatusPill tone={TONE[p.status][1]}>
                  {TONE[p.status][0]}
                  {p.status === 'scheduled' && p.publishAt ? ` ${new Date(p.publishAt).toISOString().slice(0, 16).replace('T', ' ')} UTC` : ''}
                </StatusPill>
              ),
            },
          ]}
        />
      </GlassCard>
    </AdminShell>
  );
}

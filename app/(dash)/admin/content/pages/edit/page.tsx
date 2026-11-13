import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AdminShell } from '@/components/glass/AdminShell';
import { PagesEditor } from '@/components/glass/PagesEditor';
import { draftOf, publishedOf } from '@/lib/cms/docStore';
import { EMPTY_DOC, pageByKey, type PageDoc } from '@/lib/content/registry';
import { publicWebsites } from '@/lib/glass/catalog';
import { requireViewer } from '@/lib/supabase/viewer';

import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Edit page'), robots: { index: false } });
export const dynamic = 'force-dynamic';

/* One page in the Pages editor: the draft if there is one, else the published words, else the built-in words. */
export default async function EditPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const viewer = await requireViewer({ path: '/admin/content/pages/edit', roles: ['admin'], scope: 'content' });
  const def = pageByKey((await searchParams).key ?? '');
  if (!def || def.legal) notFound();
  const [draft, published] = await Promise.all([draftOf<PageDoc>(`page:${def.key}`), publishedOf<PageDoc>(`page:${def.key}`, true)]);
  const doc = { ...EMPTY_DOC, ...(draft?.data ?? published?.data ?? {}) };
  // Pages that are not one address are previewed where they show: the top bar and footer on the home page, a listing's words on the first listing.
  const first = def.key === 'website' ? (await publicWebsites())[0] : null;
  const previewPath =
    def.path.startsWith('/') && !def.path.includes('[') ? def.path : def.key === 'website' ? (first ? `/websites/${first.id}` : null) : def.key === 'not-found' ? '/this-page-does-not-exist' : '/';
  return (
    <AdminShell viewer={viewer} active="pages" title={`Edit: ${def.label}`} subtitle="Empty a field to go back to the built-in words.">
      <PagesEditor def={def} initial={doc} previewPath={previewPath} hasDraft={!!draft} />
    </AdminShell>
  );
}

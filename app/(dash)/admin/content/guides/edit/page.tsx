import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AdminShell } from '@/components/glass/AdminShell';
import { GuideEditor, type GuideFields } from '@/components/glass/GuideEditor';
import { allPosts, postById } from '@/lib/posts';
import { requireViewer } from '@/lib/supabase/viewer';

import { getI18n } from '@/lib/i18n/server';
export const metadata: Metadata = { title: 'Edit guide', robots: { index: false } };
export const dynamic = 'force-dynamic';

const CATEGORIES = ['Getting started', 'Buying a website', 'Domains', 'Selling', 'Design', 'Marketing', 'Technology'];

/* The block editor for one guide (or a new one without ?id). Content admins and Super Admins. */
export default async function EditGuide({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/content/guides/edit', roles: ['admin'], scope: 'content' });
  const { id } = await searchParams;
  const p = id ? await postById(id) : null;
  if (id && !p) notFound();
  const used = [...new Set((await allPosts()).map((x) => x.category).filter(Boolean))];
  const initial: GuideFields = {
    id: p?.id ?? null,
    title: p?.title ?? '',
    slug: p?.slug ?? '',
    excerpt: p?.excerpt ?? '',
    metaTitle: p?.metaTitle ?? '',
    metaDescription: p?.metaDescription ?? '',
    coverUrl: p?.coverUrl ?? '',
    coverAlt: p?.coverAlt ?? '',
    ogImage: p?.ogImage ?? '',
    canonical: p?.canonical ?? '',
    category: p?.category ?? '',
    tags: p?.tags ?? [],
    author: p?.author ?? viewer?.name ?? '',
    noindex: p?.noindex ?? false,
    status: p?.status ?? 'draft',
    publishAt: p?.publishAt ? new Date(p.publishAt).toISOString().slice(0, 16) : '',
    bodyJson: p?.bodyJson ?? null,
    bodyHtml: p?.bodyHtml || '',
  };
  return (
    <AdminShell viewer={viewer} active="guides" title={p ? tx('Edit guide') : tx('New guide')} subtitle="Type / for a block. Alt+Up and Alt+Down move a block. It saves by itself.">
      <GuideEditor initial={initial} categories={[...new Set([...CATEGORIES, ...used])]} />
    </AdminShell>
  );
}

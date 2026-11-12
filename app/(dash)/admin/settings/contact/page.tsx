import type { Metadata } from 'next';
import { AdminShell } from '@/components/glass/AdminShell';
import { ContactSocialEditor } from '@/components/glass/ContactSocialEditor';
import { contactRoutes, savedSocial } from '@/lib/site/contentStore';
import { requireViewer } from '@/lib/supabase/viewer';

import { getI18n } from '@/lib/i18n/server';
export const metadata: Metadata = { title: 'Contact and social', robots: { index: false } };
export const dynamic = 'force-dynamic';

/* Admin › Settings › Contact & social (owner, 2026-11-08). Super Admin; every change is in the audit log. */
export default async function ContactSocial() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/settings/contact', roles: ['admin'], scope: 'super' });
  const [routes, social] = await Promise.all([contactRoutes(0), savedSocial(0)]);
  return (
    <AdminShell viewer={viewer} active="settings" title={tx('Contact & social')} subtitle="Where email goes, and the social links on the site">
      <ContactSocialEditor routes={routes} social={social} />
    </AdminShell>
  );
}

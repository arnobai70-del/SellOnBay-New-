import type { Metadata } from 'next';
import Link from 'next/link';
import { SellerShell } from '@/components/glass/SellerShell';
import { UploadSection } from '@/components/glass/UploadSection';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
export const metadata: Metadata = { title: 'Upload a website', robots: { index: false } };
export const dynamic = 'force-dynamic';

/* The upload wizard on its own page (edits and drafts open here with ?edit= and ?draft=), the same section as on My websites. /sell/new keeps working. */
export default async function UploadWebsite({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const viewer = await requireViewer({ path: '/dashboard/seller/websites/new', roles: ['seller', 'admin'] });
  const { edit } = await searchParams;
  return (
    <SellerShell viewer={viewer} active="websites" file="seller-websites" title={edit ? 'Edit your website' : 'Upload a website'} head={false}>
      <div className="row">
        <div>
          <h1>{edit ? 'Edit your website' : 'Upload a website'}</h1>
          <div className="tag">
            <T s={'A person checks every listing before it goes live. A change to a link or a file sends it back for review.'} />
          </div>
        </div>
        <Link className="btn ghost" href="/dashboard/seller/websites" prefetch={false}>
          <T s={'My websites'} />
        </Link>
      </div>
      <UploadSection viewer={viewer} editing={!!edit} />
    </SellerShell>
  );
}

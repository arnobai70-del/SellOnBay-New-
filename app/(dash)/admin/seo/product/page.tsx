import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashShell } from '@/components/DashShell';
import { ProductEditForm } from '@/components/ProductEditForm';
import { productForEdit } from '@/lib/admin/productEdit';
import { catsFor, type Platform } from '@/lib/apps';
import { CONFIG } from '@/lib/config';
import { MAX_HOURS } from '@/lib/deliveryTime';
import { LICENCE_TYPES, LICENCES } from '@/lib/licences';
import { WEB_CATS, webCatLabel } from '@/lib/webCategories';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Edit a listing'), robots: { index: false } });
export const dynamic = 'force-dynamic';

/* An admin edits a seller's listing: words, category, price, delivery, links, extras and screenshots. Its page settings (search, picture, questions) are on its Edit page. */
export default async function EditProduct({ searchParams }: { searchParams: Promise<{ slug?: string }> }) {
  const { slug = '' } = await searchParams;
  const viewer = await requireViewer({ path: `/admin/seo/product?slug=${encodeURIComponent(slug)}`, roles: ['admin'], scope: 'catalog' });
  const p = await productForEdit(slug);
  if (!p) notFound();
  const categories = p.platform === 'web' ? WEB_CATS : catsFor(p.platform as Platform);
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-seo" title={p.name}>
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>{p.name}</h2>
            <p className="tag">
              <T
                s={
                  'Status: {status}. Orders already placed keep the price and promise they were made under; a change here applies to new orders. The private code link, licence and owner cannot be changed here.'
                }
                v={{ status: p.status }}
              />
            </p>
          </div>
          <div className="sob-acts">
            <Link className="btn sm" href={`/admin/seo/pages/edit?path=${encodeURIComponent(`/product/${p.slug}`)}`}>
              <T s={'Search, picture and questions'} />
            </Link>
            <Link className="btn ghost sm" href={`/product/${p.slug}`}>
              <T s={'Open the listing'} />
            </Link>
          </div>
        </div>
        <ProductEditForm
          v={{
            slug: p.slug,
            platform: p.platform,
            name: p.name,
            category: p.platform === 'web' ? webCatLabel(p.category) : p.category,
            desc: p.description,
            includes: (p.includes ?? []).join('\n'),
            price: p.price_cents / 100,
            days: p.delivery_days,
            hours: p.delivery_hours === undefined ? undefined : p.delivery_hours ? String(p.delivery_hours) : '',
            demo: p.demo_url === 'about:blank' ? '' : p.demo_url,
            sample: p.sample_url ?? '',
            docsUrl: p.docs_url ?? '',
            requirements: p.requirements ?? '',
            express: p.express_price_cents ? String(p.express_price_cents / 100) : '',
            setupPrice: p.setup_price_cents / 100,
            customPrice: p.custom_price_cents / 100,
            supportDays: p.support_days,
            updateDays: p.update_days,
            codeUrl: p.code_url && p.code_url !== 'about:blank' ? p.code_url : '',
            licenceType: p.licence_type ?? 'single_project',
          }}
          categories={categories}
          setupOptions={CONFIG.packages.setupCents.map((c) => c / 100)}
          customOptions={CONFIG.packages.customCents.map((c) => c / 100)}
          periods={[...CONFIG.listing.periodDays]}
          licences={LICENCE_TYPES.map((t) => [t, LICENCES[t].label] as [string, string])}
          shots={p.app_shots ?? []}
          maxHours={MAX_HOURS}
          maxShots={CONFIG.listing.maxShots}
        />
      </div>
    </DashShell>
  );
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { deliveryOf } from '@/lib/apps';
import { visibleProduct } from '@/lib/catalog';
import { deliveryText } from '@/lib/deliveryTime';
import { requireViewer } from '@/lib/supabase/viewer';
import { mayBuy } from '@/lib/accounts';
import { BuyersOnly } from '@/components/BuyersOnly';
import { RequestForm } from '@/components/RequestForm';
import { requestableProblem, requestableProduct } from '@/lib/requests/products';
import { supabaseConfigured } from '@/lib/supabase/env';

export const metadata: Metadata = { title: 'Request to buy', robots: { index: false } };
export const dynamic = 'force-dynamic';

/*
 * Every new purchase starts here, with a purchase request (owner decision D-E). The address stays /checkout?id=<listing> so links and the
 * visitor analytics that count clicks on it keep working; robots.txt already keeps it out of search. Nothing is paid on this page.
 */
export default async function RequestToBuy({ searchParams }: { searchParams: Promise<{ id?: string; pkg?: string }> }) {
  const { id, pkg } = await searchParams;
  const viewer = await requireViewer({ path: '/checkout?' + new URLSearchParams(Object.entries({ id, pkg }).filter(([, v]) => v) as [string, string][]).toString() });
  if (viewer && !mayBuy(viewer.role)) return <BuyersOnly role={viewer.role} />;
  const shown = id ? await visibleProduct(id) : null;
  if (!shown) notFound();
  const p = shown.product;
  const rp = supabaseConfigured ? await requestableProduct(p.id) : null;
  const problem = supabaseConfigured ? requestableProblem(rp) : 'Requests need an account. There are no accounts in demo mode.';
  const dv = deliveryOf(p);
  return (
    <div className="wrap" data-request-page>
      <div className="page-head" style={{ paddingBottom: 20 }}>
        <h1>Request to buy {p.name}</h1>
        <p className="muted">
          Tell SellOnBay what you need. We check it and send you a quotation. You pay only after you accept it, and your files are released after the payment is verified and approved.
        </p>
      </div>
      {problem || !rp ? (
        <p className="note warn" role="note">
          <span>{problem ?? 'This product is not available.'}</span>
        </p>
      ) : (
        <RequestForm
          initialPkg={pkg === 'setup' || pkg === 'custom' ? pkg : 'asis'}
          p={{
            slug: rp.slug,
            name: rp.name,
            priceCents: rp.priceCents,
            setupCents: rp.setupCents,
            customCents: rp.customCents,
            expressCents: rp.expressHelps ? rp.expressCents : null,
            delivery: deliveryText({ days: rp.deliveryDays, hours: rp.deliveryHours }) + ' after release approval',
            needsDomain: dv === null || dv === 'host',
            needsAppName: dv === 'store' || dv === 'installer' || dv === 'host',
            needsOses: dv === 'installer',
            needsGithub: rp.deliveryType === 'repo_access',
          }}
        />
      )}
    </div>
  );
}

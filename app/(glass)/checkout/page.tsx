import type { Metadata } from 'next';
import { priceDisplays } from '@/lib/prices/service';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BuyersOnly } from '@/components/BuyersOnly';
import { GlassCard } from '@/components/glass/GlassCard';
import { RequestForm } from '@/components/RequestForm';
import { mayBuy } from '@/lib/accounts';
import { deliveryOf } from '@/lib/apps';
import { betaEligible, BETA_CART_LIMIT } from '@/lib/beta/rules';
import { productRecord, visibleProduct } from '@/lib/catalog';
import { REVIEW_HOURS } from '@/lib/config';
import { deliveryText } from '@/lib/deliveryTime';
import { examplesBuyable } from '@/lib/examples';
import { publicListing } from '@/lib/glass/words';
import { requestableProblem, requestableProduct } from '@/lib/requests/products';
import { getSettings } from '@/lib/settings';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';
import { requireViewer } from '@/lib/supabase/viewer';
import { BetaForm } from './BetaForm';

export const metadata: Metadata = { title: 'Checkout', robots: { index: false } };
export const dynamic = 'force-dynamic';

type Search = { ids?: string; id?: string; pkg?: string };

/* In the free beta: the request form. With payments live: the existing request-and-quotation path, kept behind PAYMENTS_MODE (owner, 2026-11-07). */
export default async function Checkout({ searchParams }: { searchParams: Promise<Search> }) {
  const { ids, id, pkg } = await searchParams;
  const want = [...new Set(String(ids ?? id ?? '').split(','))].filter(Boolean).slice(0, BETA_CART_LIMIT);
  const query = new URLSearchParams(Object.entries({ ids, id, pkg }).filter(([, v]) => v) as [string, string][]).toString();
  const viewer = await requireViewer({ path: '/checkout' + (query ? '?' + query : '') });
  if (viewer && !mayBuy(viewer.role)) return <BuyersOnly role={viewer.role} />;
  const { paymentsMode } = await getSettings();

  if (paymentsMode !== 'beta_free') {
    const shown = want[0] ? await visibleProduct(want[0]) : null;
    if (!shown) notFound();
    const p = shown.product;
    const rp = supabaseConfigured ? await requestableProduct(p.id) : null;
    const problem = supabaseConfigured ? requestableProblem(rp) : 'Requests need an account. There are no accounts in demo mode.';
    const dv = deliveryOf(p);
    return (
      <>
        <div className="g-head">
          <h1>Request to buy {publicListing(p).name}</h1>
          <p className="g-lead">Tell SellOnBay what you need. We check it and send you a quotation. You pay only after you accept it.</p>
        </div>
        {problem || !rp ? (
          <GlassCard>
            <p role="note">{problem ?? 'This product is not available.'}</p>
          </GlassCard>
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
      </>
    );
  }

  const found = await Promise.all(want.map((w) => productRecord(w)));
  const items = found.flatMap((f) => (f && f.status === 'live' && (f.product.sellerId ? betaEligible(f.product) : examplesBuyable()) ? [publicListing(f.product)] : []));
  const prices = await priceDisplays(items).catch(() => new Map()); // a running launch price or sale, shown for information in the beta
  let email = '';
  if (supabaseConfigured) {
    const {
      data: { user },
    } = await (await createClient()).auth.getUser();
    email = user?.email ?? '';
  }
  if (!items.length)
    return (
      <>
        <div className="g-head">
          <h1>Checkout</h1>
        </div>
        <GlassCard>
          <h2>Nothing to request yet</h2>
          <p className="g-muted" style={{ marginTop: 8, fontSize: 14 }}>
            Add a website that is free during beta to your cart first. <Link href="/websites">Browse websites</Link>
          </p>
        </GlassCard>
      </>
    );
  return (
    <>
      <div className="g-head">
        <h1>Checkout</h1>
      </div>
      <div className="g-layout-buy">
        <GlassCard as="section" rise={false}>
          <h2>Your details</h2>
          <div style={{ marginTop: 14 }}>
            <BetaForm ids={items.map((i) => i.id)} name={viewer?.name ?? ''} email={email} />
          </div>
        </GlassCard>
        <div className="g-stack g-sticky">
          <GlassCard as="section" rise={false}>
            <h2>Your request</h2>
            {items.map((i) => (
              <div key={i.id} className="g-li">
                <span style={{ flex: 1, fontSize: 14 }}>
                  {i.name}
                  <span className="g-tag" style={{ display: 'block' }}>
                    Standard licence
                  </span>
                  {i.dbId && prices.get(i.dbId)?.note && (
                    <span className="g-tag" style={{ display: 'block' }}>
                      {prices.get(i.dbId)!.note}
                    </span>
                  )}
                </span>
                <s className="g-muted">${i.price}</s>
              </div>
            ))}
            <div className="g-li">
              <b style={{ flex: 1, fontWeight: 500 }}>Total</b>
              <b style={{ fontWeight: 500 }}>$0.00</b>
            </div>
          </GlassCard>
          <GlassCard as="section" rise={false}>
            <h2>What happens next</h2>
            <ol className="g-list" style={{ paddingLeft: 18, listStyle: 'decimal' }}>
              <li>We review your request and email you.</li>
              <li>Once approved, you get the files and the domain steps.</li>
              <li>You have {REVIEW_HOURS} hours to check them and ask for fixes.</li>
              <li>A week later we ask how it went.</li>
            </ol>
          </GlassCard>
        </div>
      </div>
    </>
  );
}

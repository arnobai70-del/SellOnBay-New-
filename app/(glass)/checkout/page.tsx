import type { Metadata } from 'next';
import { priceDisplays } from '@/lib/prices/service';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BuyersOnly } from '@/components/BuyersOnly';
import { PublicFrame } from '@/components/glass/PublicFrame';
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
      <PublicFrame file="checkout">
        <h1 style={{ fontSize: 36, fontWeight: 300, padding: '48px 0 8px' }}>Request to buy {publicListing(p).name}</h1>
        <p className="muted" style={{ margin: '0 0 24px', lineHeight: 1.6 }}>
          Tell SellOnBay what you need. We check it and send you a quotation. You pay only after you accept it.
        </p>
        {problem || !rp ? (
          <div className="glass" style={{ padding: 26 }}>
            <p role="note" style={{ margin: 0 }}>
              {problem ?? 'This product is not available.'}
            </p>
          </div>
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
      </PublicFrame>
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
      <PublicFrame file="checkout">
        <h1 style={{ fontSize: 36, fontWeight: 300, padding: '48px 0 24px' }}>Checkout</h1>
        <div className="glass" style={{ padding: 26 }}>
          <h2 style={{ fontSize: 20 }}>Nothing to request yet</h2>
          <p className="muted" style={{ margin: '8px 0 0', fontSize: 14 }}>
            Add a website that is free during beta to your cart first. <Link href="/websites">Browse websites</Link>
          </p>
        </div>
      </PublicFrame>
    );
  const summary = (
    <>
      {items.map((i, n) => (
        <div key={i.id} style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <span
            style={{ width: 72, height: 54, borderRadius: 10, background: '#F7FAFB', border: '1px solid #E1EBF0', padding: 6, boxSizing: 'border-box', display: 'flex', gap: 4, flex: 'none' }}
            aria-hidden="true"
          >
            <span style={{ width: 12, borderRadius: 3, background: '#EAF1F4' }} />
            <span style={{ flex: 1, borderRadius: 3, background: ['#D3EEE4', '#DDEAF6', '#E6E2F4'][n % 3] }} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 500 }}>{i.name}</div>
            <div className="tag">
              Standard license · by {i.seller}
              {i.dbId && prices.get(i.dbId)?.note ? ` · ${prices.get(i.dbId)!.note}` : ''}
            </div>
          </div>
        </div>
      ))}
      <div style={{ borderTop: '1px solid #DEE8ED', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="row">
          <span className="muted">Websites</span>
          <s className="muted">${items.reduce((s, i) => s + i.price, 0)}</s>
        </div>
        <div className="row">
          <span className="muted">Domain</span>
          <span>Checked by hand</span>
        </div>
        <div className="row">
          <span className="muted">Escrow protection</span>
          <span>Included</span>
        </div>
      </div>
      <div className="row" style={{ borderTop: '1px solid #DEE8ED', paddingTop: 14, fontSize: 18 }}>
        <span>Total</span>
        <span style={{ fontWeight: 500 }}>$0.00</span>
      </div>
    </>
  );
  return (
    <PublicFrame file="checkout">
      <h1 style={{ fontSize: 36, fontWeight: 300, padding: '48px 0 24px' }}>Checkout</h1>
      <BetaForm
        ids={items.map((i) => i.id)}
        name={viewer?.name ?? ''}
        email={email}
        summary={summary}
        steps={['We review your request and email you', 'Once approved, you get the files and the domain steps', `${REVIEW_HOURS} hours to check them and ask for fixes`, 'A week later we ask how it went']}
      />
    </PublicFrame>
  );
}

import type { Metadata } from 'next';
import { CheckoutClient } from '@/components/CheckoutClient';
import { findProduct, isPkg } from '@/lib/data';
import { notFound } from 'next/navigation';
import { visibleProduct } from '@/lib/catalog';
import { showExamples } from '@/lib/examples';
import { requireViewer } from '@/lib/supabase/viewer';
import { mayBuy } from '@/lib/accounts';
import { BuyersOnly } from '@/components/BuyersOnly';
import { domainProvider, mayOfferNewDomain } from '@/lib/providers/domain';

export const metadata: Metadata = { title: 'Checkout' };

export default async function Checkout({ searchParams }: { searchParams: Promise<{ id?: string; pkg?: string; domain?: string }> }) {
  const { id, pkg, domain } = await searchParams;
  const viewer = await requireViewer({ path: '/checkout?' + new URLSearchParams(Object.entries({ id, pkg, domain }).filter(([, v]) => v) as [string, string][]).toString() });
  if (viewer && !mayBuy(viewer.role)) return <BuyersOnly role={viewer.role} />;
  const p = (id && (await visibleProduct(id))?.product) || ((await showExamples()) ? findProduct(id) : undefined);
  if (!p) notFound(); // an example that is no longer shown cannot be bought
  return <CheckoutClient p={p} pkg={isPkg(pkg) ? pkg : 'asis'} domain={domain} newDomainsEnabled={mayOfferNewDomain(domainProvider())} />;
}

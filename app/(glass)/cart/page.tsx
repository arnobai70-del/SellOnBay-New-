import type { Metadata } from 'next';
import { CartClient } from './CartClient';
import { PublicFrame } from '@/components/glass/PublicFrame';
import { REVIEW_HOURS } from '@/lib/config';

import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Your cart'), robots: { index: false } });

/* design-reference/cart.html. ?add=<website> puts a website in this browser's cart (the website page's button). */
export default async function Cart({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  const { add } = await searchParams;
  return (
    <PublicFrame file="cart">
      <CartClient add={typeof add === 'string' ? add.slice(0, 200) : undefined} reviewHours={REVIEW_HOURS} />
    </PublicFrame>
  );
}

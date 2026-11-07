import type { Metadata } from 'next';
import { CartClient } from './CartClient';

export const metadata: Metadata = { title: 'Your cart', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function Cart({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  const { add } = await searchParams;
  return (
    <>
      <div className="g-head">
        <h1>Your cart</h1>
      </div>
      <CartClient add={typeof add === 'string' ? add.slice(0, 200) : undefined} />
    </>
  );
}

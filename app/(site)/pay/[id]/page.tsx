import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { PayForm } from '@/components/PayForm';
import { PayPalPay } from '@/components/PayPalPay';
import { paypalConfigured } from '@/lib/providers/payment';
import { canUseDemoPayment } from '@/lib/commerce/demoPaymentPolicy';
import { orderFor } from '@/lib/commerce/access';
import { ManualPayForm } from '@/components/ManualPayForm';
import { orderCode } from '@/lib/payments/rules';
import { attemptsFor, listMethods } from '@/lib/payments/store';

export const metadata: Metadata = { title: 'Pay', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function Pay({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ failed?: string; cancelled?: string; pending?: string }> }) {
  const { id } = await params;
  const q = await searchParams;
  const o = await orderFor(id);
  if (!o) notFound();
  if (o.fundedAt) redirect(`/orders/${id}`);
  const back = o.kind !== 'product' ? `/developers/${o.devKey}` : `/checkout?id=${o.productKey}`;
  // SellOnBay 2.0: an order made from a quotation is paid by a verified method (manual first) and reconciled by Finance; never test cards.
  if (o.quotationId) {
    const methods = await listMethods(true);
    const attempts = await attemptsFor(o.id);
    const received = attempts.filter((a) => a.status === 'reconciled').reduce((s, a) => s + (a.amountReceivedCents ?? 0), 0);
    const due = Math.max(0, o.priceCents - received);
    const words: Record<string, string> = {
      submitted: 'Being checked by Finance',
      reconciled: 'Received',
      rejected: 'Not confirmed',
      expired: 'Expired',
      gateway_pending: 'Waiting for the provider',
      confirmed: 'Confirmed',
      failed: 'Failed',
    };
    return (
      <div className="wrap" style={{ paddingBlock: 40, maxWidth: 760 }} data-manual-pay-page>
        <h1>Pay for {o.title}</h1>
        <p className="muted" style={{ marginTop: 8 }}>
          Total {(o.priceCents / 100).toFixed(2)} {o.currency}
          {received > 0 ? `; received so far ${(received / 100).toFixed(2)}; still due ${(due / 100).toFixed(2)}` : ''}. Your order reference is <b>{orderCode(o.id)}</b>. Your files are released only
          after your payment is verified and SellOnBay approves the release.
        </p>
        {attempts.length > 0 && (
          <ul className="sob-lst" style={{ marginTop: 16 }}>
            {attempts.map((a) => (
              <li key={a.id}>
                <div className="sob-grow">
                  <b>
                    {(a.amountClaimedCents / 100).toFixed(2)} {a.currency}, reference {a.reference}
                  </b>
                  <small>
                    {words[a.status] ?? a.status}
                    {a.status === 'rejected' && a.reviewNote ? `: ${a.reviewNote}` : ''}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        )}
        {o.state === 'payment_review' ? (
          <p className="note" role="status" style={{ marginTop: 16 }}>
            <span>Finance is checking your payment. You will be told as soon as it is confirmed.</span>
          </p>
        ) : (
          <div style={{ marginTop: 16 }}>
            <ManualPayForm
              orderId={o.id}
              methods={methods.map((m) => ({ id: m.id, label: m.label, kind: m.kind, instructions: m.instructions, currency: m.currency }))}
              dueCents={due}
              code={orderCode(o.id)}
            />
          </div>
        )}
      </div>
    );
  }
  if (!canUseDemoPayment(o) && paypalConfigured()) {
    const notice = q.failed
      ? 'The payment did not go through. Nothing was kept from you unless PayPal shows a charge. Please try again.'
      : q.pending
        ? 'Your payment is being confirmed. Refresh this page in a minute.'
        : q.cancelled
          ? 'You cancelled the payment. Nothing was charged.'
          : undefined;
    return <PayPalPay id={o.id} title={o.title} lines={o.lines} totalCents={o.priceCents} back={back} notice={notice} />;
  }
  if (!canUseDemoPayment(o)) {
    return (
      <div className="wrap" style={{ paddingBlock: 80, maxWidth: 700 }}>
        <h1>Checkout is not available yet</h1>
        <p className="muted" style={{ marginTop: 16 }}>
          This is a real seller or developer order. SellOnBay does not yet have a verified payment provider connected. Test cards cannot be used to pay for real orders, and no money has been
          collected.
        </p>
        <p className="muted" style={{ marginTop: 12 }}>
          Your order is awaiting payment and will not be delivered or funded until a real checkout is available.
        </p>
        <Link href={back} className="btn" style={{ marginTop: 24 }}>
          Return to listing
        </Link>
      </div>
    );
  }
  return <PayForm id={o.id} title={o.title} lines={o.lines} totalCents={o.priceCents} back={back} />;
}

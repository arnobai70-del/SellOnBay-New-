import type { Metadata } from 'next';
import Link from 'next/link';
import { DashShell } from '@/components/DashShell';
import { listRequests } from '@/lib/requests/store';
import { REQUEST_WORDS, productNames, requestTitle } from '@/lib/requests/view';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Your requests', robots: { index: false } };
export const dynamic = 'force-dynamic';

/* A buyer's purchase and custom development requests, newest first. */
export default async function BuyerRequests() {
  const viewer = await requireViewer({ path: '/dashboard/buyer/requests', roles: ['buyer', 'seller'] });
  const list = viewer ? await listRequests({ buyerId: viewer.id }) : [];
  const products = await productNames(list.map((r) => r.productId));
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="buyer" active="buyer-requests" title="Your requests">
      <div className="dp">
        <div className="hd">
          <div>
            <h2>Requests and quotations</h2>
            <p className="sub">Every purchase starts as a request. SellOnBay replies with a question or a quotation; you pay only after you accept a quotation.</p>
          </div>
        </div>
        {!viewer && <p className="muted">Requests need an account. There are no accounts in demo mode.</p>}
        {viewer && list.length === 0 && (
          <p className="muted">
            No requests yet. Open a product and choose <b>Request to buy</b>.
          </p>
        )}
        <ul className="lst" data-requests>
          {list.map((r) => {
            const [word, chip] = REQUEST_WORDS[r.status] ?? [r.status, 'chip'];
            return (
              <li key={r.id}>
                <div className="grow">
                  <b>
                    <Link href={`/dashboard/buyer/requests/${r.id}`}>{requestTitle(r, products)}</Link>
                  </b>
                  <small>Sent {new Date(r.createdAt).toUTCString().slice(0, 16)}</small>
                </div>
                <span className={chip}>
                  <i />
                  {word}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </DashShell>
  );
}

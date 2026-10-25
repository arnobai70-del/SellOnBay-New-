import type { Metadata } from 'next';
import { DeleteAccount } from '@/components/DeleteAccount';
import { myRequests } from '@/lib/privacy';
import { getViewerId, requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Your data', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function YourData() {
  await requireViewer({ path: '/account/privacy' });
  const id = await getViewerId();
  const requests = id ? await myRequests(id) : [];
  const pending = requests.find((r) => r.kind === 'delete' && r.status === 'pending');
  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Your data</h1>
        <p>See what we hold about you, or ask us to delete your account.</p>
      </div>
      <div className="prose" style={{ paddingBottom: 80 }}>
        <h2>Download a copy</h2>
        <p>A file with your profile, orders, messages and the rest of what we hold about you. Other people appear only as ids.</p>
        <p>
          <a className="btn btn-blue" href="/api/account/export" download>
            Download my data
          </a>
        </p>

        <h2>Delete my account</h2>
        <p>
          We remove your name, payout details, developer profile and notifications, and lock the sign-in. Payments, orders and accounting records stay because the law makes us keep them, but they no
          longer point to a named person. You cannot undo this. We cannot delete while an order, a dispute or a payout is still open.
        </p>
        {pending ? <p className="chip amber">We have your request and will process it soon.</p> : <DeleteAccount />}
        {requests.length > 0 && (
          <>
            <h2>Your requests</h2>
            <ul>
              {requests.map((r) => (
                <li key={r.id}>
                  {r.kind === 'export' ? 'Copy of your data' : 'Account deletion'}: {r.status}
                  {r.note ? ` (${r.note})` : ''}, {new Date(r.createdAt).toLocaleDateString('en-US')}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

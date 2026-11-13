import type { Metadata } from 'next';
import { DeleteAccount } from '@/components/DeleteAccount';
import { myRequests } from '@/lib/privacy';
import { getViewerId, requireViewer } from '@/lib/supabase/viewer';

import { getI18n } from '@/lib/i18n/server';
import { T } from '@/components/i18n/T';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Your data'), robots: { index: false } });
export const dynamic = 'force-dynamic';

export default async function YourData() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  await requireViewer({ path: '/account/privacy' });
  const id = await getViewerId();
  const requests = id ? await myRequests(id) : [];
  const pending = requests.find((r) => r.kind === 'delete' && r.status === 'pending');
  return (
    <div className="wrap">
      <div className="sob-page-head">
        <h1>
          <T s={'Your data'} />
        </h1>
        <p>
          <T s={'See what we hold about you, or ask us to delete your account.'} />
        </p>
      </div>
      <div className="sob-prose" style={{ paddingBottom: 80 }}>
        <h2>
          <T s={'Download a copy'} />
        </h2>
        <p>
          <T s={'A file with your profile, orders, messages and the rest of what we hold about you. Other people appear only as ids.'} />
        </p>
        <p>
          <a className="btn" href="/api/account/export" download>
            <T s={'Download my data'} />
          </a>
        </p>

        <h2>
          <T s={'Delete my account'} />
        </h2>
        <p>
          <T
            s={
              'We remove your name, payout details, developer profile and notifications, and lock the sign-in. Payments, orders and accounting records stay because the law makes us keep them, but they no longer point to a named person. You cannot undo this. We cannot delete while an order, a dispute or a payout is still open.'
            }
          />
        </p>
        {pending ? (
          <p className="status st-wait">
            <T s={'We have your request and will process it soon.'} />
          </p>
        ) : (
          <DeleteAccount />
        )}
        {requests.length > 0 && (
          <>
            <h2>
              <T s={'Your requests'} />
            </h2>
            <ul>
              {requests.map((r) => (
                <li key={r.id}>
                  {r.kind === 'export' ? tx('Copy of your data') : tx('Account deletion')}: {r.status}
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

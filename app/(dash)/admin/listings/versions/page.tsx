import type { Metadata } from 'next';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { requireViewer } from '@/lib/supabase/viewer';
import { reviewQueue } from '@/lib/versions';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('New versions'), robots: { index: false } });
export const dynamic = 'force-dynamic';

export default async function Versions() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/listings/versions', roles: ['admin'], scope: 'catalog' });
  const list = await reviewQueue();
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-versions" title={tx('New versions')}>
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Waiting for review ({length})'} v={{ length: list.length }} />
            </h2>
            <p className="tag">
              <T
                s={
                  'A seller published a new version of a live digital product. Open the new files in a sandbox, then approve or reject. Approving tells every buyer whose update period is still running.'
                }
              />
            </p>
          </div>
        </div>
        {list.length === 0 && (
          <p className="muted">
            <T s={'Nothing is waiting.'} />
          </p>
        )}
        {list.map((v) => (
          <div className="sob-item" key={v.id}>
            <b>
              {v.title} {v.version}
            </b>{' '}
            <small className="muted">
              <T s={'{v0} UTC'} v={{ v0: new Date(v.createdAt).toISOString().slice(0, 16).replace('T', ' ') }} />
            </small>
            <p style={{ whiteSpace: 'pre-line' }}>{v.changelog}</p>
            <p>
              <a className="" href={v.fileUrl} target="_blank" rel="noopener noreferrer nofollow">
                <T s={'Open the new files'} />
              </a>
            </p>
            <AdminForm
              endpoint={`/api/admin/versions/${v.id}/decide`}
              openLabel="Decide"
              submit="Save decision"
              tone="dark"
              fields={[
                {
                  name: 'decision',
                  label: tx('Decision'),
                  kind: 'select',
                  options: [
                    ['approve', 'Approve and tell the buyers'],
                    ['reject', 'Reject'],
                  ],
                },
                { name: 'note', label: tx('Note for the seller (needed to reject)'), kind: 'textarea' },
                { name: 'filesChecked', label: tx('I opened the new files in a sandbox and they are clean (needed to approve)'), kind: 'checkbox' },
              ]}
            />
          </div>
        ))}
      </div>
    </DashShell>
  );
}

import type { Metadata } from 'next';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { REVIEW_CHECKLIST } from '@/lib/files/service';
import { legacyCandidates } from '@/lib/files/legacy';
import { listFiles, type FileObject } from '@/lib/files/store';
import { createAdminClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/env';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const metadata: Metadata = { title: 'Source files', robots: { index: false } };
export const dynamic = 'force-dynamic';

const size = (b: number | null) => (b === null ? '?' : b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
type Checks = {
  evidence?: { priorHashes: number; matchesEarlierDownloads: boolean | null; needsEvidenceReview: boolean };
  problems?: string[];
  secrets?: { file: string; kind: string; line?: number }[];
  files?: number;
  twins?: (string | null)[];
};

function Facts({ f, names }: { f: FileObject; names: Map<string, string> }) {
  const c = f.checks as Checks;
  return (
    <small>
      {names.get(f.productId ?? '') ?? 'Listing'} · {f.originalName} · {size(f.sizeBytes ?? f.declaredSize)}
      {c.files !== undefined ? ` · ${c.files} files` : ''}
      {f.sha256 ? ` · SHA-256 ${f.sha256.slice(0, 16)}…` : ''}
      {f.scanVerdict ? ` · earlier scan: ${f.scanVerdict} (${f.scanProvider ?? '?'})` : ''}
    </small>
  );
}

/* Catalog reviews uploaded source files. Nothing is approved without every checklist item. The files are NOT malware-scanned (owner decision 2026-10-29). */
export default async function Files() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/listings/files', roles: ['admin'], scope: 'catalog' });
  const files = await listFiles({ states: ['awaiting_review', 'checking', 'failed_checks', 'rejected'] });
  const names = new Map<string, string>();
  if (supabaseConfigured) {
    const ids = [...new Set(files.map((f) => f.productId).filter(Boolean))] as string[];
    if (ids.length) for (const p of (await createAdminClient().from('products').select('id, name').in('id', ids)).data ?? []) names.set(p.id, p.name);
  }
  const review = files.filter((f) => f.state === 'awaiting_review');
  const checking = files.filter((f) => f.state === 'checking');
  const failed = files.filter((f) => f.state === 'failed_checks' || f.state === 'rejected').slice(0, 30);
  const legacy = await legacyCandidates();
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-files" title={tx('Source files')}>
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Waiting for review ({length})'} v={{ length: review.length }} />
            </h2>
            <p className="tag">
              <T s={'These passed the archive and credential checks.'} />
            </p>
            <p className="sob-err" data-not-scanned>
              <T s={'Not scanned for malware (owner decision, security risk accepted). Open them only in an isolated sandbox, run them there, then decide.'} />
            </p>
          </div>
        </div>
        {review.length === 0 && (
          <p className="muted">
            <T s={'Nothing waiting.'} />
          </p>
        )}
        <ul className="sob-list">
          {review.map((f) => {
            const c = f.checks as Checks;
            const twins = (c.twins ?? []).filter(Boolean).length;
            return (
              <li key={f.id} data-file={f.id}>
                <div className="sob-grow">
                  <b>{f.originalName}</b>
                  <Facts f={f} names={names} />
                  {c.evidence?.needsEvidenceReview && (
                    <small className="sob-err">
                      <T
                        s={
                          'Legacy file: its bytes {v0} the {priorHashes} file version(s) earlier buyers downloaded. Review the evidence before approving (F-15); earlier buyers keep the file they had.'
                        }
                        v={{ v0: c.evidence.matchesEarlierDownloads ? 'match only some of' : 'do not match', priorHashes: c.evidence.priorHashes }}
                      />
                    </small>
                  )}
                  {twins > 0 && (
                    <small className="sob-err">
                      <T s={'The same bytes are already approved for {twins} other listing(s). Check this is not a copied product.'} v={{ twins }} />
                    </small>
                  )}
                  <AdminForm
                    endpoint={`/api/admin/files/${f.id}`}
                    openLabel="Review"
                    submit="Save decision"
                    tone="line"
                    fields={[
                      {
                        name: 'decision',
                        label: 'Decision',
                        kind: 'select',
                        options: [
                          ['approve', 'Approve this exact file'],
                          ['reject', 'Reject'],
                        ],
                      },
                      ...Object.entries(REVIEW_CHECKLIST).map(([k, label]) => ({ name: k, label, kind: 'checkbox' as const, showWhen: { field: 'decision', equals: 'approve' } })),
                      { name: 'label', label: 'Version label, like 1.0', kind: 'text', showWhen: { field: 'decision', equals: 'approve' } },
                      { name: 'changelog', label: 'What is in this version (shown to buyers)', kind: 'textarea', showWhen: { field: 'decision', equals: 'approve' } },
                      { name: 'note', label: 'Note (needed to reject; sent to the seller)', kind: 'textarea' },
                    ]}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Waiting for checks ({length})'} v={{ length: checking.length }} />
            </h2>
            <p className="tag">
              <T s={'The file could not be read for checking yet. It is tried again by the scheduled job, or now with Check again.'} />
            </p>
          </div>
        </div>
        <ul className="sob-list">
          {checking.map((f) => (
            <li key={f.id}>
              <div className="sob-grow">
                <b>{f.originalName}</b>
                <Facts f={f} names={names} />
                {f.scanDetail && <small>{f.scanDetail}</small>}
                <AdminForm endpoint={`/api/admin/files/${f.id}`} fixed={{ decision: 'retry' }} fields={[]} openLabel="Check again" submit="Run the checks again" tone="line" />
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="glass card sob-sec" data-legacy>
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Legacy listings without a checked file ({length})'} v={{ length: legacy.length }} />
            </h2>
            <p className="tag">
              <T
                s={
                  "These still point at a file on the seller's own host. Importing fetches it once into quarantine for the full checks; it cannot be requested again until a version is approved. This list is a dry run: nothing changes until you press Import."
                }
              />
            </p>
          </div>
        </div>
        <ul className="sob-list">
          {legacy.map((l) => (
            <li key={l.productId}>
              <div className="sob-grow">
                <b>{l.name}</b>
                <small>
                  <T
                    s={'{host} · {downloads} earlier download(s), {length} distinct file version(s){v3}'}
                    v={{ host: l.host, downloads: l.downloads, length: l.priorHashes.length, v3: l.openImport ? ' · import being checked' : '' }}
                  />
                </small>
                {!l.openImport && <AdminForm endpoint="/api/admin/files/legacy" fixed={{ productId: l.productId }} fields={[]} openLabel="Import" submit="Import and check" tone="line" />}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Not accepted (recent)'} />
            </h2>
            <p className="tag">
              <T s={'Deleted from quarantine 7 days after the decision unless a legal hold applies. The record stays.'} />
            </p>
          </div>
        </div>
        <ul className="sob-list">
          {failed.map((f) => {
            const c = f.checks as Checks;
            return (
              <li key={f.id}>
                <div className="sob-grow">
                  <b>
                    {f.originalName} ({f.state.replace('_', ' ')})
                  </b>
                  <Facts f={f} names={names} />
                  {(c.problems ?? []).slice(0, 4).map((p, i) => (
                    <small key={i}>{p}</small>
                  ))}
                  {(c.secrets ?? []).slice(0, 6).map((s, i) => (
                    <small key={'s' + i}>
                      <T s={'Credential: {kind} in {file}{v2}'} v={{ kind: s.kind, file: s.file, v2: s.line ? `, line ${s.line}` : '' }} />
                    </small>
                  ))}
                  {f.reviewNote && (
                    <small>
                      <T s={'Reviewer: {reviewNote}'} v={{ reviewNote: f.reviewNote }} />
                    </small>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </DashShell>
  );
}

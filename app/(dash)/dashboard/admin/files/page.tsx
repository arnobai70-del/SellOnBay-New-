import type { Metadata } from 'next';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { REVIEW_CHECKLIST } from '@/lib/files/service';
import { legacyCandidates } from '@/lib/files/legacy';
import { listFiles, type FileObject } from '@/lib/files/store';
import { createAdminClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/env';
import { requireViewer } from '@/lib/supabase/viewer';

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
  const viewer = await requireViewer({ path: '/dashboard/admin/files', roles: ['admin'], scope: 'catalog' });
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
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-files" title="Source files">
      <div className="dp">
        <div className="hd">
          <div>
            <h2>Waiting for review ({review.length})</h2>
            <p className="sub">These passed the archive and credential checks.</p>
            <p className="warn-text" data-not-scanned>
              Not scanned for malware (owner decision, security risk accepted). Open them only in an isolated sandbox, run them there, then decide.
            </p>
          </div>
        </div>
        {review.length === 0 && <p className="muted">Nothing waiting.</p>}
        <ul className="lst">
          {review.map((f) => {
            const c = f.checks as Checks;
            const twins = (c.twins ?? []).filter(Boolean).length;
            return (
              <li key={f.id} data-file={f.id}>
                <div className="grow">
                  <b>{f.originalName}</b>
                  <Facts f={f} names={names} />
                  {c.evidence?.needsEvidenceReview && (
                    <small className="warn-text">
                      Legacy file: its bytes {c.evidence.matchesEarlierDownloads ? 'match only some of' : 'do not match'} the {c.evidence.priorHashes} file version(s) earlier buyers downloaded. Review
                      the evidence before approving (F-15); earlier buyers keep the file they had.
                    </small>
                  )}
                  {twins > 0 && <small className="warn-text">The same bytes are already approved for {twins} other listing(s). Check this is not a copied product.</small>}
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
      <div className="dp">
        <div className="hd">
          <div>
            <h2>Waiting for checks ({checking.length})</h2>
            <p className="sub">The file could not be read for checking yet. It is tried again by the scheduled job, or now with Check again.</p>
          </div>
        </div>
        <ul className="lst">
          {checking.map((f) => (
            <li key={f.id}>
              <div className="grow">
                <b>{f.originalName}</b>
                <Facts f={f} names={names} />
                {f.scanDetail && <small>{f.scanDetail}</small>}
                <AdminForm endpoint={`/api/admin/files/${f.id}`} fixed={{ decision: 'retry' }} fields={[]} openLabel="Check again" submit="Run the checks again" tone="line" />
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="dp" data-legacy>
        <div className="hd">
          <div>
            <h2>Legacy listings without a checked file ({legacy.length})</h2>
            <p className="sub">
              These still point at a file on the seller&apos;s own host. Importing fetches it once into quarantine for the full checks; it cannot be requested again until a version is approved. This
              list is a dry run: nothing changes until you press Import.
            </p>
          </div>
        </div>
        <ul className="lst">
          {legacy.map((l) => (
            <li key={l.productId}>
              <div className="grow">
                <b>{l.name}</b>
                <small>
                  {l.host} · {l.downloads} earlier download(s), {l.priorHashes.length} distinct file version(s)
                  {l.openImport ? ' · import being checked' : ''}
                </small>
                {!l.openImport && <AdminForm endpoint="/api/admin/files/legacy" fixed={{ productId: l.productId }} fields={[]} openLabel="Import" submit="Import and check" tone="line" />}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="dp">
        <div className="hd">
          <div>
            <h2>Not accepted (recent)</h2>
            <p className="sub">Deleted from quarantine 7 days after the decision unless a legal hold applies. The record stays.</p>
          </div>
        </div>
        <ul className="lst">
          {failed.map((f) => {
            const c = f.checks as Checks;
            return (
              <li key={f.id}>
                <div className="grow">
                  <b>
                    {f.originalName} ({f.state.replace('_', ' ')})
                  </b>
                  <Facts f={f} names={names} />
                  {(c.problems ?? []).slice(0, 4).map((p, i) => (
                    <small key={i}>{p}</small>
                  ))}
                  {(c.secrets ?? []).slice(0, 6).map((s, i) => (
                    <small key={'s' + i}>
                      Credential: {s.kind} in {s.file}
                      {s.line ? `, line ${s.line}` : ''}
                    </small>
                  ))}
                  {f.reviewNote && <small>Reviewer: {f.reviewNote}</small>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </DashShell>
  );
}

'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

import { T } from '@/components/i18n/T';
import { useTx } from '@/components/i18n/TxProvider';
type Ready = { id: string; name: string };

/*
 * The seller of a work order sends their delivery for release. Files (optional when the product's approved version is what the buyer gets)
 * are uploaded into quarantine and checked first; then the seller sends the delivery with a note. SellOnBay approves the release.
 */
export function DeliveryForm({
  orderId,
  approvedFiles,
  pending,
  revisionId,
}: {
  orderId: string;
  approvedFiles: Ready[];
  pending: number;
  /* Set for revised work on a revision (lib/revisions) instead of the order's first delivery. */
  revisionId?: string;
}) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [fileId, setFileId] = useState(approvedFiles[0]?.id ?? '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function upload() {
    if (!file) return;
    setMsg(null);
    if (!/\.zip$/i.test(file.name)) return setMsg({ ok: false, text: 'Upload one .zip archive.' });
    setBusy('Uploading...');
    const r = await fetch('/api/seller/files', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ order: orderId, purpose: revisionId ? 'revision' : 'delivery', name: file.name, size: file.size }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setBusy('');
      return setMsg({ ok: false, text: j.error ?? 'Could not prepare the upload.' });
    }
    const { error } = await createClient().storage.from('quarantine').uploadToSignedUrl(j.path, j.token, file, { contentType: 'application/zip' });
    if (error) {
      setBusy('');
      return setMsg({ ok: false, text: 'The upload did not finish. Try again.' });
    }
    const c = await fetch(`/api/seller/files/${j.id}/complete`, { method: 'POST' });
    setBusy('');
    if (!c.ok) return setMsg({ ok: false, text: 'Could not start the checks.' });
    setFile(null);
    setMsg({ ok: true, text: 'Uploaded. When the checks and the reviewer approve it, choose it below and send the delivery.' });
    router.refresh();
  }

  async function send() {
    setMsg(null);
    setBusy('Sending...');
    const r = await fetch(revisionId ? `/api/seller/revisions/${revisionId}` : `/api/seller/orders/${orderId}/delivery`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note, fileId }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy('');
    if (!r.ok) return setMsg({ ok: false, text: j.error ?? 'Could not send the delivery.' });
    setMsg({ ok: true, text: 'Sent. SellOnBay checks it and releases it to the buyer.' });
    router.refresh();
  }

  return (
    <div className="sob-form" data-delivery-form={revisionId ? 'revision' : 'delivery'}>
      <label htmlFor={`df-file-${revisionId ?? orderId}`}>
        <T s={'Delivery files (.zip, checked before release)'} />
      </label>
      <div className="sob-acts">
        <input id={`df-file-${revisionId ?? orderId}`} type="file" accept=".zip,application/zip" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button type="button" className="btn ghost sm" disabled={!file || !!busy} onClick={upload}>
          <T s={'Upload for checking'} />
        </button>
      </div>
      {pending > 0 && (
        <small className="muted">
          <T s={'{pending} upload(s) still being checked.'} v={{ pending }} />
        </small>
      )}
      {approvedFiles.length > 0 && (
        <>
          <label htmlFor={`df-pick-${revisionId ?? orderId}`}>
            <T s={'Approved file to deliver'} />
          </label>
          <select id={`df-pick-${revisionId ?? orderId}`} value={fileId} onChange={(e) => setFileId(e.target.value)}>
            <option value="">
              <T s={"None (the product's approved version is what the buyer gets)"} />
            </option>
            {approvedFiles.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </>
      )}
      <label htmlFor={`df-note-${revisionId ?? orderId}`}>
        <T s={'What you delivered (for SellOnBay; for example the address of the live site)'} />
      </label>
      <textarea id={`df-note-${revisionId ?? orderId}`} rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
      <button type="button" className="btn sm" disabled={!!busy || note.trim().length < 10} onClick={send}>
        {busy || tx('Send for release')}
      </button>
      {msg && (
        <p className={msg.ok ? 'sob-note-box' : 'sob-note-box warn'} role={msg.ok ? 'status' : 'alert'}>
          <span>{msg.text}</span>
        </p>
      )}
    </div>
  );
}

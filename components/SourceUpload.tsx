'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Listing = { slug: string; name: string };
const MAX = 500 * 1024 * 1024;

/*
 * A seller sends the source archive of one of their listings. The file goes from the browser straight into private quarantine through a
 * one-time link; then the server checks it (archive rules, credentials, malware scan) and a SellOnBay reviewer looks at it. Nothing is public.
 */
export function SourceUpload({ listings }: { listings: Listing[] }) {
  const router = useRouter();
  const [product, setProduct] = useState(listings[0]?.slug ?? '');
  const [purpose, setPurpose] = useState<'listing' | 'version'>('listing');
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!file || !product) return setMsg({ ok: false, text: 'Choose a listing and a .zip file.' });
    if (!/\.zip$/i.test(file.name)) return setMsg({ ok: false, text: 'Upload one .zip archive.' });
    if (file.size > MAX) return setMsg({ ok: false, text: 'The archive is larger than 500 MB.' });
    setStep('Preparing the upload...');
    const r = await fetch('/api/seller/files', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ product, purpose, name: file.name, size: file.size }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setStep('');
      return setMsg({ ok: false, text: j.error ?? 'Could not prepare the upload.' });
    }
    setStep('Uploading...');
    const { error } = await createClient().storage.from('quarantine').uploadToSignedUrl(j.path, j.token, file, { contentType: 'application/zip' });
    if (error) {
      setStep('');
      return setMsg({ ok: false, text: 'The upload did not finish. Try again.' });
    }
    setStep('Starting the checks...');
    const c = await fetch(`/api/seller/files/${j.id}/complete`, { method: 'POST' });
    const cj = await c.json().catch(() => ({}));
    setStep('');
    if (!c.ok) return setMsg({ ok: false, text: cj.error ?? 'Could not start the checks.' });
    setFile(null);
    setMsg({ ok: true, text: 'Uploaded. The automatic checks run now; you will be told the result, then a reviewer looks at it.' });
    router.refresh();
  }

  if (!listings.length) return <p className="muted">Create a listing first, then upload its source files here.</p>;
  return (
    <form className="upl" onSubmit={send} data-source-upload>
      <div className="upl-row">
        <label htmlFor="su-product">Listing</label>
        <select id="su-product" value={product} onChange={(e) => setProduct(e.target.value)}>
          {listings.map((l) => (
            <option key={l.slug} value={l.slug}>
              {l.name}
            </option>
          ))}
        </select>
        <label htmlFor="su-purpose">This is</label>
        <select id="su-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value as 'listing' | 'version')}>
          <option value="listing">The listing&apos;s files</option>
          <option value="version">A new version</option>
        </select>
      </div>
      <label htmlFor="su-file">Source archive (.zip, up to 500 MB, no passwords or keys inside)</label>
      <input id="su-file" type="file" accept=".zip,application/zip" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <button className="btn btn-blue btn-sm" type="submit" disabled={!!step}>
        {step || 'Upload for checking'}
      </button>
      {msg && (
        <p className={msg.ok ? 'note' : 'note warn'} role={msg.ok ? 'status' : 'alert'}>
          <span>{msg.text}</span>
        </p>
      )}
    </form>
  );
}

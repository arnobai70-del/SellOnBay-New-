import 'server-only';
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { CONFIG } from '../config';
import { type DownloadEvent, clientIp, logDownload } from './service';

// Nothing larger than the file limit is delivered here.
export const MAX_FILE_BYTES = CONFIG.download.maxFileMb * 1024 * 1024;

/*
 * Pass a file through unchanged while counting its bytes and hashing it. The log row is written once: when the last byte has gone out (complete), or
 * when the download stops part way (the buyer cancels, the connection drops, the file is too big or the source fails), with the bytes sent so far.
 * With `accept`, the whole file's hash must pass it: otherwise the download fails at the last byte (the browser marks it failed) and is logged as partial.
 */
export function hashedStream(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
  onDone: (hash: string, bytes: number, complete: boolean) => void,
  accept?: (hash: string) => boolean,
): ReadableStream<Uint8Array> {
  const h = createHash('sha256');
  const reader = body.getReader();
  let bytes = 0;
  let logged = false;
  const done = (complete: boolean, hash = h.digest('hex')) => {
    if (logged) return;
    logged = true;
    onDone(hash, bytes, complete);
  };
  return new ReadableStream<Uint8Array>({
    async pull(ctl) {
      let r: ReadableStreamReadResult<Uint8Array>;
      try {
        r = await reader.read();
      } catch (e) {
        done(false);
        return ctl.error(e);
      }
      if (r.done) {
        const hash = h.digest('hex');
        if (accept && !accept(hash)) {
          done(false, hash);
          return ctl.error(new Error('file_changed'));
        }
        done(true, hash);
        return ctl.close();
      }
      if (bytes + r.value.byteLength > maxBytes) {
        done(false);
        void reader.cancel().catch(() => {});
        return ctl.error(new Error('too_big'));
      }
      bytes += r.value.byteLength;
      h.update(r.value);
      ctl.enqueue(r.value);
    },
    cancel(reason) {
      done(false);
      return reader.cancel(reason).catch(() => {});
    },
  });
}

/* A download that stopped part way is logged with this prefix, so it counts as evidence of an attempt but never as a delivered file. */
export const PARTIAL = 'partial:';

const safeName = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80) || 'download';
const headers = (name: string, extra: Record<string, string> = {}) => ({
  'content-type': 'application/octet-stream',
  'content-disposition': `attachment; filename="${safeName(name)}"`,
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  ...extra,
});

export function baseEvent(req: Request, orderId: string, kind: 'real' | 'demo' | 'trial', userId: string | null): Omit<DownloadEvent, 'file_hash' | 'bytes'> {
  return { order_id: orderId, kind, user_id: userId, ip: clientIp(req), user_agent: (req.headers.get('user-agent') ?? '').slice(0, 200) };
}

export async function sendBuffer(req: Request, buf: Buffer, name: string, ev: Omit<DownloadEvent, 'file_hash' | 'bytes'>) {
  await logDownload({ ...ev, file_hash: createHash('sha256').update(buf).digest('hex'), bytes: buf.length });
  return new NextResponse(new Uint8Array(buf), { headers: headers(name, { 'content-length': String(buf.length) }) });
}

/* Stream a seller's file to a buyer; the hash of what was sent goes in the download log. */
export function sendUpstream(upstream: Response, name: string, ev: Omit<DownloadEvent, 'file_hash' | 'bytes'>) {
  const declared = Number(upstream.headers.get('content-length') ?? 0);
  if (declared > MAX_FILE_BYTES) return NextResponse.json({ error: 'That file is too large to deliver here.' }, { status: 413 });
  const body = hashedStream(upstream.body as ReadableStream<Uint8Array>, MAX_FILE_BYTES, (hash, bytes, complete) => void logDownload({ ...ev, file_hash: complete ? hash : PARTIAL + hash, bytes }));
  return new NextResponse(body, { headers: headers(name) });
}

export const filenameFromUrl = (raw: string, fallback: string) => {
  try {
    return decodeURIComponent(new URL(raw).pathname.split('/').filter(Boolean).pop() ?? '') || fallback;
  } catch {
    return fallback;
  }
};

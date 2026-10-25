/*
 * Safely opens a seller's site zip. Pure code with no framework imports, so it can be tested on its own.
 * The seller's files are untrusted: every rule below exists to stop zip bombs, path tricks and files that should never be hosted.
 */
import { unzipSync } from 'fflate';

export const LIMITS = {
  zipBytes: 25 * 1024 * 1024, // the upload itself
  totalBytes: 40 * 1024 * 1024, // everything once opened
  fileBytes: 10 * 1024 * 1024, // any one file (matches the storage bucket limit)
  entries: 1500,
};

/* Only what a static website needs. Anything else (php, exe, sh, html-in-disguise archives...) is refused, not skipped. */
const ALLOWED = new Set([
  'html',
  'htm',
  'css',
  'js',
  'mjs',
  'json',
  'txt',
  'xml',
  'map',
  'webmanifest',
  'svg',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'ico',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'mp4',
  'webm',
  'mp3',
  'wav',
  'pdf',
]);

export class DemoZipError extends Error {}

export type Opened = { files: Record<string, Uint8Array>; entry: 'index.html'; count: number; bytes: number };

const ext = (p: string) => (p.includes('.') ? p.slice(p.lastIndexOf('.') + 1).toLowerCase() : '');

function clean(raw: string): string | null {
  const p = raw.replace(/\\/g, '/');
  if (p.endsWith('/') || p.includes('\0') || p.startsWith('/') || /^[a-zA-Z]:/.test(p)) return null;
  const parts = p.split('/');
  if (parts.some((s) => s === '..' || s === '.' || s === '')) return null;
  return parts.join('/');
}

export function openDemoZip(data: Uint8Array): Opened {
  if (data.byteLength > LIMITS.zipBytes) throw new DemoZipError(`The zip is larger than ${LIMITS.zipBytes / 1024 / 1024} MB.`);

  // Pass 1: read the table of contents only, nothing is inflated yet.
  const listing: { name: string; size: number }[] = [];
  try {
    unzipSync(data, {
      filter: (f) => {
        listing.push({ name: f.name, size: f.originalSize });
        return false;
      },
    });
  } catch {
    throw new DemoZipError('That file is not a valid zip.');
  }
  const real = listing.filter((f) => !f.name.endsWith('/'));
  if (real.length > LIMITS.entries) throw new DemoZipError(`The zip has more than ${LIMITS.entries} files.`);
  if (real.reduce((n, f) => n + f.size, 0) > LIMITS.totalBytes) throw new DemoZipError(`The site is larger than ${LIMITS.totalBytes / 1024 / 1024} MB once opened.`);

  // Names: drop OS junk, refuse anything that tries to leave the folder.
  const keep: { raw: string; path: string }[] = [];
  const unsafe: string[] = [];
  for (const f of real) {
    const base = f.name.split(/[\\/]/).pop() ?? '';
    if (f.name.startsWith('__MACOSX/') || base === '.DS_Store' || base === 'Thumbs.db') continue;
    const path = clean(f.name);
    if (!path) {
      unsafe.push(f.name);
      continue;
    }
    if (f.size > LIMITS.fileBytes) throw new DemoZipError(`${f.name} is larger than ${LIMITS.fileBytes / 1024 / 1024} MB.`);
    keep.push({ raw: f.name, path });
  }
  if (unsafe.length) throw new DemoZipError(`These file names are not allowed: ${unsafe.slice(0, 3).join(', ')}.`);

  // If the whole site sits in one folder (the usual result of "zip this folder"), lift it to the top.
  let prefix = '';
  if (keep.length && !keep.some((k) => k.path === 'index.html')) {
    const tops = new Set(keep.map((k) => k.path.split('/')[0]));
    if (tops.size === 1 && keep.every((k) => k.path.includes('/'))) prefix = [...tops][0] + '/';
  }
  const mapped = keep.map((k) => ({ ...k, path: k.path.slice(prefix.length) })).filter((k) => !k.path.split('/').some((s) => s.startsWith('.')));

  const bad = mapped.filter((k) => !ALLOWED.has(ext(k.path)));
  if (bad.length)
    throw new DemoZipError(
      `These file types cannot be hosted: ${bad
        .slice(0, 4)
        .map((b) => b.path)
        .join(', ')}. Remove them and zip again.`,
    );
  if (!mapped.some((k) => k.path === 'index.html')) throw new DemoZipError('Put index.html at the top of the zip.');

  // Pass 2: inflate only what we accepted.
  const wanted = new Map(mapped.map((k) => [k.raw, k.path]));
  const out = unzipSync(data, { filter: (f) => wanted.has(f.name) });
  const files: Record<string, Uint8Array> = {};
  let bytes = 0;
  for (const [raw, content] of Object.entries(out)) {
    const path = wanted.get(raw);
    if (!path) continue;
    files[path] = content;
    bytes += content.byteLength;
  }
  return { files, entry: 'index.html', count: Object.keys(files).length, bytes };
}

import { Inflate } from 'fflate';

/*
 * Reads a zip archive's directory and single entries through ranged reads, so a 500 MB upload is never held in memory at once.
 * Pure (no framework imports), so it is tested on hand-made archives. Supports ZIP64. The archive is untrusted: every size and offset is
 * checked against the real file size before it is used, and unpacking stops the moment the output passes the size the entry declares.
 */
export type RangeReader = { size: number; read(offset: number, length: number): Promise<Uint8Array> };
export const bytesReader = (b: Uint8Array): RangeReader => ({
  size: b.byteLength,
  read: async (offset, length) => b.subarray(offset, Math.min(b.byteLength, offset + length)),
});

export class ZipError extends Error {}

export type ZipEntry = {
  name: string;
  method: number; // 0 stored, 8 deflate
  flags: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  externalAttrs: number;
  madeBy: number; // high byte of "version made by": 3 = Unix
  isDir: boolean;
};

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const u64 = (b: Uint8Array, o: number) => {
  const lo = u32(b, o),
    hi = u32(b, o + 4);
  if (hi > 0x1fffff) throw new ZipError('A size in the archive is too large.');
  return hi * 0x1_0000_0000 + lo;
};
const decoder = new TextDecoder('utf-8', { fatal: false });

const EOCD = 0x06054b50,
  EOCD64 = 0x06064b50,
  EOCD64_LOC = 0x07064b50,
  CDH = 0x02014b50,
  LFH = 0x04034b50;

/* Lists every entry from the central directory. Refuses archives whose directory does not fit inside the file. */
export async function listEntries(r: RangeReader, maxEntries: number): Promise<ZipEntry[]> {
  if (r.size < 22) throw new ZipError('This is not a zip file.');
  const tailLen = Math.min(r.size, 22 + 0xffff + 20);
  const tail = await r.read(r.size - tailLen, tailLen);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--)
    if (u32(tail, i) === EOCD) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new ZipError('This is not a zip file (no directory found).');
  let count = u16(tail, eocd + 10);
  let cdSize = u32(tail, eocd + 12);
  let cdOffset = u32(tail, eocd + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    const loc = eocd - 20;
    if (loc < 0 || u32(tail, loc) !== EOCD64_LOC) throw new ZipError('The large-archive (ZIP64) directory is missing.');
    const e64Off = u64(tail, loc + 8);
    if (e64Off + 56 > r.size) throw new ZipError('The archive directory points outside the file.');
    const e64 = await r.read(e64Off, 56);
    if (u32(e64, 0) !== EOCD64) throw new ZipError('The large-archive (ZIP64) directory is damaged.');
    count = u64(e64, 32);
    cdSize = u64(e64, 40);
    cdOffset = u64(e64, 48);
  }
  if (count > maxEntries) throw new ZipError(`The archive has ${count} entries; at most ${maxEntries} are allowed.`);
  if (cdOffset + cdSize > r.size) throw new ZipError('The archive directory points outside the file.');
  const cd = await r.read(cdOffset, cdSize);
  const out: ZipEntry[] = [];
  let p = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > cd.length || u32(cd, p) !== CDH) throw new ZipError('The archive directory is damaged.');
    const madeBy = cd[p + 5];
    const flags = u16(cd, p + 8);
    const method = u16(cd, p + 10);
    let compressedSize = u32(cd, p + 20);
    let uncompressedSize = u32(cd, p + 24);
    const nameLen = u16(cd, p + 28),
      extraLen = u16(cd, p + 30),
      commentLen = u16(cd, p + 32);
    const externalAttrs = u32(cd, p + 38);
    let localHeaderOffset = u32(cd, p + 42);
    if (p + 46 + nameLen + extraLen + commentLen > cd.length) throw new ZipError('The archive directory is damaged.');
    const name = decoder.decode(cd.subarray(p + 46, p + 46 + nameLen));
    // ZIP64 extra field: only the values that were 0xFFFFFFFF are present, in this order.
    let e = p + 46 + nameLen;
    const end = e + extraLen;
    while (e + 4 <= end) {
      const id = u16(cd, e),
        len = u16(cd, e + 2);
      if (id === 0x0001) {
        let q = e + 4;
        if (uncompressedSize === 0xffffffff) {
          uncompressedSize = u64(cd, q);
          q += 8;
        }
        if (compressedSize === 0xffffffff) {
          compressedSize = u64(cd, q);
          q += 8;
        }
        if (localHeaderOffset === 0xffffffff) localHeaderOffset = u64(cd, q);
      }
      e += 4 + len;
    }
    if (localHeaderOffset + 30 > r.size || localHeaderOffset + compressedSize > r.size) throw new ZipError(`"${name}" points outside the archive.`);
    out.push({ name, method, flags, compressedSize, uncompressedSize, localHeaderOffset, externalAttrs, madeBy, isDir: name.endsWith('/') });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/* Reads and unpacks one entry, refusing to produce more than `maxOut` bytes or more than the entry declares (zip bombs lie about sizes). */
export async function readEntry(r: RangeReader, e: ZipEntry, maxOut: number): Promise<Uint8Array> {
  if (e.flags & 1) throw new ZipError(`"${e.name}" is encrypted and cannot be checked.`);
  if (e.uncompressedSize > maxOut) throw new ZipError(`"${e.name}" is larger than can be checked here.`);
  const lh = await r.read(e.localHeaderOffset, 30);
  if (u32(lh, 0) !== LFH) throw new ZipError(`"${e.name}" is damaged.`);
  const start = e.localHeaderOffset + 30 + u16(lh, 26) + u16(lh, 28);
  if (start + e.compressedSize > r.size) throw new ZipError(`"${e.name}" points outside the archive.`);
  const raw = await r.read(start, e.compressedSize);
  if (e.method === 0) {
    if (raw.length !== e.uncompressedSize) throw new ZipError(`"${e.name}" has the wrong size.`);
    return raw;
  }
  if (e.method !== 8) throw new ZipError(`"${e.name}" uses a compression method that cannot be checked.`);
  // Streamed in small pieces: the moment the output passes the declared size the entry is refused, so a lying header cannot blow up memory.
  const out = new Uint8Array(e.uncompressedSize);
  let at = 0,
    done = false,
    bomb = false;
  const inf = new Inflate((chunk, final) => {
    if (bomb) return;
    if (at + chunk.length > out.length) {
      bomb = true;
      return;
    }
    out.set(chunk, at);
    at += chunk.length;
    if (final) done = true;
  });
  try {
    for (let i = 0; i < raw.length && !bomb; i += 1024) inf.push(raw.subarray(i, Math.min(raw.length, i + 1024)), i + 1024 >= raw.length); // 1 KB in can give at most ~1 MB out before the check
    if (raw.length === 0) inf.push(new Uint8Array(0), true);
  } catch {
    throw new ZipError(`"${e.name}" could not be unpacked.`);
  }
  if (bomb) throw new ZipError(`"${e.name}" unpacks to more than it declares (a zip bomb).`);
  if (!done || at !== out.length) throw new ZipError(`"${e.name}" does not match its declared size.`);
  return out;
}

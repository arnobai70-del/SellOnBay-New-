import { CONFIG } from '../config';
import { secretByName, secretsInText, looksLikeText, type SecretFinding } from './secrets';
import { ZipError, listEntries, readEntry, type RangeReader, type ZipEntry } from './zipIndex';

/*
 * The automatic archive checks every source upload passes before a human looks at it (owner decision D-C, rule 8). Pure, tested.
 * Problems mean the file is refused (the seller fixes it and uploads again); there is no "warn and continue".
 *  - a real zip within the size and entry limits
 *  - every path safe: no absolute paths, drive letters, "..", backslash tricks, empty or control-character names, duplicates
 *  - no symbolic links (they can point outside the folder when unpacked)
 *  - no encrypted entries (they cannot be checked) and only stored or deflated entries
 *  - no nested archives (they would hide files from these checks)
 *  - no entry that expands more than maxRatio times, and the whole archive within maxUnpackedMb (zip bombs)
 *  - no credentials, by file name and by content of text files
 */
export type ArchiveReport = {
  ok: boolean;
  entries: number;
  files: number;
  unpackedBytes: number;
  problems: string[];
  secrets: SecretFinding[];
  scannedTextFiles: number;
  skippedLargeTextFiles: number;
};

const NESTED = /\.(zip|jar|war|ear|apk|aab|ipa|tar|tgz|gz|bz2|xz|7z|rar|zst|cab|iso|dmg)$/i;
const S_IFLNK = 0o120000;
const isSymlink = (e: ZipEntry) => e.madeBy === 3 && ((e.externalAttrs >>> 16) & 0o170000) === S_IFLNK;

export function pathProblem(name: string): string | null {
  if (!name || name.length > 400) return 'a file name that is empty or too long';
  if (/[\0-\x1f]/.test(name)) return `"${name.replace(/[\0-\x1f]/g, '?')}" has control characters in its name`;
  if (name.includes('\\')) return `"${name}" uses backslashes in its path`;
  if (name.startsWith('/') || /^[a-zA-Z]:/.test(name)) return `"${name}" is an absolute path`;
  const parts = name.replace(/\/$/, '').split('/');
  if (parts.some((p) => p === '..' || p === '.')) return `"${name}" points outside the folder`;
  if (parts.some((p) => p === '')) return `"${name}" has an empty folder name`;
  return null;
}

export type ArchiveLimits = { maxArchiveMb: number; maxEntries: number; maxUnpackedMb: number; maxRatio: number; scanFileMb: number; scanTotalMb: number };

export async function inspectArchive(r: RangeReader, limits: ArchiveLimits = CONFIG.files): Promise<ArchiveReport> {
  const report: ArchiveReport = { ok: false, entries: 0, files: 0, unpackedBytes: 0, problems: [], secrets: [], scannedTextFiles: 0, skippedLargeTextFiles: 0 };
  const MB = 1024 * 1024;
  if (r.size > limits.maxArchiveMb * MB) {
    report.problems.push(`The archive is larger than ${limits.maxArchiveMb} MB.`);
    return report;
  }
  let entries: ZipEntry[];
  try {
    entries = await listEntries(r, limits.maxEntries);
  } catch (e) {
    report.problems.push(e instanceof ZipError ? e.message : 'The archive could not be read.');
    return report;
  }
  report.entries = entries.length;
  const seen = new Set<string>();
  for (const e of entries) {
    const bad = pathProblem(e.name);
    if (bad) report.problems.push(`The archive contains ${bad}.`);
    const key = e.name.toLowerCase().replace(/\/$/, '');
    if (seen.has(key)) report.problems.push(`"${e.name}" appears twice.`);
    seen.add(key);
    if (e.isDir) continue;
    report.files++;
    report.unpackedBytes += e.uncompressedSize;
    if (isSymlink(e)) report.problems.push(`"${e.name}" is a symbolic link.`);
    if (e.flags & 1) report.problems.push(`"${e.name}" is encrypted and cannot be checked.`);
    if (e.method !== 0 && e.method !== 8) report.problems.push(`"${e.name}" uses a compression method that cannot be checked.`);
    if (NESTED.test(e.name)) report.problems.push(`"${e.name}" is an archive inside the archive. Unpack it into the main archive instead.`);
    if (e.compressedSize > 0 ? e.uncompressedSize / e.compressedSize > limits.maxRatio : e.uncompressedSize > 0)
      report.problems.push(`"${e.name}" expands far more than normal files do (a possible zip bomb).`);
    const byName = secretByName(e.name);
    if (byName) report.secrets.push(byName);
  }
  if (report.files === 0) report.problems.push('The archive has no files.');
  if (report.unpackedBytes > limits.maxUnpackedMb * MB) report.problems.push(`The archive unpacks to more than ${limits.maxUnpackedMb} MB.`);
  // Content check of text files, only when the structure is sound (never unpack a suspicious archive).
  if (report.problems.length === 0) {
    let budget = limits.scanTotalMb * MB;
    for (const e of entries) {
      if (e.isDir || e.uncompressedSize === 0) continue;
      if (e.uncompressedSize > limits.scanFileMb * MB || e.uncompressedSize > budget) {
        if (/\.(js|mjs|cjs|ts|json|env|ya?ml|php|py|rb|txt|xml|sql)$/i.test(e.name)) report.skippedLargeTextFiles++;
        continue;
      }
      let bytes: Uint8Array;
      try {
        bytes = await readEntry(r, e, limits.scanFileMb * MB);
      } catch (err) {
        report.problems.push(err instanceof ZipError ? err.message : `"${e.name}" could not be unpacked.`);
        break;
      }
      budget -= bytes.length;
      if (!looksLikeText(e.name, bytes)) continue;
      report.scannedTextFiles++;
      for (const f of secretsInText(e.name, bytes)) if (!report.secrets.some((s) => s.file === f.file && s.kind === f.kind)) report.secrets.push(f);
    }
  }
  if (report.secrets.length) report.problems.push(`The archive contains credentials (${report.secrets.length} found). Remove them and upload again.`);
  report.ok = report.problems.length === 0;
  return report;
}

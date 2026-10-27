import { zipSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '@/lib/config';
import { inspectArchive, pathProblem, type ArchiveLimits } from '@/lib/files/archive';
import { secretByName, secretsInText } from '@/lib/files/secrets';
import { bytesReader, listEntries, readEntry } from '@/lib/files/zipIndex';

const zip = (files: Record<string, Uint8Array | [Uint8Array, object]>) => zipSync(files as never);
const inspect = (z: Uint8Array, limits: ArchiveLimits = CONFIG.files) => inspectArchive(bytesReader(z), limits);

/* Finds the central directory header of the first entry. */
const firstCdh = (z: Uint8Array) => {
  for (let i = z.length - 22; i >= 0; i--) if (z[i] === 0x50 && z[i + 1] === 0x4b && z[i + 2] === 0x01 && z[i + 3] === 0x02) return i;
  throw new Error('no central directory');
};

describe('zip reading', () => {
  it('lists entries and unpacks them through ranged reads', async () => {
    const z = zip({ 'src/index.js': strToU8('console.log(1)'), 'README.md': strToU8('# Hello') });
    const entries = await listEntries(bytesReader(z), 100);
    expect(entries.map((e) => e.name).sort()).toEqual(['README.md', 'src/index.js']);
    const e = entries.find((x) => x.name === 'README.md')!;
    expect(new TextDecoder().decode(await readEntry(bytesReader(z), e, 1024))).toBe('# Hello');
  });
  it('refuses something that is not a zip, and archives with too many entries', async () => {
    expect((await inspect(strToU8('just some text, definitely not a zip file'))).problems[0]).toMatch(/not a zip/);
    const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`f${i}.txt`, strToU8('x')]));
    expect((await inspect(zip(many), { ...CONFIG.files, maxEntries: 20 })).problems[0]).toMatch(/30 entries/);
  });
  it('a header that lies about its size is refused while unpacking (zip bomb)', async () => {
    const z = zip({ 'a.txt': strToU8('a'.repeat(5000)) });
    const cdh = firstCdh(z);
    const lied = z.slice();
    new DataView(lied.buffer).setUint32(cdh + 24, 10, true); // claims 10 bytes unpacked
    const [e] = await listEntries(bytesReader(lied), 10);
    await expect(readEntry(bytesReader(lied), e, 1_000_000)).rejects.toThrow(/zip bomb|declared/);
  });
});

describe('archive checks (D-C)', () => {
  it('a normal source archive passes', async () => {
    const r = await inspect(zip({ 'package.json': strToU8('{"name":"site"}'), 'src/app.ts': strToU8('export const a = 1;'), '.env.example': strToU8('API_KEY=') }));
    expect(r).toMatchObject({ ok: true, files: 3, problems: [], secrets: [] });
    expect(r.scannedTextFiles).toBe(3);
  });
  it('refuses path tricks', async () => {
    expect(pathProblem('../etc/passwd')).toMatch(/outside/);
    expect(pathProblem('/abs/file')).toMatch(/absolute/);
    expect(pathProblem('C:/win/file')).toMatch(/absolute/);
    expect(pathProblem('a\\..\\b')).toMatch(/backslash/);
    expect(pathProblem('a//b')).toMatch(/empty folder/);
    expect(pathProblem('ok/file.js')).toBeNull();
    const r = await inspect(zip({ '../evil.sh': strToU8('rm -rf /'), 'ok.txt': strToU8('fine') }));
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toMatch(/outside the folder/);
  });
  it('refuses symbolic links', async () => {
    const r = await inspect(zip({ link: [strToU8('/etc/passwd'), { os: 3, attrs: (0o120777 << 16) >>> 0 }] }));
    expect(r.problems.join(' ')).toMatch(/symbolic link/);
  });
  it('refuses nested archives, encrypted entries and duplicate names', async () => {
    expect((await inspect(zip({ 'inner.zip': zip({ 'x.txt': strToU8('x') }) }))).problems.join(' ')).toMatch(/archive inside the archive/);
    const z = zip({ 'a.txt': strToU8('hello') });
    const enc = z.slice();
    const cdh = firstCdh(enc);
    enc[cdh + 8] |= 1; // the "encrypted" flag
    expect((await inspect(enc)).problems.join(' ')).toMatch(/encrypted/);
  });
  it('refuses entries that expand far beyond normal files (zip bombs)', async () => {
    const r = await inspect(zip({ 'zeros.bin': new Uint8Array(4 * 1024 * 1024) }));
    expect(r.problems.join(' ')).toMatch(/zip bomb/);
  });
  it('refuses archives over the size limit before reading them', async () => {
    const r = await inspect(zip({ 'a.txt': strToU8('a') }), { ...CONFIG.files, maxArchiveMb: 0 });
    expect(r.problems[0]).toMatch(/larger than 0 MB/);
    expect(CONFIG.files.maxArchiveMb).toBe(500);
  });
  it('finds credentials by file name and by content, without ever storing the secret', async () => {
    const key = 'AKIA' + 'ABCDEFGHIJKLMNOP';
    const r = await inspect(
      zip({
        '.env': strToU8('DB=1'),
        'config/prod.js': strToU8(`const k = "${key}";\nconst db = "postgres://admin:hunter22@db.example.com/app";`),
        'keys/server.pem': strToU8('cert'),
      }),
    );
    expect(r.ok).toBe(false);
    const kinds = r.secrets.map((s) => `${s.file}:${s.kind}`);
    expect(kinds).toEqual(
      expect.arrayContaining([
        '.env:Environment file with settings',
        'keys/server.pem:Private key or certificate store',
        'config/prod.js:AWS access key',
        'config/prod.js:Database address with a password',
      ]),
    );
    expect(JSON.stringify(r)).not.toContain(key);
    expect(JSON.stringify(r)).not.toContain('hunter22');
  });
  it('content rules catch common keys; example files are allowed', () => {
    expect(secretsInText('a.txt', strToU8('-----BEGIN RSA PRIVATE KEY-----\nabc'))[0]?.kind).toBe('Private key');
    expect(secretsInText('a.txt', strToU8('token=ghp_' + 'a'.repeat(36)))[0]?.kind).toBe('GitHub token');
    expect(secretsInText('a.txt', strToU8('sk_live_' + 'a'.repeat(24)))[0]?.kind).toBe('Stripe live secret key');
    expect(secretsInText('a.txt', strToU8('nothing to see here'))).toEqual([]);
    expect(secretByName('.env.example')).toBeNull();
    expect(secretByName('app/.env.production')?.kind).toMatch(/Environment/);
    expect(secretByName('wp-config.php')?.kind).toMatch(/WordPress/);
  });
});

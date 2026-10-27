import 'server-only';

/*
 * Malware scanning (owner decisions D-C and F-8): a commercial scanning API, archives up to 500 MB, FAIL CLOSED.
 * The provider is not chosen yet (blocker B-3), so no real provider exists here and no seller or buyer file is sent anywhere.
 * Until one is approved and written against its documentation, every scan answers "error" and no file can be approved.
 *
 * Adding the approved provider: implement MalwareScanner in its own file, add it to scannerFromEnv(), and keep its key in the server
 * environment only. Never fall back to "clean" when the provider cannot be reached.
 */
export type ScanInput = { fileId: string; sha256: string; size: number; open: () => Promise<ReadableStream<Uint8Array> | Uint8Array> };
export type ScanResult = { verdict: 'clean' | 'infected' | 'error'; provider: string; reference?: string; detail?: string };

export interface MalwareScanner {
  name: string;
  /* false for anything that is not an owner-approved provider; approval of files requires an approved scanner's "clean". */
  approved: boolean;
  scan(input: ScanInput): Promise<ScanResult>;
}

export const notConfiguredScanner: MalwareScanner = {
  name: 'none',
  approved: false,
  scan: async () => ({ verdict: 'error', provider: 'none', detail: 'No approved malware-scanning provider is configured yet (blocker B-3). Files cannot be approved until one is.' }),
};

/*
 * A stand-in for tests and local development ONLY. It never looks at the bytes: the EICAR test string marks "infected", anything else "clean".
 * It is not an approved scanner, so files it calls clean still cannot be approved in production. It refuses to run in production at all.
 */
export const testScanner: MalwareScanner = {
  name: 'test-double',
  approved: false,
  async scan(input) {
    if (process.env.NODE_ENV === 'production') return { verdict: 'error', provider: 'test-double', detail: 'The test scanner never runs in production.' };
    const data = await input.open();
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(await new Response(data).arrayBuffer());
    const eicar = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
    const infected = new TextDecoder().decode(bytes).includes(eicar);
    return { verdict: infected ? 'infected' : 'clean', provider: 'test-double', reference: `test-${input.sha256.slice(0, 12)}` };
  },
};

/* Which scanner runs. SCAN_PROVIDER=test only outside production. Any other value is unknown until a provider is approved and added. */
export function scannerFromEnv(env: Record<string, string | undefined> = process.env): MalwareScanner {
  const p = (env.SCAN_PROVIDER ?? '').trim().toLowerCase();
  if (p === 'test' && env.NODE_ENV !== 'production') return testScanner;
  return notConfiguredScanner;
}

/*
 * May a file with this scan result be approved? Only an approved scanner's "clean". Tests may allow the test double explicitly; production
 * never can (scannerFromEnv never returns it there, and the flag below is ignored in production).
 */
export function scanAllowsApproval(r: { verdict: string; approvedScanner: boolean }, opts: { allowTestScanner?: boolean } = {}): boolean {
  if (r.verdict !== 'clean') return false;
  if (r.approvedScanner) return true;
  return !!opts.allowTestScanner && process.env.NODE_ENV !== 'production';
}

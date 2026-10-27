import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { auditList } from '@/lib/admin/audit';
import { FLAGS, MANDATORY_CONTROL_WORDS, isFlagKey } from '@/lib/featureFlagRegistry';
import { flagStates, forgetFlags, isFlagOn, setFlag } from '@/lib/featureFlags';

const root = path.join(__dirname, '..', '..');
const walk = (dir: string): string[] =>
  fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : [])) : [];

afterEach(() => forgetFlags());

describe('feature flag registry (R-4)', () => {
  it('declares only optional features: no key or label names a mandatory control', () => {
    for (const [key, f] of Object.entries(FLAGS)) {
      const text = (key + ' ' + f.label).toLowerCase();
      for (const w of MANDATORY_CONTROL_WORDS) expect(text, `${key} mentions "${w}"`).not.toContain(w);
    }
  });
  it('new optional features start off, except the path that keeps existing Apple users able to sign in', () => {
    for (const [key, f] of Object.entries(FLAGS)) expect(f.default, key).toBe(key === 'login.apple_existing');
  });
  it('mandatory security code never reads a feature flag', () => {
    // Folders that hold payment verification, release, files, permissions and audit code (present now or added later).
    const guarded = ['lib/admin/guard.ts', 'lib/admin/scopes.ts', 'lib/admin/audit.ts', 'lib/delivery', 'lib/release', 'lib/files', 'lib/payments', 'lib/quotes', 'lib/orders', 'lib/ledger.ts'];
    for (const g of guarded) {
      const full = path.join(root, g);
      const files = fs.existsSync(full) && fs.statSync(full).isFile() ? [full] : walk(full);
      for (const f of files) expect(fs.readFileSync(f, 'utf8'), f).not.toMatch(/featureFlag/);
    }
  });
});

describe('switching a flag', () => {
  it('needs a known key and a reason; locked flags cannot be turned on; every change is audited', async () => {
    expect(isFlagKey('requests.custom_dev')).toBe(true);
    expect(await setFlag('admin-1', 'release.auto', true, 'Trying to bypass release.')).toMatchObject({ ok: false, status: 400 });
    expect(await setFlag('admin-1', 'requests.custom_dev', true, 'no')).toMatchObject({ ok: false, status: 400 });
    expect(await setFlag('admin-1', 'ads.meta', true, 'Turning ads on early.')).toMatchObject({ ok: false, status: 409 });
    expect(await isFlagOn('requests.custom_dev')).toBe(false);
    expect(await setFlag('admin-1', 'requests.custom_dev', true, 'Opening custom work.')).toEqual({ ok: true });
    expect(await isFlagOn('requests.custom_dev')).toBe(true);
    expect(await setFlag('admin-1', 'requests.custom_dev', true, 'Again, same value.')).toMatchObject({ ok: false, status: 409 });
    const e = (await auditList(50)).find((x) => x.action === 'flag_on' && x.targetRef === 'requests.custom_dev');
    expect(e?.detail).toMatchObject({ reason: 'Opening custom work.', from: false, to: true });
    expect((await flagStates()).find((f) => f.key === 'requests.custom_dev')?.on).toBe(true);
    expect(await setFlag('admin-1', 'requests.custom_dev', false, 'Closing it again.')).toEqual({ ok: true });
  });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkPassphrase, decryptFile, encryptFile } from './backup-file.mjs';

const pass = 'correct-horse-battery-staple';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sob-backup-test-'));
const plain = path.join(dir, 'a.dump');
const data = Buffer.concat([Buffer.from('buyer@example.test '), crypto.randomBytes(300_000)]);
fs.writeFileSync(plain, data);

test('a backup encrypts and opens again byte for byte', async () => {
  await encryptFile(plain, path.join(dir, 'a.enc'), pass);
  const enc = fs.readFileSync(path.join(dir, 'a.enc'));
  assert.equal(enc.subarray(0, 5).toString(), 'SOBK1');
  assert.equal(enc.includes(Buffer.from('buyer@example.test')), false);
  await decryptFile(path.join(dir, 'a.enc'), path.join(dir, 'b.dump'), pass);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'b.dump')), data);
});

test('a wrong passphrase or a changed byte is refused and leaves no output', async () => {
  await assert.rejects(decryptFile(path.join(dir, 'a.enc'), path.join(dir, 'c.dump'), 'wrong-horse-battery-staple'), /wrong passphrase/);
  assert.equal(fs.existsSync(path.join(dir, 'c.dump')), false);
  const bad = fs.readFileSync(path.join(dir, 'a.enc'));
  bad[1000] ^= 1;
  fs.writeFileSync(path.join(dir, 'bad.enc'), bad);
  await assert.rejects(decryptFile(path.join(dir, 'bad.enc'), path.join(dir, 'd.dump'), pass), /damaged/);
  assert.equal(fs.existsSync(path.join(dir, 'd.dump')), false);
});

test('a short passphrase is refused', () => {
  assert.throws(() => checkPassphrase('short'), /16 characters/);
  assert.throws(() => checkPassphrase(undefined), /16 characters/);
});

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

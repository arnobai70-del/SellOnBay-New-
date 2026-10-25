// Encryption for database backup files, shared by db-backup.mjs and db-restore.mjs. Node only, no extra packages, works on Windows too.
// File layout: "SOBK1" (5 bytes) | salt (16) | iv (12) | AES-256-GCM ciphertext | tag (16). The key comes from the passphrase with scrypt.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';

const MAGIC = Buffer.from('SOBK1');
const HEAD = MAGIC.length + 16 + 12;
const TAG = 16;
const key = (pass, salt) => crypto.scryptSync(pass, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

export function checkPassphrase(pass) {
  if (!pass || pass.length < 16) throw new Error('BACKUP_PASSPHRASE must be at least 16 characters. Keep it in a password manager: without it the backup cannot be opened.');
}

export async function encryptFile(src, dest, pass) {
  checkPassphrase(pass);
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(pass, salt), iv);
  const out = fs.createWriteStream(dest, { mode: 0o600 });
  out.write(Buffer.concat([MAGIC, salt, iv]));
  await pipeline(fs.createReadStream(src), cipher, out, { end: false });
  await new Promise((resolve, reject) => out.end(cipher.getAuthTag(), (e) => (e ? reject(e) : resolve())));
}

export async function decryptFile(src, dest, pass) {
  checkPassphrase(pass);
  const size = fs.statSync(src).size;
  if (size < HEAD + TAG) throw new Error('This file is too short to be an encrypted backup.');
  const fd = fs.openSync(src, 'r');
  const head = Buffer.alloc(HEAD);
  const tag = Buffer.alloc(TAG);
  fs.readSync(fd, head, 0, HEAD, 0);
  fs.readSync(fd, tag, 0, TAG, size - TAG);
  fs.closeSync(fd);
  if (!head.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('This is not a SellOnBay encrypted backup.');
  const salt = head.subarray(MAGIC.length, MAGIC.length + 16);
  const iv = head.subarray(MAGIC.length + 16, HEAD);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(pass, salt), iv);
  decipher.setAuthTag(tag);
  try {
    await pipeline(fs.createReadStream(src, { start: HEAD, end: size - TAG - 1 }), decipher, fs.createWriteStream(dest, { mode: 0o600 }));
  } catch {
    fs.rmSync(dest, { force: true });
    throw new Error('Could not open the backup: wrong passphrase, or the file is damaged.');
  }
}

export const sha256 = async (file) => {
  const h = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(file), h);
  return h.digest('hex');
};

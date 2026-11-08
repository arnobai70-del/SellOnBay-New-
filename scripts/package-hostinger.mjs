// npm run package:hostinger: the upload zip for Hostinger (docs/DEPLOY_HOSTINGER.md). Made only from the release branch with nothing uncommitted,
// with `git archive`, so only committed files go in (never .env.local, backups or build folders). The zip's comment is the commit it was made from;
// the zip it replaces is kept as SellOnBay-HOSTINGER-previous-<commit>.zip for a rollback. It never pushes, uploads or deploys anything.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, renameSync } from 'node:fs';

const BRANCH = process.env.RELEASE_BRANCH || 'release/glass-ui';
const OUT = 'SellOnBay-HOSTINGER.zip';
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const fail = (m) => {
  console.error(`package:hostinger: ${m}`);
  process.exit(1);
};

const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
if (branch !== BRANCH) fail(`run it on ${BRANCH} (now on ${branch}).`);
if (git('status', '--porcelain', '--untracked-files=no')) fail('commit or stash your changes first: the zip is made from the last commit.');
const head = git('rev-parse', 'HEAD');

/* The commit a zip was made from: git archive writes it as the zip comment (end of central directory record). */
export function zipComment(buf) {
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) if (buf.readUInt32LE(i) === 0x06054b50) return buf.subarray(i + 22, i + 22 + buf.readUInt16LE(i + 20)).toString('utf8');
  return '';
}

if (existsSync(OUT)) {
  const old = zipComment(readFileSync(OUT)).slice(0, 7);
  if (old === head.slice(0, 7)) fail(`${OUT} is already made from ${old}; nothing to do.`);
  const keep = `SellOnBay-HOSTINGER-previous-${old || Date.now()}.zip`;
  if (existsSync(keep)) fail(`${keep} already exists; move it away first.`);
  renameSync(OUT, keep);
  console.log(`kept the previous zip as ${keep}`);
}
git('archive', '--format=zip', '-o', OUT, 'HEAD');
const listed = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD'], { encoding: 'utf8' }).split('\n');
if (listed.some((f) => /^\.env(\.local)?$|^backups\//.test(f))) fail('a secret file is committed; the zip was made but must not be uploaded.');
console.log(`${OUT} made from ${branch} at ${head.slice(0, 7)} (${listed.filter(Boolean).length} files). Upload it by hand; nothing was pushed or deployed.`);

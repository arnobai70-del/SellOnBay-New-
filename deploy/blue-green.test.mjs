// Runs deploy/blue-green.sh in DRY_RUN mode in a scratch folder: it prints the plan and changes nothing on this machine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const script = path.join(import.meta.dirname, 'blue-green.sh');
const plan = (root, ...args) => execFileSync('bash', [script, ...args], { env: { ...process.env, SOB_ROOT: root, DRY_RUN: '1' }, encoding: 'utf8' });
const scratch = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sob-bg-'));

test('the script parses', () => {
  execFileSync('bash', ['-n', script]);
});

test('the first deploy builds blue, checks it on its own port, and only then points nginx at it', () => {
  const out = plan(scratch(), 'deploy');
  const order = [
    'git clone',
    'checkout --quiet --force origin/main',
    'npm ci',
    'npm run build',
    'systemctl restart sellonbay@blue',
    'curl http://127.0.0.1:3101/api/health',
    'server 127.0.0.1:3101;',
    'Serving blue.',
  ];
  let at = -1;
  for (const step of order) {
    const i = out.indexOf(step);
    assert.ok(i > at, `"${step}" should come after the step before it:\n${out}`);
    at = i;
  }
});

test('with blue serving, a deploy goes to green, leaves blue running, and rollback goes back to blue', () => {
  const root = scratch();
  fs.writeFileSync(path.join(root, 'active'), 'blue\n');
  const out = plan(root, 'deploy', 'v1.2.0');
  assert.match(out, /Building green on port 3102 from v1\.2\.0/);
  assert.match(out, /checkout --quiet --force v1\.2\.0/);
  assert.doesNotMatch(out, /sellonbay@blue|stop/);
  fs.writeFileSync(path.join(root, 'active'), 'green\n');
  assert.match(plan(root, 'rollback'), /127\.0\.0\.1:3101[\s\S]*Back on blue\./);
});

test('rollback with nothing deployed and an unknown command both stop', () => {
  const root = scratch();
  const r = spawnSync('bash', [script, 'rollback'], { env: { ...process.env, SOB_ROOT: root, DRY_RUN: '1' }, encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /nothing has been deployed/);
  assert.equal(spawnSync('bash', [script, 'launch'], { encoding: 'utf8' }).status, 2);
});

/* Real run of the switch with stand-ins for curl, nginx and systemctl on PATH. */
function withStubs(nginxOk, healthOk) {
  const root = scratch();
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  const stub = (name, body) => fs.writeFileSync(path.join(bin, name), `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 });
  stub('curl', healthOk ? `echo '{"ok":true}'` : 'exit 7');
  stub('nginx', nginxOk ? 'exit 0' : 'exit 1');
  stub('systemctl', `echo "$@" >> "${root}/systemctl.log"`);
  stub('sleep', 'exit 0');
  const upstream = path.join(root, 'upstream.conf');
  fs.writeFileSync(upstream, 'server 127.0.0.1:3102;\n');
  fs.writeFileSync(path.join(root, 'active'), 'green\n');
  const r = spawnSync('bash', [script, 'rollback'], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, SOB_ROOT: root, SOB_UPSTREAM: upstream, SOB_HEALTH_TRIES: '2' },
    encoding: 'utf8',
  });
  const log = fs.existsSync(path.join(root, 'systemctl.log')) ? fs.readFileSync(path.join(root, 'systemctl.log'), 'utf8') : '';
  return { r, upstream: fs.readFileSync(upstream, 'utf8'), active: fs.readFileSync(path.join(root, 'active'), 'utf8'), log };
}

test('a switch nginx accepts changes the upstream, reloads nginx and records the copy', () => {
  const { r, upstream, active, log } = withStubs(true, true);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(upstream, 'server 127.0.0.1:3101;\n');
  assert.equal(active, 'blue\n');
  assert.equal(log, 'reload nginx\n');
});

test('a switch nginx refuses puts the old upstream back and changes nothing', () => {
  const { r, upstream, active, log } = withStubs(false, true);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /nginx refused/);
  assert.equal(upstream, 'server 127.0.0.1:3102;\n');
  assert.equal(active, 'green\n');
  assert.equal(log, '');
});

test('a copy that does not answer its health check is never switched to', () => {
  const { r, upstream, active } = withStubs(true, false);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /does not answer/);
  assert.equal(upstream, 'server 127.0.0.1:3102;\n');
  assert.equal(active, 'green\n');
});

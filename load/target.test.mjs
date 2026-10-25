import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROFILES, THRESHOLDS, checkTarget, profileOf } from './lib/target.js';

test('load tests refuse the live site', () => {
  for (const u of ['https://sellonbay.com', 'https://www.sellonbay.com/browse', 'https://SELLONBAY.com']) assert.equal(checkTarget(u, 'STAGING_ONLY').ok, false, u);
});

test('load tests need a typed confirmation and a real address', () => {
  assert.equal(checkTarget('https://staging.example.com', '').ok, false);
  assert.equal(checkTarget('', 'STAGING_ONLY').ok, false);
  assert.equal(checkTarget('ftp://staging.example.com', 'STAGING_ONLY').ok, false);
  assert.equal(checkTarget('https://u:p@staging.example.com', 'STAGING_ONLY').ok, false);
  assert.deepEqual(checkTarget('https://staging.example.com/x?y', 'STAGING_ONLY'), { ok: true, base: 'https://staging.example.com' });
  assert.equal(checkTarget('https://staging.sellonbay.com', 'STAGING_ONLY').ok, true);
});

test('every profile ramps down at the end, and pass marks exist', () => {
  for (const name of Object.keys(PROFILES)) assert.equal(profileOf(name).stages.at(-1).target, 0, name);
  assert.equal(profileOf('nope'), null);
  assert.ok(THRESHOLDS.http_req_failed.length && THRESHOLDS.checks.length);
});

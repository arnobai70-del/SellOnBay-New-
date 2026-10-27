import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkStagingTarget, PRODUCTION_SUPABASE_REF, STAGING_SUPABASE_REF } from './verify-staging-target.mjs';

const good = {
  STAGING_CONFIRM: 'I_UNDERSTAND_STAGING_WRITES',
  STAGING_APP_URL: 'https://staging.example.com',
  PRODUCTION_APP_URL: 'https://sellonbay.example.com',
  STAGING_SUPABASE_URL: `https://${STAGING_SUPABASE_REF}.supabase.co`,
  PRODUCTION_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_REF}.supabase.co`,
  STAGING_SUPABASE_ANON_KEY: 'stage-anon',
  STAGING_SUPABASE_SERVICE_ROLE_KEY: 'stage-service',
};
test('accepts an explicitly separate protected staging environment', () => {
  assert.equal(checkStagingTarget(good).ok, true);
});
test('refuses a production app or production Supabase target', () => {
  assert.equal(checkStagingTarget({ ...good, STAGING_APP_URL: good.PRODUCTION_APP_URL }).ok, false);
  assert.equal(checkStagingTarget({ ...good, STAGING_SUPABASE_URL: good.PRODUCTION_SUPABASE_URL }).ok, false);
});
test('refuses unsafe or incomplete settings', () => {
  assert.equal(checkStagingTarget({ ...good, STAGING_CONFIRM: '' }).ok, false);
  assert.equal(checkStagingTarget({ ...good, STAGING_SUPABASE_SERVICE_ROLE_KEY: '' }).ok, false);
  assert.equal(checkStagingTarget({ ...good, STAGING_APP_URL: 'http://localhost:3000' }).ok, false);
  assert.equal(checkStagingTarget({ ...good, LAUNCHBAY_DEMO: '1' }).ok, false);
});
test('only the approved staging project, never the production one', () => {
  assert.equal(checkStagingTarget({ ...good, STAGING_SUPABASE_URL: 'https://someotherproject00.supabase.co' }).ok, false);
  assert.equal(checkStagingTarget({ ...good, NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_REF}.supabase.co` }).ok, false);
  assert.equal(checkStagingTarget({ ...good, NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_SUPABASE_REF}.supabase.co` }).ok, true);
});

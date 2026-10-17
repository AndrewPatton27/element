import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiDailyCap, describeEnv, readEnv } from '../src/config.ts';

const FAKE_KEY = 'sb_secret_' + 'a'.repeat(30);   // not a real key

test('AI cap is min(600, verified free RPD)', () => {
  assert.equal(aiDailyCap(null), 600);
  assert.equal(aiDailyCap(1000), 600);
  assert.equal(aiDailyCap(250), 250);
});

test('refuses to start with a placeholder SUPABASE_URL or missing keys', () => {
  assert.throws(() => readEnv({}), /SUPABASE_URL/);
  assert.throws(() => readEnv({ SUPABASE_URL: 'https://your-project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: FAKE_KEY, SEC_USER_AGENT: 'App a@b.edu' }), /SUPABASE_URL/);
  assert.throws(() => readEnv({ SUPABASE_URL: 'https://abcd1234.supabase.co', SUPABASE_SERVICE_ROLE_KEY: '', SEC_USER_AGENT: 'App a@b.edu' }), /SUPABASE_SERVICE_ROLE_KEY/);
  assert.throws(() => readEnv({ SUPABASE_URL: 'https://abcd1234.supabase.co', SUPABASE_SERVICE_ROLE_KEY: FAKE_KEY, SEC_USER_AGENT: 'App' }), /SEC_USER_AGENT/);
});

test('error messages and the env summary never contain the key', () => {
  try {
    readEnv({ SUPABASE_URL: 'https://your-project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: FAKE_KEY });
    assert.fail('should throw');
  } catch (e) {
    assert.doesNotMatch(String(e), new RegExp(FAKE_KEY));
  }
  const env = readEnv({ SUPABASE_URL: 'https://abcd1234.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: FAKE_KEY, SEC_USER_AGENT: 'App a@b.edu' });
  assert.equal(env.supabaseUrl, 'https://abcd1234.supabase.co');
  assert.doesNotMatch(describeEnv(env), new RegExp(FAKE_KEY));
  assert.match(describeEnv(env), /SUPABASE_SERVICE_ROLE_KEY=\[set\]/);
});

test('dry run needs no environment at all', () => {
  assert.doesNotThrow(() => readEnv({}, { dryRun: true }));
});

test('verified Gemini free limits: effective daily cap is 500, pacing 4 s', async () => {
  const { config } = await import('../src/config.ts');
  assert.equal(aiDailyCap(), 500);
  assert.equal(Math.ceil(60_000 / config.gemini.freeRpm), 4000);
});

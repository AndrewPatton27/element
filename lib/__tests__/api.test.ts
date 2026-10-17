import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveApiConfig } from '../config.ts';
import { ApiError, createSupabaseApi, planRequest } from '../api.supabase.ts';
import { card, config } from './helpers.ts';

const URL_ = 'https://abc123.supabase.co';
const KEY = 'sb_publishable_testkey123';

test('config: mock is the default; supabase needs URL and key', () => {
  assert.deepEqual(resolveApiConfig({}), { ok: true, mode: 'mock' });
  assert.deepEqual(resolveApiConfig({ EXPO_PUBLIC_API_MODE: 'mock' }), { ok: true, mode: 'mock' });
  const missing = resolveApiConfig({ EXPO_PUBLIC_API_MODE: 'supabase' });
  assert.equal(missing.ok, false);
  const placeholder = resolveApiConfig({
    EXPO_PUBLIC_API_MODE: 'supabase',
    EXPO_PUBLIC_SUPABASE_URL: 'https://your-project.supabase.co',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: KEY,
  });
  assert.equal(placeholder.ok, false);
  const good = resolveApiConfig({
    EXPO_PUBLIC_API_MODE: 'supabase',
    EXPO_PUBLIC_SUPABASE_URL: URL_ + '/',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: KEY,
  });
  assert.deepEqual(good, { ok: true, mode: 'supabase', url: URL_, key: KEY });
  assert.equal(resolveApiConfig({ EXPO_PUBLIC_API_MODE: 'live' }).ok, false);
});

test('config: a secret key is refused', () => {
  const r = resolveApiConfig({
    EXPO_PUBLIC_API_MODE: 'supabase',
    EXPO_PUBLIC_SUPABASE_URL: URL_,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc',
  });
  assert.equal(r.ok, false);
});

test('feed request targets the api schema with a clamped limit', () => {
  const p = planRequest(URL_, KEY, 'feed', { mode: 'latest', limit: 99, category: 'tech' });
  assert.equal(p.url, `${URL_}/rest/v1/rpc/feed`);
  assert.equal(p.init.method, 'POST');
  assert.equal(p.init.headers['Content-Profile'], 'api');
  assert.equal(p.init.headers['Accept-Profile'], 'api');
  assert.equal(p.init.headers.apikey, KEY);
  assert.deepEqual(JSON.parse(p.init.body as string), { p_mode: 'latest', p_cursor: null, p_limit: 30, p_category: 'tech' });
});

test('reads use GET with Accept-Profile api', () => {
  for (const [op, path] of [
    ['config', '/rest/v1/app_config?'],
    ['categories', '/rest/v1/categories?'],
    ['numbers', '/rest/v1/numbers_to_know?'],
  ] as const) {
    const p = planRequest(URL_, KEY, op);
    assert.equal(p.init.method, 'GET');
    assert.ok(p.url.startsWith(URL_ + path), p.url);
    assert.equal(p.init.headers['Accept-Profile'], 'api');
  }
});

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
}

test('supabase api parses responses through the guards', async () => {
  const api = createSupabaseApi({ url: URL_, key: KEY, fetchFn: fakeFetch(200, { items: [card(), { id: 'bad' }], next_cursor: 'abc' }) });
  const page = await api.feed({ mode: 'top' });
  assert.equal(page.items.length, 1);
  assert.equal(page.next_cursor, 'abc');
  assert.equal(api.sample, false);
  const cfgApi = createSupabaseApi({ url: URL_, key: KEY, fetchFn: fakeFetch(200, [config()]) });
  assert.equal((await cfgApi.appConfig()).disclaimer, 'Informational only · Not investment advice');
});

test('errors carry status and never the key', async () => {
  const api = createSupabaseApi({ url: URL_, key: KEY, fetchFn: fakeFetch(401, { message: 'Invalid API key' }) });
  await assert.rejects(api.feed({ mode: 'top' }), (err: unknown) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 401);
    assert.ok(!err.message.includes(KEY));
    return true;
  });
  const down = createSupabaseApi({
    url: URL_,
    key: KEY,
    fetchFn: (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch,
  });
  await assert.rejects(down.categories(), (err: unknown) => err instanceof ApiError && err.status === 0);
});

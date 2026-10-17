import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGuard, normalizeUrl } from '../src/dedupe.ts';

const t0 = new Date('2026-10-17T12:00:00Z');
const h = (n: number) => new Date(t0.getTime() + n * 3600_000);
const url = (n: number) => `https://www.sec.gov/Archives/edgar/data/1/${n}-index.htm`;

test('the same URL (any case of host, fragment, trailing slash) is a duplicate', () => {
  const g = createGuard();
  const c = { url: 'https://www.sec.gov/Archives/x/', tickers: ['NWND'], sortAt: t0 };
  assert.deepEqual(g.check(c), { ok: true });
  g.record(c);
  assert.deepEqual(g.check({ ...c, url: 'https://WWW.SEC.GOV/Archives/x#top' }), { ok: false, reason: 'duplicate_url' });
  assert.equal(normalizeUrl('https://WWW.SEC.GOV/a/'), 'https://www.sec.gov/a');
});

test('the 4th card for a ticker within 24 h is skipped; 25 h later it is allowed', () => {
  const g = createGuard(3, 24);
  for (let i = 0; i < 3; i++) {
    const c = { url: url(i), tickers: ['NWND'], sortAt: h(i) };
    assert.deepEqual(g.check(c), { ok: true });
    g.record(c);
  }
  assert.deepEqual(g.check({ url: url(3), tickers: ['nwnd'], sortAt: h(3) }), { ok: false, reason: 'ticker_cap', symbol: 'NWND' });
  // 25 h after the last of the three (and 27 h after the first): outside the window
  assert.deepEqual(g.check({ url: url(4), tickers: ['NWND'], sortAt: h(2 + 25) }), { ok: true });
  // other tickers are unaffected
  assert.deepEqual(g.check({ url: url(5), tickers: ['LTWR'], sortAt: h(3) }), { ok: true });
});

test('a card with several tickers is capped if any one of them is full', () => {
  const g = createGuard(1, 24);
  g.record({ url: url(10), tickers: ['ADTB'], sortAt: t0 });
  assert.deepEqual(g.check({ url: url(11), tickers: ['WGFN', 'ADTB'], sortAt: h(1) }), { ok: false, reason: 'ticker_cap', symbol: 'ADTB' });
});

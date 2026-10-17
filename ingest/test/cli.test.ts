import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixtureFetcher, parseArgs } from '../src/main.ts';
import { runOnce, type Deps } from '../src/pipeline.ts';
import { createDryRunPublisher } from '../src/publish.ts';
import { memoryCounter } from '../src/summarizer/chain.ts';
import { templateSummarizer } from '../src/summarizer/template.ts';
import { validatePublish } from '../src/validate.ts';
import type { Summarizer } from '../src/types.ts';

test('argument parsing', () => {
  assert.deepEqual(parseArgs([]), { dryRun: false, loop: false, only: [], limit: 20, json: false });
  assert.deepEqual(parseArgs(['--dry-run', '--only', 'sec,fed', '--limit', '3', '--json']), { dryRun: true, loop: false, only: ['sec', 'fed'], limit: 3, json: true });
  assert.equal(parseArgs(['--loop']).loop, true);
  assert.throws(() => parseArgs(['--only', 'guardian']), /unknown source/);
  assert.throws(() => parseArgs(['--limit', 'x']), /whole number/);
  assert.throws(() => parseArgs(['--nope']), /unknown option/);
});

function dryDeps(providers: Summarizer[] = [templateSummarizer]) {
  const dry = createDryRunPublisher();
  const lines: string[] = [];
  const requested: string[] = [];
  const fetchText = fixtureFetcher();
  const deps: Deps = {
    fetchText: async (url, kind, ttl) => { requested.push(url); return fetchText(url, kind, ttl); },
    publisher: dry.publisher, providers, counter: memoryCounter(), fredApiKey: 'dry',
    now: new Date('2026-10-17T21:00:00Z'), log: (s) => lines.push(s),
  };
  return { deps, dry, lines, requested };
}

test('dry run end to end: 3 template cards, 1 macro value, every card valid', async () => {
  const { deps, dry, lines, requested } = dryDeps();
  const stats = await runOnce(deps);
  assert.equal(stats.published, 3);
  assert.equal(stats.template, 3);
  assert.equal(stats.macro, 1);
  assert.equal(stats.failed, 0);
  for (const c of dry.cards) {
    assert.deepEqual(validatePublish(c).errors, [], c.headline);
    assert.equal(c.ai_generated, false);
  }
  assert.deepEqual(dry.cards.map((c) => c.headline).sort(), [
    'Costco Wholesale Corp files 8-K: Item 5.02, officer or director change',
    'GoPro, Inc. files 8-K: Item 2.02, results of operations',
    "Minutes of the Board's discount rate meetings on August 17, September 9, and September…",
  ]);
  // every page request went to an allowlisted government host
  for (const u of requested) {
    assert.match(new URL(u).hostname, /^(www\.sec\.gov|www\.federalreserve\.gov|api\.stlouisfed\.org)$/, u);
  }
  assert.ok(lines.some((l) => l.includes('DGS10 5.09%')));
});

test('--only and --limit', async () => {
  const a = dryDeps();
  const s = await runOnce(a.deps, { only: ['sec'], limit: 1 });
  assert.equal(s.published, 1);
  assert.equal(s.macro, 0);
  assert.ok(a.lines.includes('limit reached'));
});

test('a second run over the same feed publishes nothing new', async () => {
  const a = dryDeps();
  await runOnce(a.deps, { only: ['sec'] });
  const again = await runOnce(a.deps, { only: ['sec'] });
  assert.equal(again.published, 0);
  assert.equal(again.duplicate, 2);
});

test('with an AI provider the pipeline publishes AI cards that passed validation', async () => {
  const ai: Summarizer = {
    name: 'gemini', usesAi: true,
    async summarize(i) {
      const c = i.item.company ?? 'The Fed';
      return { headline: `${c} reports a new filing`, body: null, category: i.item.category, event_type: i.item.event_type, tickers: i.item.tickers.map((t) => t.symbol) };
    },
  };
  const a = dryDeps([ai, templateSummarizer]);
  const s = await runOnce(a.deps, { only: ['sec'] });
  assert.equal(s.ai, 2);
  assert.ok(a.dry.cards.every((c) => c.ai_generated && c.prompt_version === 'sum-v1'));
});

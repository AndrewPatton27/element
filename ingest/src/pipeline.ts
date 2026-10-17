// One ingest run: macro numbers, Fed press releases, SEC 8-Ks.
// All I/O is injected (fetchText, publisher, summarizers), so the same code runs
// live, in --dry-run from fixtures, and in tests.

import { config } from './config.ts';
import { createGuard } from './dedupe.ts';
import { buildPublishPayload, type Publisher } from './publish.ts';
import { fedItemToItem, fedPageText, mergeFedItems, parseRss } from './sources/fed.ts';
import { buildDataCard, buildObservation, fredUrl, parseFredObservations } from './sources/macro.ts';
import { filingText, findPrimaryDocUrl, parseSec8kAtom, parseTickerExchangeJson, secEntryToItem, type TickerMap } from './sources/sec.ts';
import { summarizeWithChain, type UsageCounter } from './summarizer/chain.ts';
import type { RawItem, Summarizer } from './types.ts';
import { validatePublish } from './validate.ts';

export type SourceName = 'macro' | 'fed' | 'sec';

export interface Deps {
  /** GET a URL through the allowlist. `kind` picks the host list; ttl in minutes (0 = no cache). */
  fetchText(url: string, kind: 'page' | 'api', ttlMinutes: number): Promise<string>;
  publisher: Publisher;
  providers: Summarizer[];
  counter: UsageCounter;
  fredApiKey: string | null;
  now: Date;
  log(line: string): void;
}

export interface RunOptions {
  only?: SourceName[];
  limit?: number;                    // max news items summarized per run (all sources together)
}

export interface RunStats {
  published: number;
  duplicate: number;
  ticker_cap: number;
  skipped: number;
  failed: number;
  ai: number;
  template: number;
  macro: number;
  data_cards: number;
}

export async function runOnce(deps: Deps, opts: RunOptions = {}): Promise<RunStats> {
  const only = new Set<SourceName>(opts.only?.length ? opts.only : ['macro', 'fed', 'sec']);
  const stats: RunStats = { published: 0, duplicate: 0, ticker_cap: 0, skipped: 0, failed: 0, ai: 0, template: 0, macro: 0, data_cards: 0 };
  const budget = { left: opts.limit ?? 20 };
  const guard = createGuard();

  if (only.has('macro')) await runMacro(deps, stats);
  if (only.has('fed')) {
    try {
      const lists: ReturnType<typeof parseRss>[] = [];
      for (const u of config.feeds.fedRss) lists.push(parseRss(await deps.fetchText(u, 'page', config.feedCacheTtlMinutes)));
      const items = mergeFedItems(lists, deps.now, config.fedMaxAgeDays).map(fedItemToItem);
      await processItems(items, deps, stats, budget, guard, async (it) => fedPageText(await deps.fetchText(it.url, 'page', config.cacheTtlMinutes)));
    } catch (e) {
      deps.log(`fed: feed failed: ${(e as Error).message}`);
    }
  }
  if (only.has('sec')) {
    try {
      let tickers: TickerMap | null = null;
      try {
        tickers = parseTickerExchangeJson(await deps.fetchText(config.secTickersUrl, 'page', config.cacheTtlMinutes));
      } catch (e) {
        deps.log(`sec: ticker list unavailable, keeping all companies: ${(e as Error).message}`);
      }
      const entries = parseSec8kAtom(await deps.fetchText(config.feeds.sec8k, 'page', config.feedCacheTtlMinutes));
      const items = entries.map((e) => secEntryToItem(e, tickers)).filter((x): x is RawItem => x !== null);
      deps.log(`sec: ${entries.length} feed entries, ${items.length} card candidates`);
      await processItems(items, deps, stats, budget, guard, async (it) => {
        const index = await deps.fetchText(it.url, 'page', config.cacheTtlMinutes);
        const doc = findPrimaryDocUrl(index, it.url);
        return doc ? filingText(await deps.fetchText(doc, 'page', config.cacheTtlMinutes)) : '';
      });
    } catch (e) {
      deps.log(`sec: feed failed: ${(e as Error).message}`);
    }
  }
  return stats;
}

async function processItems(
  items: RawItem[],
  deps: Deps,
  stats: RunStats,
  budget: { left: number },
  guard: ReturnType<typeof createGuard>,
  pageText: (it: RawItem) => Promise<string>,
): Promise<void> {
  for (const it of items) {
    if (budget.left <= 0) { deps.log('limit reached'); return; }
    const cand = { url: it.url, tickers: it.tickers.map((t) => t.symbol), sortAt: new Date(it.published_at) };
    const d = guard.check(cand);
    if (!d.ok) { deps.log(`skip ${d.reason}: ${it.title}`); stats.skipped++; continue; }

    const row = await deps.publisher.upsertItem(it);
    if (!row.is_new && row.status !== 'new') { stats.skipped++; continue; }   // handled in an earlier run

    let text = it.summary_text;
    try {
      const page = await pageText(it);
      if (page) text = `${it.summary_text}\n\n${page}`.slice(0, config.sourceTextMaxChars);
    } catch (e) {
      deps.log(`page text unavailable (feed text only): ${it.url}: ${(e as Error).message}`);
    }

    budget.left--;
    try {
      const r = await summarizeWithChain({ item: it, text }, deps.providers, deps.counter,
        { minIntervalMs: Math.ceil(60_000 / config.gemini.freeRpm) });
      const payload = buildPublishPayload(it, r.draft, { itemId: row.id, aiGenerated: r.ai_generated, model: r.model });
      const v = validatePublish(payload);
      if (!v.ok) throw new Error(v.errors.join('; '));
      const res = await deps.publisher.publishBlurb(payload);
      stats[res.status === 'published' ? 'published' : res.status]++;
      if (res.status === 'published') {
        stats[r.ai_generated ? 'ai' : 'template']++;
        guard.record(cand);
      }
      deps.log(`${res.status} [${r.provider}] ${payload.headline}${r.log.length > 1 ? `  (${r.log.join(' | ')})` : ''}`);
    } catch (e) {
      stats.failed++;
      deps.log(`failed: ${it.url}: ${(e as Error).message}`);
      await deps.publisher.setItemStatus(row.id, 'failed', (e as Error).message).catch(() => {});
    }
  }
}

async function runMacro(deps: Deps, stats: RunStats): Promise<void> {
  if (!deps.fredApiKey) { deps.log('macro: FRED_API_KEY not set, skipping'); return; }
  const start = new Date(deps.now.getTime() - config.fredLookbackDays * 86_400_000).toISOString().slice(0, 10);
  for (const id of config.macroSeries) {
    try {
      const url = new URL(fredUrl(id, start));
      url.searchParams.set('api_key', deps.fredApiKey);          // never logged: errors print the host only
      const points = parseFredObservations(await deps.fetchText(url.toString(), 'api', 60));
      const obs = buildObservation(id, points);
      if (!obs) { deps.log(`macro: ${id}: not enough data`); continue; }
      await deps.publisher.upsertMacro(obs);
      stats.macro++;
      const card = buildDataCard(obs);
      if (card) {
        const res = await deps.publisher.publishBlurb(card);
        if (res.status === 'published') stats.data_cards++;
        deps.log(`macro: ${id} ${obs.display_value} (${obs.change_text ?? 'no change'}) -> data card ${res.status}`);
      } else {
        deps.log(`macro: ${id} ${obs.display_value} (${obs.change_text ?? 'no change'}) -> numbers panel only`);
      }
    } catch (e) {
      deps.log(`macro: ${id}: ${(e as Error).message}`);
    }
  }
}

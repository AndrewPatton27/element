// CLI.  node src/main.ts [--dry-run] [--once | --loop | --rewrite] [--only sec,fed,...] [--limit N] [--json]
//   --dry-run  read fixtures from src/fixtures, no network, no keys, publish nothing
//   --once     one run (default)
//   --loop     run every config.pollIntervalMinutes until stopped (Ctrl+C)
//   --rewrite  redo published cards written with an older prompt/template version, in place
//              (--limit = max cards; with --dry-run: the cards in src/fixtures/rewrite-cards.json)
//   --only     comma-separated subset of sources (macro, fed, bea, fedreg, sec, wiki, cpsc, usgs, nasa)
//   --limit    max news items summarized per run (default 20)
//   --json     with --dry-run: print the card payloads as JSON
// Inputs: command-line flags and, for live runs, .env / process.env (keys are never printed).
// Outputs: log lines on stdout, cards published to Supabase (live) or printed (dry run); exit code.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchAllowed } from './allowlist.ts';
import { config, describeEnv, fedRegisterUrls, readEnv } from './config.ts';
import { runOnce, SOURCE_NAMES, type Deps, type SourceName } from './pipeline.ts';
import { runRewrite } from './rewrite.ts';
import type { RevisableCard } from './types.ts';
import { createDryRunPublisher, createSupabasePublisher } from './publish.ts';
import { fileCounter, memoryCounter } from './summarizer/chain.ts';
import { buildProviders } from './summarizer/providers.ts';
import { templateSummarizer } from './summarizer/template.ts';
import { cpscUrl } from './sources/cpsc.ts';
import { nasaFeedUrl } from './sources/nasa.ts';
import { wikimediaUserAgent, wikiFeedUrl } from './sources/wiki.ts';

export interface Args {
  dryRun: boolean;
  loop: boolean;
  only: SourceName[];
  limit: number;
  json: boolean;
  rewrite: boolean;
}

/** Parses CLI flags (see the header). Throws on an unknown option, an unknown --only source or a bad --limit. */
export function parseArgs(argv: string[]): Args {
  const a: Args = { dryRun: false, loop: false, only: [], limit: 20, json: false, rewrite: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--dry-run') a.dryRun = true;
    else if (k === '--once') a.loop = false;
    else if (k === '--loop') a.loop = true;
    else if (k === '--json') a.json = true;
    else if (k === '--rewrite') a.rewrite = true;
    else if (k === '--only') {
      const v = (argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      for (const s of v) if (!(SOURCE_NAMES as readonly string[]).includes(s)) throw new Error(`--only: unknown source "${s}" (use ${SOURCE_NAMES.join(', ')})`);
      a.only = v as SourceName[];
    } else if (k === '--limit') {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 0) throw new Error('--limit needs a whole number');
      a.limit = n;
    } else throw new Error(`unknown option: ${k}`);
  }
  return a;
}

// ---- dry-run fixtures ----------------------------------------------------------------

const FIXTURES = new URL('./fixtures/', import.meta.url);
/** The dry run's clock: the fixtures are from this day. */
export const DRY_NOW = new Date('2026-10-17T21:00:00Z');
const fixture = (name: string) => readFileSync(new URL(name, FIXTURES), 'utf8');

/** Maps live URLs to local fixture files. Unknown URLs fail like a network error. */
export function fixtureFetcher(): Deps['fetchText'] {
  return async (url) => {
    if (url === config.feeds.sec8k) return fixture('sec-8k-feed.atom.xml');
    if (url === config.secTickersUrl) return fixture('sec-company-tickers-watch.json');
    if (url === config.secSubmissionsUrl.replace('{cik}', '0000320193')) return fixture('sec-submissions-CIK0000320193.json');
    if ((config.feeds.fedRss as readonly string[]).includes(url)) return fixture('fed-press-monetary.rss.xml');
    if (url === config.feeds.beaRss) return fixture('bea-releases.rss.xml');
    if (url === wikiFeedUrl(DRY_NOW)) return fixture('wiki-featured-2026-10-17.json');
    if (url === wikiFeedUrl(DRY_NOW, 1)) return fixture('wiki-featured-2026-10-16.json');
    if (url === wikiFeedUrl(DRY_NOW, 2)) return '{"tfa":{},"mostread":{}}';          // a past day without a `news` list = no items
    if (url === cpscUrl(DRY_NOW)) return fixture('cpsc-recalls-2026-10-03.json');
    if (url === config.usgs.url) return fixture('usgs-significant-week.geojson');
    if (url === config.nasa.feedUrl) return fixture('nasa-news-release.rss.xml');
    if (url === nasaFeedUrl(2)) return fixture('nasa-news-release-page2.rss.xml');
    const fr = fedRegisterUrls();
    if (url === fr[0]) return fixture('fedreg-agencies.json');
    if (url === fr[1]) return fixture('fedreg-significant.json');
    if (/www\.sec\.gov\/Archives\/.+-index\.htm$/.test(url)) return fixture('sec-filing-index.html');
    if (/www\.sec\.gov\/Archives\/.+\/primary-8k\.htm$/.test(url)) return fixture('sec-primary-8k.html');
    if (/www\.sec\.gov\/Archives\/.+\/ex99-1\.htm$/.test(url)) return fixture('sec-exhibit-99-1.html');
    if (/www\.federalreserve\.gov\/newsevents\/pressreleases\//.test(url)) return fixture('fed-press-release.html');
    if (url.startsWith(config.feeds.fredObservations) && new URL(url).searchParams.get('series_id') === 'DGS10') {
      return fixture('fred-DGS10-observations.json');
    }
    throw new Error(`no fixture for ${new URL(url).hostname}${new URL(url).pathname}`);
  };
}

// ---- live fetcher -----------------------------------------------------------------------

function liveFetcher(userAgent: string, supabaseHost: string): Deps['fetchText'] {
  // Wikimedia requires its own User-Agent format; the contact comes from SEC_USER_AGENT.
  const wikiUa = wikimediaUserAgent(userAgent) ?? userAgent;
  return async (url, kind, ttl) => {
    const r = await fetchAllowed(url, {
      kind,
      userAgent: new URL(url).hostname === 'en.wikipedia.org' ? wikiUa : userAgent,
      extraHosts: [supabaseHost],
      cacheTtlMinutes: kind === 'page' ? ttl : 0,          // API responses (with keys in URLs) are never cached to disk
    });
    if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status} from ${new URL(url).hostname}`);
    return r.text;
  };
}

function loadDotEnv(): void {
  for (const p of ['.env', '../.env']) {
    if (existsSync(p)) {
      try { process.loadEnvFile(p); } catch { /* ignore malformed file; readEnv reports what is missing */ }
      return;
    }
  }
}

/**
 * Recompute the Trending boosts after a run. Never fails the run: if the database does not have
 * the RPC yet (older migration) or the call errors, it logs one line and moves on.
 */
export async function refreshTrendingSafely(publisher: Deps['publisher'], log: (s: string) => void): Promise<void> {
  if (!publisher.refreshTrending) return;
  try {
    const r = await publisher.refreshTrending();
    log(`trending refreshed: ${JSON.stringify(r)}`);
  } catch (e) {
    log(`warning: trending refresh failed (${(e as Error).message}); cards are still published`);
  }
}

/**
 * CLI entry point. Dry run: fixtures, template summarizer, in-memory publisher. Live: reads the
 * environment, builds the provider chain and the Supabase publisher, then runs once, in a loop,
 * or --rewrite. Returns the process exit code.
 */
export async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const log = (s: string) => console.log(s);

  if (args.rewrite && args.loop) throw new Error('--rewrite cannot be combined with --loop');
  if (args.dryRun) {
    const dry = createDryRunPublisher(args.rewrite ? (JSON.parse(fixture('rewrite-cards.json')) as { cards: RevisableCard[] }).cards : []);
    const deps: Deps = {
      fetchText: fixtureFetcher(),
      publisher: dry.publisher,
      providers: [templateSummarizer],                       // no keys in a dry run: template cards only
      counter: memoryCounter(),
      fredApiKey: 'dry-run',                                  // fixture fetcher ignores it
      now: DRY_NOW,                                           // fixtures are from this day
      log,
    };
    if (args.rewrite) {
      const rs = await runRewrite(deps, { limit: args.limit });
      log(`dry run rewrite: ${JSON.stringify(rs)}`);
      if (args.json) console.log(JSON.stringify(dry.revisions, null, 2));
      return 0;
    }
    const stats = await runOnce(deps, { only: args.only, limit: args.limit });
    await refreshTrendingSafely(deps.publisher, log);
    log(`dry run: ${JSON.stringify(stats)}`);
    if (args.json) console.log(JSON.stringify({ cards: dry.cards, macro: dry.macro }, null, 2));
    return 0;
  }

  loadDotEnv();
  const env = readEnv(process.env);
  log(`ingest starting: ${describeEnv(env)}`);
  const { providers, skipped } = buildProviders(env);
  log(`summarizers: ${providers.map((p) => p.name).join(' -> ')}${skipped.length ? `; skipped: ${skipped.join(', ')}` : ''}`);
  const deps: Deps = {
    fetchText: liveFetcher(env.secUserAgent, new URL(env.supabaseUrl).hostname),
    publisher: createSupabasePublisher({ url: env.supabaseUrl, key: env.supabaseServiceRoleKey }),
    providers,
    counter: fileCounter('state/ai-usage.json'),
    fredApiKey: env.fredApiKey,
    now: new Date(),
    log,
  };
  if (args.rewrite) {
    const rs = await runRewrite(deps, { limit: args.limit });
    log(`rewrite finished: ${JSON.stringify(rs)}`);
    return 0;
  }
  do {
    deps.now = new Date();
    const stats = await runOnce(deps, { only: args.only, limit: args.limit });
    await refreshTrendingSafely(deps.publisher, log);
    log(`run finished ${deps.now.toISOString()}: ${JSON.stringify(stats)}`);
    if (args.loop) await new Promise((r) => setTimeout(r, config.pollIntervalMinutes * 60_000));
  } while (args.loop);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => { console.error(`error: ${(e as Error).message}`); process.exit(1); },
  );
}

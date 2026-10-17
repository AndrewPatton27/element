// CLI.  node src/main.ts [--dry-run] [--once | --loop] [--only sec,fed,macro] [--limit N] [--json]
//   --dry-run  read fixtures from src/fixtures, no network, no keys, publish nothing
//   --once     one run (default)
//   --loop     run every config.pollIntervalMinutes until stopped (Ctrl+C)
//   --only     comma-separated subset of sources
//   --limit    max news items summarized per run (default 20)
//   --json     with --dry-run: print the card payloads as JSON

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchAllowed } from './allowlist.ts';
import { config, describeEnv, readEnv } from './config.ts';
import { runOnce, type Deps, type SourceName } from './pipeline.ts';
import { createDryRunPublisher, createSupabasePublisher } from './publish.ts';
import { fileCounter, memoryCounter } from './summarizer/chain.ts';
import { createGeminiSummarizer } from './summarizer/gemini.ts';
import { templateSummarizer } from './summarizer/template.ts';
import type { Summarizer } from './types.ts';

export interface Args {
  dryRun: boolean;
  loop: boolean;
  only: SourceName[];
  limit: number;
  json: boolean;
}

export function parseArgs(argv: string[]): Args {
  const a: Args = { dryRun: false, loop: false, only: [], limit: 20, json: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--dry-run') a.dryRun = true;
    else if (k === '--once') a.loop = false;
    else if (k === '--loop') a.loop = true;
    else if (k === '--json') a.json = true;
    else if (k === '--only') {
      const v = (argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      for (const s of v) if (!['sec', 'fed', 'macro'].includes(s)) throw new Error(`--only: unknown source "${s}" (use sec, fed, macro)`);
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
const fixture = (name: string) => readFileSync(new URL(name, FIXTURES), 'utf8');

/** Maps live URLs to local fixture files. Unknown URLs fail like a network error. */
export function fixtureFetcher(): Deps['fetchText'] {
  return async (url) => {
    if (url === config.feeds.sec8k) return fixture('sec-8k-feed.atom.xml');
    if (url === config.secTickersUrl) return fixture('sec-company-tickers-exchange.json');
    if ((config.feeds.fedRss as readonly string[]).includes(url)) return fixture('fed-press-monetary.rss.xml');
    if (/www\.sec\.gov\/Archives\/.+-index\.htm$/.test(url)) return fixture('sec-filing-index.html');
    if (/www\.sec\.gov\/Archives\/.+\/primary-8k\.htm$/.test(url)) return fixture('sec-primary-8k.html');
    if (/www\.federalreserve\.gov\/newsevents\/pressreleases\//.test(url)) return fixture('fed-press-release.html');
    if (url.startsWith(config.feeds.fredObservations) && new URL(url).searchParams.get('series_id') === 'DGS10') {
      return fixture('fred-DGS10-observations.json');
    }
    throw new Error(`no fixture for ${new URL(url).hostname}${new URL(url).pathname}`);
  };
}

// ---- live fetcher -----------------------------------------------------------------------

function liveFetcher(userAgent: string, supabaseHost: string): Deps['fetchText'] {
  return async (url, kind, ttl) => {
    const r = await fetchAllowed(url, {
      kind,
      userAgent,
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

export async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const log = (s: string) => console.log(s);

  if (args.dryRun) {
    const dry = createDryRunPublisher();
    const deps: Deps = {
      fetchText: fixtureFetcher(),
      publisher: dry.publisher,
      providers: [templateSummarizer],                       // no keys in a dry run: template cards only
      counter: memoryCounter(),
      fredApiKey: 'dry-run',                                  // fixture fetcher ignores it
      now: new Date('2026-10-17T21:00:00Z'),                  // fixtures are from this day
      log,
    };
    const stats = await runOnce(deps, { only: args.only, limit: args.limit });
    log(`dry run: ${JSON.stringify(stats)}`);
    if (args.json) console.log(JSON.stringify({ cards: dry.cards, macro: dry.macro }, null, 2));
    return 0;
  }

  loadDotEnv();
  const env = readEnv(process.env);
  log(`ingest starting: ${describeEnv(env)}`);
  const providers: Summarizer[] = [];
  for (const name of config.providerOrder) {
    if (name === 'gemini' && env.geminiApiKey) providers.push(createGeminiSummarizer({ apiKey: env.geminiApiKey }));
    if (name === 'template') providers.push(templateSummarizer);
  }
  const deps: Deps = {
    fetchText: liveFetcher(env.secUserAgent, new URL(env.supabaseUrl).hostname),
    publisher: createSupabasePublisher({ url: env.supabaseUrl, key: env.supabaseServiceRoleKey }),
    providers,
    counter: fileCounter('state/ai-usage.json'),
    fredApiKey: env.fredApiKey,
    now: new Date(),
    log,
  };
  do {
    deps.now = new Date();
    const stats = await runOnce(deps, { only: args.only, limit: args.limit });
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

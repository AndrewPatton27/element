# ingest/

The ingest script runs on a laptop (Node 22.18 or newer, no dependencies). Each run collects public filings, releases and economic numbers, turns them into short cards, checks every card, and writes it to Supabase.

## What one run does

1. **Macro numbers** (`src/sources/macro.ts`): fetches FRED observations for DGS2, DGS10, DFF, CPIAUCSL, UNRATE and DCOILWTICO and formats them ("4.02%", "+0.06 pts", CPI as a year-over-year rate). It stores them with `api.upsert_macro`. A **data card** is published only for a new observation that moved enough (yields and the fed funds rate by 0.05 points or more, oil by 2% or more); CPI and unemployment get a card for every new month. Data cards are templates (no AI) and cite the original agency.
2. **Federal Reserve** (`src/sources/fed.ts`): reads the press-release RSS feeds (monetary policy + all releases), drops anything older than 7 days, and fetches each release page from `www.federalreserve.gov`.
3. **SEC 8-K** (`src/sources/sec.ts`): reads the current 8-K Atom feed. It keeps original 8-Ks (not amendments) that contain a tracked item (1.01, 1.02, 2.01, 2.02, 2.05, 2.06, 3.01, 4.02, 5.02, 7.01, 8.01) from companies listed on NYSE, Nasdaq, NYSE American or Cboe (from SEC's ticker list). It then fetches the filing index and the primary document. Exhibits are not followed.
4. For each news item, in order:
   1. Duplicate and burst guard (`src/dedupe.ts`): same URL means skip; at most 3 cards per ticker within 24 hours.
   2. `api.upsert_item` records the item; items handled in an earlier run are skipped.
   3. Summarizer chain (`src/summarizer/chain.ts`). The license check comes first: only public-domain and SEC filing text may be sent. Next is Gemini (`src/summarizer/gemini.ts`, JSON output); a card it writes must pass the validator. A rejected card is retried once with the validator's errors; after that, or on a rate limit or error, the script falls back to a **template card** (`src/summarizer/template.ts`, no AI, built only from the feed's metadata, `ai_generated = false`). The provider list is in `config.providerOrder`.
   4. The validator (`src/validate.ts`) checks:
      - shape and length (headline 90 characters, body 60 words)
      - no advice language
      - every number and ticker must appear in the source text
      - the copy limit: at most 10 consecutive words from a filing, 25 from public-domain government text
   5. `api.publish_blurb` stores the card and its source link, then ranks it. The database repeats the duplicate, ticker-cap, source and license checks.
5. A summary line per card and a final count are printed.

Every outbound request goes through `src/allowlist.ts`:
- Full pages come only from `www.sec.gov`, `www.federalreserve.gov` and `www.bls.gov`.
- Data APIs are limited to FRED, Treasury, Gemini and the project's Supabase host.
- Redirects are re-checked at every hop. Only https is allowed, at about 5 requests per second, with a declared SEC User-Agent.
- Page responses are cached in `cache/` (git-ignored). API responses are not cached, since FRED puts its key in the URL.

## Commands

```sh
cd ingest
node -v                       # must be 22.18 or newer
npm test                      # offline tests (fixtures only, no network, no keys)
npm run dry-run               # whole pipeline on fixtures; prints the cards it would publish
node src/main.ts --dry-run --json          # same, plus the card payloads as JSON
npm run ingest                # one live run (needs .env)
node src/main.ts --once --only sec --limit 3
npm run ingest:loop           # every 10 minutes until Ctrl+C
```

Options: `--dry-run`, `--once` (default), `--loop`, `--only sec,fed,macro`, `--limit N` (max news items summarized per run, default 20), `--json` (dry run only).

## Inputs

Environment variables, read from `.env` in this folder or the repo root (git-ignored):

| Name | Needed for |
|---|---|
| `SUPABASE_URL` | all live runs; the script refuses to start if it is missing or a placeholder |
| `SUPABASE_SERVICE_ROLE_KEY` | all live runs. Supabase now calls this the **secret** key; the old name is kept |
| `SEC_USER_AGENT` | all live runs: `"<app name> <contact email>"` |
| `GEMINI_API_KEY` | AI cards (without it every card is a template card) |
| `FRED_API_KEY` | macro numbers (skipped without it) |

Keys are never printed (`[set]` / `[missing]` only), never put in URLs except where FRED requires it, and never written to the cache.

## Outputs

- Rows in Supabase through the service-role RPCs `api.upsert_item`, `api.set_item_status`, `api.publish_blurb`, `api.upsert_macro`.
- `state/ai-usage.json`: AI calls per provider for the current UTC day. The daily cap is `min(600, free requests per day)` (`src/config.ts`).
- `cache/`: cached page responses.

## Files

| Path | Purpose |
|---|---|
| `src/config.ts` | every tunable value + environment check |
| `src/main.ts` | command line, live and dry-run wiring |
| `src/pipeline.ts` | one run (sources, guards, summarize, publish) with injected I/O |
| `src/allowlist.ts` | the only way to make an outbound request |
| `src/sources/` | `sec.ts`, `fed.ts`, `macro.ts` parsers and formatters |
| `src/summarizer/` | `chain.ts`, `gemini.ts`, `template.ts` |
| `src/validate.ts` | draft and publish checks |
| `src/dedupe.ts` | URL duplicate and per-ticker cap |
| `src/publish.ts` | PostgREST client, dry-run publisher, payload builder |
| `src/ranking.ts` | copy of the database ranking formula (tests only) |
| `src/html.ts` | small HTML/XML helpers |
| `src/fixtures/` | labeled sample inputs (REAL / RECONSTRUCTED / SYNTHETIC), see its README |
| `test/` | `node:test` files |

## Known limits

- Feeds are parsed with regular expressions sized for these sources. A layout change at the SEC or Fed can break parsing; tests and the dry run show it.
- Most 8-K primary documents are thin cover pages, so many SEC cards will be template cards. That is intended: they stay truthful.
- The SEC ticker-list layout and the Gemini response-schema fields follow the official docs but were not checked against a live response.

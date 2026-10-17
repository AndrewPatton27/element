# ingest/

The ingest script runs on a laptop (Node 22.18 or newer, no dependencies). Each run collects public filings, releases and economic numbers, turns them into short cards, checks every card, and writes it to Supabase.

## What one run does

1. **Macro numbers** (`src/sources/macro.ts`): fetches FRED observations for 12 series: DGS2, DGS10, DFF, CPIAUCSL, UNRATE, DCOILWTICO (daily or monthly), GASREGW and ICSA (weekly), RSAFS, HOUST and PAYEMS (monthly) and A191RL1Q225SBEA (real GDP growth, quarterly). It formats them ("4.02%", "+0.06 pts", "$4.33", "199,000", "$745.0B", CPI as a year-over-year rate) and stores them with `api.upsert_macro`. A **data card** is published only for a new observation that moved enough: yields and the fed funds rate by 0.05 points or more, oil by 2%, gas by 1%, jobless claims by 5%. Monthly and quarterly series get one card per new period. Weekly cards say "week of" / "week ending" and "prior week"; quarterly cards say "Q2 2026" and "prior quarter". Data cards are templates (no AI) and cite the original agency. MORTGAGE30US (Freddie Mac copyright) is on a forbidden list and is refused. The numbers panel in the app shows a top set of 8 (column `in_numbers` in `core.macro_series`).
2. **Federal Reserve** (`src/sources/fed.ts`): reads the press-release RSS feeds (monetary policy + all releases), drops anything older than 7 days, and fetches each release page from `www.federalreserve.gov`.
3. **BEA** (`src/sources/bea.ts`): reads the U.S. Bureau of Economic Analysis news-release RSS from `apps.bea.gov` (an API host, not a page host) and keeps releases from the last 30 days. Only the feed's own title and description are summarized; BEA pages are never downloaded. Cards are public domain, category `economy`, event type `macro_release`, and carry "Source: U.S. Bureau of Economic Analysis".
4. **Federal Register** (`src/sources/fedreg.ts`): one JSON query to the Federal Register documents API (no key): final rules from agencies whose rules reach people's wallets (CFPB, Transportation, FTC, IRS, Treasury, the Fed, SEC, FCC, Energy, Education). The "significant rules from any agency" query is off (`config.fedRegister.significantQuery = false`). Federal Register cards are only published when the AI scores them 3 or more for everyday relevance; there are no template Federal Register cards. Results are merged on `document_number` and kept for 14 days. The AI sees only each document's `abstract`; a document without one (corrections, for example) is skipped and logged. No page is downloaded (`www.federalregister.gov` is on the API host list only). The card headline is written by the AI (or, for a template card, is the title cut to 90 characters); the source link is the document's `html_url`; future-dated (scheduled) issues get today's time; category `policy`, event type empty (ranking default). Credit line: "Source: Federal Register (National Archives), <agency>". Copy limit 25 words. Poll at most hourly (no published rate limit).
5. **SEC 8-K** (`src/sources/sec.ts`): only for about 150 household-name companies (`config.watchCompanies`, by ticker; CIKs resolved from SEC's ticker list, a ticker missing from the list is logged and skipped; without the list the SEC source is skipped for that run). Filings come from the current 8-K Atom feed plus each watched company's filing list (`https://data.sec.gov/submissions/CIK##########.json`, API host list, last `config.secLookbackDays` = 10 days), merged on accession number. It keeps original 8-Ks (not amendments) with at least one watch item (`config.watchItems`: 1.01, 1.03, 1.05, 2.01, 2.02, 2.05, 4.02, 5.02). A filing whose only watch item is 5.02 is skipped as `routine_5.02` unless one sentence of its Item 5.02 text names the CEO, CFO, chair or president together with a change word (resigns, retires, appointed, steps down, successor, ...); director-only changes, committee seats and pay plans are routine. Item 2.05 (layoffs, restructuring) is category markets with the default rank weight. Filings whose items are only 7.01, 8.01 and 9.01 (Reg FD, other events, exhibits) are skipped before any page fetch or AI call and counted as `skipped` (`config.sec8kLowValueItems`). It then fetches the filing index and the primary document. Exhibits are not followed.
   - **Category and event type come from the item numbers, in code:** 2.02, 4.01, 4.02 → earnings / earnings; 1.01, 1.02, 2.01 → deals / deal; 5.02 → markets / exec_change; 1.05 (cyber incident) → tech / none; 1.03 (bankruptcy) and 3.01 (delisting notice) → markets / none. When several apply, the order is 1.03, 2.02, 4.02, 4.01, 1.05, 2.01, 5.02, 1.01, 1.02, 3.01. Only when no item decides (for example 2.05 or 2.06 alone) is the AI's choice used, limited to the 9 categories and the event types earnings, deal, exec_change, insider.
5b. **Broad topics** (feed or API text only; hosts on the API list, never pages; category and event type fixed in code; the AI's category is ignored):
   - **Wikipedia "In the news"** (`src/sources/wiki.ts`, `--only wiki`) -> World. Today's UTC featured feed from `en.wikipedia.org` (a missing `news` key = no items). The AI sees the story sentence plus the first linked article's plain-text extract (max 1,500 chars); thumbnails are never read. Source link = that article; license `cc_by_sa`; card and source attribution `Adapted from Wikipedia ("<title>") · CC BY-SA 4.0`; 10-word copy limit. Date from the `<!--Mon DD-->` comment. The request carries a Wikimedia-format User-Agent (`Element/0.1 (<contact>) node-fetch`), the contact taken from `SEC_USER_AGENT`.
   - **CPSC recalls** (`src/sources/cpsc.ts`, `--only cpsc`) -> Recalls & Safety, event `recall`. saferproducts.gov JSON, last 14 days, newest 5 per run. The AI sees Title, Description, Hazards and Remedies; source link = the recall URL in the JSON; credit "Source: U.S. Consumer Product Safety Commission". License partly verified (US government work).
   - **USGS significant earthquakes** (`src/sources/usgs.ts`, `--only usgs`) -> Science & Space, event `science`. Template card, no AI: headline = the USGS title, body = magnitude, place, UTC time, alert level (and an ocean-region note). Source link = the event page; credit "Credit: U.S. Geological Survey".
   - **NASA news releases** (`src/sources/nasa.ts`, `--only nasa`) -> Science & Space. RSS; only links under `https://www.nasa.gov/news-release/` (APOD and image articles dropped). The AI sees the release text from the feed with figures and captions removed. Credit "Source: NASA".
   Wikipedia, CPSC and NASA cards need the AI (relevance gate applies); their template cards are not published.
6. For each news item, in order:
   1. Duplicate and burst guard (`src/dedupe.ts`): same URL means skip; at most 3 cards per ticker within 24 hours.
   2. `api.upsert_item` records the item; items handled in an earlier run are skipped.
   3. Summarizer chain (`src/summarizer/chain.ts`), order set by `config.providerOrder` = Gemini, Groq, template. The license check comes first: only public-domain and SEC filing text may be sent, to any provider.
      - **Gemini** (`src/summarizer/gemini.ts`, JSON output) is tried first. A card it writes must pass the validator; a rejected card is retried once with the validator's errors.
      - **Groq** (`src/summarizer/groq.ts`, OpenAI-compatible chat API, `openai/gpt-oss-120b`, JSON schema output) is used when Gemini's daily cap is reached, on a 429 or other HTTP error, on a timeout, when `GEMINI_API_KEY` is missing, or after both Gemini attempts were rejected. Same prompt, same validator, same one retry. Groq gets at most 6,000 characters of source text because its free tier is limited by tokens per minute.
      - **Template card** (`src/summarizer/template.ts`, no AI, built only from the feed's metadata, plain wording, `ai_generated = false`) if both fail or are capped. Template cards have no relevance score, so they are only published for Fed and BEA releases and for watch-list 8-Ks whose main item is 2.02, 5.02, 1.05, 4.02 or 2.05 (`config.templateSecItems`). Other items stay `new` and are retried on a later run with a working AI provider.
      - **Everyday relevance:** the AI also returns `everyday_relevance` (1 to 5: would a typical college student or young adult who does not invest notice or be affected?). Below `config.minEverydayRelevance` (3) the card is not published; the log says `skip low_relevance (n)` and the score is stored in `ingest.items.status_note`. The skip costs only that one AI call (no retry). The score is not part of the card.
      - **In-depth detail (prompt `sum-v3`):** the same AI call also writes `detail` (shown when a card is opened): 2-4 short paragraphs (at most 180 words together) and 3-5 key points (at most 15 words each). It is checked like the card (numbers in the source, no advice words, copy limit per license). If only the detail fails, the card is published with `detail` null. Template and data cards get a factual detail built from their own fields (`src/detail.ts`; data cards: value, change, previous value for rates, what the number measures, the agency).
      - **Writing style (prompt `sum-v2`, kept in `sum-v3`):** plain words at about an 8th-grade reading level, short sentences, no jargon (unavoidable terms explained in a few words); sentence 1 says what happened; the last sentence says why it matters to a regular person only if that follows from the source.
      - Each AI provider has its own daily cap and its own spacing between calls (Gemini 500/day, 5 s; Groq 80/day, 30 s). Spacing is `60 s / (RPM x rpmSafetyFactor)` with a 0.8 factor, so Gemini runs at 12 calls a minute, not its full 15. After a 429 the provider is skipped for 60 s for the rest of the run (`rateLimitCooldownMs`). If a draft fails only because the body is too long and the headline fits, the body is cut after the last whole sentence that fits and checked again; a headline that is too long is never cut. The card records the model that actually wrote it. A provider without a key is skipped (`src/summarizer/providers.ts`); the start-up line lists which ones are active.
   4. The validator (`src/validate.ts`) checks:
      - shape and length (headline 90 characters, body 60 words)
      - no advice language
      - every number and ticker must appear in the source text
      - the copy limit: at most 10 consecutive words from a filing, 25 from public-domain government text
   5. `api.publish_blurb` stores the card and its source link, then ranks it. The database repeats the duplicate, ticker-cap, source and license checks.
7. A summary line per card and a final count are printed.

Every outbound request goes through `src/allowlist.ts`:
- Full pages come only from `www.sec.gov`, `www.federalreserve.gov` and `www.bls.gov`.
- Data APIs are limited to FRED, Treasury, BEA's RSS host (`apps.bea.gov`), the Federal Register API (`www.federalregister.gov`), SEC's per-company filing lists (`data.sec.gov`, JSON only), Wikipedia's REST feed (`en.wikipedia.org`), CPSC (`www.saferproducts.gov`), USGS (`earthquake.usgs.gov`), NASA's RSS (`www.nasa.gov`), Gemini, Groq (`api.groq.com`) and the project's Supabase host. None of these is a page host.
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
node src/main.ts --dry-run --only bea   # BEA releases from the fixture
npm run ingest:loop           # every 10 minutes until Ctrl+C
```

`--rewrite` redoes published cards written with an older prompt or template version, in place (same card id, category, sources and feed position; revision + 1 and `updated_at` set). It lists them with `api.blurbs_to_revise` and updates them with `api.revise_blurb` (both service-role only, migration `20261017050000_detail_revise.sql`). AI cards are re-summarized from the same licensed text (re-fetched through the same allowlisted paths) through the same chain, validator and relevance gate: relevance below 3 hides the card, and a card with no valid new draft stays unchanged. Template and data cards are rebuilt with the current plain templates (no AI). `--limit N` caps the cards per run. `--rewrite --dry-run` works on `src/fixtures/rewrite-cards.json`.

Options: `--dry-run`, `--once` (default), `--loop`, `--rewrite`, `--only sec,fed,bea,fedreg,macro,wiki,cpsc,usgs,nasa`, `--limit N` (max news items summarized per run, default 20), `--json` (dry run only).

## Inputs

Environment variables, read from `.env` in this folder or the repo root (git-ignored):

| Name | Needed for |
|---|---|
| `SUPABASE_URL` | all live runs; the script refuses to start if it is missing or a placeholder |
| `SUPABASE_SERVICE_ROLE_KEY` | all live runs. Supabase now calls this the **secret** key; the old name is kept |
| `SEC_USER_AGENT` | all live runs: `"<app name> <contact email>"`. Its email (or the whole value) is also the contact in the Wikimedia User-Agent for Wikipedia requests |
| `GEMINI_API_KEY` | AI cards, primary provider (without it Groq is used, or a template card if Groq has no key either) |
| `GROQ_API_KEY` | optional AI fallback (skipped without it) |
| `FRED_API_KEY` | macro numbers (skipped without it) |

Keys are never printed (`[set]` / `[missing]` only), never put in URLs except where FRED requires it, and never written to the cache.

## Outputs

- Rows in Supabase through the service-role RPCs `api.upsert_item`, `api.set_item_status`, `api.publish_blurb`, `api.upsert_macro`.
- `state/ai-usage.json`: AI calls per provider for the current UTC day. Gemini's daily cap is `min(600, free requests per day)` = 500; Groq's is `min(80, requests per day, tokens per day / estimated tokens per call)` = 80 (`src/config.ts`).
- `cache/`: cached page responses.

## Files

| Path | Purpose |
|---|---|
| `src/config.ts` | every tunable value + environment check |
| `src/main.ts` | command line, live and dry-run wiring |
| `src/pipeline.ts` | one run (sources, guards, summarize, publish) with injected I/O |
| `src/allowlist.ts` | the only way to make an outbound request |
| `src/sources/` | `sec.ts`, `fed.ts`, `bea.ts`, `fedreg.ts`, `macro.ts` parsers and formatters |
| `src/summarizer/` | `chain.ts`, `gemini.ts`, `groq.ts`, `template.ts`, `providers.ts` |
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
- The SEC ticker-list layout and the Gemini and Groq request/response fields follow the official docs but were not checked against a live response. If Groq rejects the JSON schema mode with HTTP 400, the adapter retries that call once in plain JSON mode.
- Groq pacing (30 s between calls) means a run where Gemini is down entirely takes about 10 minutes for 20 items.

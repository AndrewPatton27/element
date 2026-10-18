# supabase

The Postgres database behind Element (Supabase free tier). The SQL files here are the only source of truth for the schema. There are no Edge Functions in this version: the ingest script (`ingest/`) runs on a laptop and writes through service-role RPCs.

## Schemas

| Schema | Exposed? | What is in it |
|---|---|---|
| `ingest` | no | raw collected items (`ingest.items`) |
| `core` | no | published cards and their sources, macro numbers, ranking settings, app config, categories, user prefs and events |
| `api` | **yes, the only one** | views and functions the app and the ingest script call |

Row-level security is on for every table. The app never reads `core` or `ingest` directly; everything goes through `api`.

## Migrations (`migrations/`, run in this order)

| File | What it does |
|---|---|
| `20261017000000_init.sql` | Schemas, tables, constraints, row-level security and privileges. Ranking (`core.refresh_rank`: importance × recency, half-life 8 h). `api.feed` (modes `top`/`latest`, keyset paging), `api.numbers_to_know`, `api.app_config`, `api.categories`. Service-role-only RPCs `api.upsert_item`, `api.set_item_status`, `api.publish_blurb` (at least 1 source, per-ticker cap, URL dedupe), `api.upsert_macro`. Seed data: categories, ranking weights, macro series, app config with the disclaimer and the FRED notice. |
| `20261017010000_more_series.sql` | Six more FRED series (gas price, jobless claims, retail sales, housing starts, payrolls, GDP growth) and an `in_numbers` flag that picks the series shown in the numbers panel. |
| `20261017020000_broad_topics.sql` | Categories World, Science & Space and Recalls & Safety; plainer names (Government, Money, Business); the `cc_by_sa` license class and its notice; weights for the new event types; `api.categories` lists only categories that have published cards. |
| `20261017030000_accounts.sql` | Signed-in users: `core.user_prefs`, `core.user_events` (row-level security, owner-only policies) and functions for the `authenticated` role only: `api.get_prefs`, `api.set_prefs`, `api.track`, `api.feed_for_you` (personal ranking), `api.delete_my_data`. |
| `20261017040000_account_delete.sql` | `api.delete_account()`: a signed-in user deletes their own login; their prefs and events go with it. |
| `20261017050000_detail_revise.sql` | In-depth summary (`core.blurbs.detail`) returned by the feeds; service-role RPCs for rewriting older cards in place. |
| `20261017060000_signals.sql` | Reading signals for For you: event kinds `open_detail` and `dwell` (with `dwell_ms`), `api.track(p_blurb, p_kind, p_ms)` (2-key calls still work), signal weights in `core.rank_params`, learned topic affinity per user, and a "seen" penalty for cards already read. |
| `20261017070000_trending_foryou.sql` | Trending (`api.feed` mode `top`: rank plus a capped engagement boost from counts of distinct readers, `core.trend_generations` / `core.trend_boosts`, service-role `api.refresh_trending`), For you v2 (follows, learned affinity that fades over time, exploration, seen penalties), `api.my_categories`, hidden sources (`core.source_keys`, `api.sources()`, `hidden_sources` in `api.set_prefs` / `api.get_prefs`), and one card shape for every feed (`core.cards_json`). |
| `20261017071000_diversity_patch.sql` | Keeps Trending and For you varied: replaces `core.diversify` (no 3rd card in a row from one category, no repeated story type, ticker or source cluster next to each other, at most 2 per source in any 5), with carry-over of held-back cards in the cursor. Recreates `api.feed` and `api.feed_for_you`. |
| `20261017080000_collab.sql` | For you v3: personal affinity per topic, card type and source (shrunk toward zero when there are few signals), "readers who engaged with X also engaged with Y" tables built from aggregate counts of at least 3 different readers (no user ids), a smoothed engagement rate in Trending boosts (extends `core.refresh_trending`), crowd topic hints for users with few signals, and a recreated `api.feed_for_you`. `api.feed` is not recreated. Checked by `tests/collab_check.sql`. |
| `20261017090000_web_side_column.sql` | Web right column: `api.top_stories()` (5 best cards of the last 7 days by rank plus Trending boost, skipping repeats of the same headline, company ticker or data series) and `api.number_trends()` (10-yr Treasury, CPI, unemployment, WTI crude: display value, weekly change text, 12-point history). Read-only RPCs, no user data. NOT yet applied. |
| `20261018000000_brief_search_follow.sql` | Search with full-text and short-query fallback, related cards, relevance-ranked Following with reasons, daily and weekly briefs. Read-only RPCs; requires the 090000 web column migration. NOT applied. |

Every migration is written to be re-runnable (`if not exists`, `create or replace`, `on conflict`).

## Tests (`tests/`)

| File | What it checks | Expected last line |
|---|---|---|
| `ranking_check.sql` | Ranking order, paging, hidden cards, publish rules (part 1); anon privileges (part 2); optional curl check (part 3). Run part 1 and part 2 separately. | `ERROR: ALL CHECKS PASSED (test data rolled back on purpose)` |
| `accounts_check.sql` | Anon cannot call the account functions; user A cannot see or change user B's data; For you boosts followed topics, drops hidden topics and disliked cards, pages without repeats; delete my data. | `ERROR: ALL ACCOUNT CHECKS PASSED (test data rolled back on purpose)` |
| `account_delete_check.sql` | Anon cannot delete; a user can delete only their own login; their data goes with it; other users are untouched. | `ERROR: ALL ACCOUNT DELETE CHECKS PASSED (test data rolled back on purpose)` |
| `signals_check.sql` | Dwell minimum, dedupe and keep-the-longest; quick skips lower a topic, opening the detail raises it; per-card and per-topic caps; the "seen" penalty; old 2-key `track` calls still work; anon denied. | `ERROR: ALL SIGNAL CHECKS PASSED (test data rolled back on purpose)` |
| `trending_check.sql` | Trending boost and Latest order, hidden topics, For you v2 (needs the two test users, like the account tests). | `ERROR: ALL TRENDING CHECKS PASSED (test data rolled back on purpose)` |
| `collab_check.sql` | Crowd tables are private; no crowd = same order as before; card links and topic hints need at least 3 different readers; a new user gets crowd-informed picks; a like pulls up a card other readers also liked; importance still wins; For you pages never repeat across a refresh; old calls and card keys unchanged; deleted data leaves the aggregates. Needs the two test users; creates six more test users inside the block (rolled back). | `ERROR: ALL COLLAB CHECKS PASSED (test data rolled back on purpose)` |
| `web_column_check.sql` | `api.top_stories` (max 5, 7 days, no repeats) and `api.number_trends` (12 points oldest first, change text, monthly series). | `ERROR: ALL WEB COLUMN CHECKS PASSED (test data rolled back on purpose)` |
| `brief_search_follow_check.sql` | Search ticker fallback and paging, related ticker matches, Following reasons and empty-list fallback, brief shapes and limits, RPC grants. | `ERROR: ALL BRIEF SEARCH FOLLOW CHECKS PASSED (test rows rolled back on purpose)` |

Each test ends with a deliberate error so that all test rows are rolled back. The account tests need two test users, `element-test-a@example.com` and `element-test-b@example.com` (Authentication → Users → Add user, "Auto Confirm User"); delete them afterwards. They simulate a signed-in user by switching to the `authenticated` role and setting `request.jwt.claims`, which is what `auth.uid()` reads.

## Maintenance (`maintenance/`)

One-off data fixes for a live project, not migrations (`maintenance/hide_offtopic_2026-10-17.sql`, described in `maintenance/maintenance.md`).

## Setting up a new project (paste order)

1. Create a Supabase project. In **Project Settings → Data API → Exposed schemas**, set `api` only.
2. In the SQL editor, paste and run each migration in the order above. Each should report "Success. No rows returned".
3. Run `tests/ranking_check.sql` (part 1, then part 2).
4. Create the two test users, run `tests/accounts_check.sql`, `tests/account_delete_check.sql`, `tests/signals_check.sql`, `tests/trending_check.sql` and `tests/collab_check.sql` and `tests/web_column_check.sql` (no test users needed), then delete the test users.
5. Set the dashboard-only settings below.

## Settings that live only in the dashboard

These are not in SQL; set them by hand in every project.

| Where | Setting |
|---|---|
| Project Settings → Data API | Exposed schemas: `api` only |
| Project Settings → API Keys | The app uses the **publishable** key only. The secret (service-role) key is only for the ingest script's `.env` and never goes in app code. |
| Authentication → Sign In / Providers → Email | Email provider on; "Confirm email" (off for the demo, on with custom SMTP later); minimum password length 8 |
| Authentication → URL Configuration | Site URL and Redirect URLs (the local dev URL and the deployed web URL), used by password-reset links |
| Authentication → Rate Limits | Supabase defaults |

Tunable ranking and account values (half-life, weights, For you boosts, tracking limits) are rows in `core.rank_params` and `core.rank_event_weights`; change them with `update`.

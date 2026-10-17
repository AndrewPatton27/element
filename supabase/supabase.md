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

Every migration is written to be re-runnable (`if not exists`, `create or replace`, `on conflict`).

## Tests (`tests/`)

| File | What it checks | Expected last line |
|---|---|---|
| `ranking_check.sql` | Ranking order, paging, hidden cards, publish rules (part 1); anon privileges (part 2); optional curl check (part 3). Run part 1 and part 2 separately. | `ERROR: ALL CHECKS PASSED (test data rolled back on purpose)` |
| `accounts_check.sql` | Anon cannot call the account functions; user A cannot see or change user B's data; For you boosts followed topics, drops hidden topics and disliked cards, pages without repeats; delete my data. | `ERROR: ALL ACCOUNT CHECKS PASSED (test data rolled back on purpose)` |
| `account_delete_check.sql` | Anon cannot delete; a user can delete only their own login; their data goes with it; other users are untouched. | `ERROR: ALL ACCOUNT DELETE CHECKS PASSED (test data rolled back on purpose)` |
| `signals_check.sql` | Dwell minimum, dedupe and keep-the-longest; quick skips lower a topic, opening the detail raises it; per-card and per-topic caps; the "seen" penalty; old 2-key `track` calls still work; anon denied. | `ERROR: ALL SIGNAL CHECKS PASSED (test data rolled back on purpose)` |

Each test ends with a deliberate error so that all test rows are rolled back. The account tests need two test users, `element-test-a@example.com` and `element-test-b@example.com` (Authentication → Users → Add user, "Auto Confirm User"); delete them afterwards. They simulate a signed-in user by switching to the `authenticated` role and setting `request.jwt.claims`, which is what `auth.uid()` reads.

## Maintenance (`maintenance/`)

One-off data fixes for a live project, not migrations. See `maintenance/maintenance.md`.

## Setting up a new project (paste order)

1. Create a Supabase project. In **Project Settings → Data API → Exposed schemas**, set `api` only.
2. In the SQL editor, paste and run each migration in the order above. Each should report "Success. No rows returned".
3. Run `tests/ranking_check.sql` (part 1, then part 2).
4. Create the two test users, run `tests/accounts_check.sql`, `tests/account_delete_check.sql` and `tests/signals_check.sql`, then delete the test users.
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

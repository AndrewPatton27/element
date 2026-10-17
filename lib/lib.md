# lib/

Data access, rules and helpers for the app. The pure files have no React imports, so Node's test runner can run them directly.

## Files

| File                                                        | What it does                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.ts`                                                    | The `Api` interface (`feed`, `categories`, `numbersToKnow`, `appConfig`) and `getApi()`, which picks mock or Supabase from env vars. Returns an error instead of guessing when the config is wrong.                                                                                               |
| `api.mock.ts`                                               | Mock API over the sample files in `contract/fixtures/`. Sets `sample: true`, so the app shows the SAMPLE DATA banner. 200 ms fake delay.                                                                                                                                                          |
| `api.supabase.ts`                                           | Calls the Supabase `api` schema with plain `fetch` (no supabase-js): `POST /rest/v1/rpc/feed` with `Content-Profile: api`, and `GET` on `app_config`, `categories`, `numbers_to_know` with `Accept-Profile: api`. Sends only the `apikey` header (publishable key). Errors never include the key. |
| `config.ts`                                                 | Reads `EXPO_PUBLIC_API_MODE`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Mock is the default. Supabase mode with a missing or placeholder URL/key, or a secret key, is an error. Also `APP_NAME`, page size, column width.                                               |
| `types.ts`                                                  | Runtime guards for API data (types come from `contract/types.ts`). Drops cards with an unknown kind, no headline, or no source link; never crashes the feed.                                                                                                                                      |
| `labels.ts`                                                 | Which trust labels a card shows: disclaimer on every card, AI label when `ai.generated`, FRED notice on FRED data cards, the "how this card was made" text. Fallback strings if `app_config` is missing.                                                                                                                             |
| `format.ts`                                                 | Relative time, headline clamp (90 chars), change text with glyph and word (never colour alone), screen-reader labels, category and event names, host name of a URL.                                                                                                                                                   |
| `feedLogic.ts`                                              | Feed reducer (append, dedupe, reset on filter change, ignore late responses) and the mock pager (offset cursor, Top/Latest order, category filter).                                                                                                                                               |
| `theme.ts` | Design tokens: light palette (the default, from the design files) and a matching dark palette, font family names (Newsreader, Instrument Sans), spacing, radii, the 1024 px wide breakpoint. |
| `seriesCopy.ts` | One plain-language line per macro series for the Numbers screen (UI copy, not data). |
| `useFeed.ts`, `useTheme.ts`, `appData.tsx` | React glue: feed hook, palette and wide-layout hooks, shared `app_config` + categories context. |

## Env vars

| Name                                   | Values                                         |
| -------------------------------------- | ---------------------------------------------- |
| `EXPO_PUBLIC_API_MODE`                 | `mock` (default) or `supabase`                 |
| `EXPO_PUBLIC_SUPABASE_URL`             | `https://<project>.supabase.co`                |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the publishable key only, never the secret key |

`EXPO_PUBLIC_*` values are baked in at build time: change `.env`, then rebuild.

## Tests

```bash
node --experimental-strip-types --test "lib/__tests__/*.test.ts"
```

Covers labels (no card kind renders without the disclaimer), formatting, guards, the feed reducer and mock paging, the Supabase request shape and error handling, the sample fixtures, and a scan for secret keys in `app/`, `components/` and `lib/`. On Node 23.6+ the flag is optional. A "module type" warning per file is harmless.

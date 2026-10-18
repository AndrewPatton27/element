# app/

Expo Router screens. Each `.tsx` file here is a route; this `.md` file is ignored by the router. Feed, Numbers, About and Account ("Sign in" for guests) are peers reached from the bottom nav bar (on phones and on wide web). The feed never needs an account.

| Route             | File                 | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| (root)            | `_layout.tsx`        | Loads the fonts (4 weights of Newsreader and Instrument Sans), picks the API (sample fixtures or Supabase), shows a full-screen error if the build is misconfigured, wraps the app in an error boundary, and provides `app_config`, categories and the account to every screen.                                                                                                                                                                                     |
| `/`               | `index.tsx`          | Feed: Trending / Latest tabs, plus For you when signed in (`?tab=for_you` opens it). Category chips (hidden on For you, which shows what it is tailored to), the swipe pager, the sources sheet, the "More detail" sheet, the card "⋯" menu with undo, and a dismissible "Sign in for a feed tailored to you" line for guests. On wide screens a looping "Numbers to know" ticker runs across the top. Sends reading signals (view, dwell, open) for signed-in readers. |
| `/numbers`        | `numbers.tsx`        | "Numbers to know": every number `api.numbers_to_know` returns, each with a plain-language line, change, period, agency, and the FRED notice. Rows open the original data series.                                                                                                                                                                                                                                                                                  |
| `/about`          | `about.tsx`          | Transparency page: every source (with site and terms links), how cards are collected, filtered and written, how Trending / Latest / For you are ordered, what an account stores, and the disclaimer.                                                                                                                                                                                                                                                               |
| `/signin`         | `signin.tsx`         | Sign in, create an account, or "Forgot password?" (emails a reset link to `/reset-password`; always answers "If that email has an account, we sent a reset link." so it never reveals who has an account). Password field with show/hide eye and browser-password-manager autocomplete; the password is cleared after every submit. Shows "Please sign in again." after an expired session. In sample mode no email is sent and a test reset link appears instead. |
| `/onboarding`     | `onboarding.tsx`     | "Pick topics you care about": multi-select from `api.categories`, saved with `api.set_prefs`, then opens For you. "Skip for now" is remembered on this device.                                                                                                                                                                                                                                                                                                     |
| `/account`        | `account.tsx`        | Email (change it), password (change it, with confirm), sign out, favorite / hidden topics, sources you can switch off, "Delete my data" (prefs and history; login stays) and "Delete account" (`api.delete_account`, enabled only after typing DELETE; then signs out here).                                                                                                                                                                                                                                     |
| `/reset-password` | `reset-password.tsx` | Where the reset email lands. Reads the recovery token from the link (`#access_token=…&type=recovery`), removes it from the address bar, asks for a new password twice, sets it (`PUT /auth/v1/user`) and signs the user in. Expired or used links show "This reset link is invalid or has expired."                                                                                                                                                                |
| (any other URL)   | `+not-found.tsx`     | "Page not found" with a button back to the feed.                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Run

```bash
npx expo start --web     # same as: npm run web
```

With no `.env`, the app runs on the sample fixtures and shows a SAMPLE DATA banner. For real data, set `EXPO_PUBLIC_API_MODE=supabase` plus the Supabase URL and publishable key in `.env` (see `lib/lib.md`).

## Build for the web

```bash
npx expo export -p web      # same as: npm run export:web
```

Output goes to `dist/` as a single-page app (`web.output: "single"` in `app.json`). The host must serve `index.html` for unknown paths so `/numbers` and `/about` work on reload; Cloudflare Pages does this by default when there is no `404.html`.


## Feed screen notes (`index.tsx`)

- The same `visible` filter (hidden topics and sources) drives the list on screen and `useFeed` paging, so "load more" and "all caught up" follow what the reader can see.
- On `pagehide` (web) the last card's time is sent with a `keepalive` fetch (`trackDwellOnExit`), keeping the auth header.
- Screens show short friendly error text (`lib/errors.ts` `userMessage`), never raw server messages.

# app/

Expo Router screens. Each `.tsx` file here is a route; this `.md` file is ignored by the router. Feed, Numbers, About and Account ("Sign in" for guests) are peers reached from the bottom nav bar on phones and from the top bar (plus a floating About button) on wide web. The feed never needs an account.

| Route             | File                 | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| (root)            | `_layout.tsx`        | Loads the fonts (4 weights of Newsreader and Instrument Sans), picks the API (sample fixtures or Supabase), shows a full-screen error if the build is misconfigured, wraps the app in an error boundary, and provides `app_config`, categories and the account to every screen.                                                                                                                                                                                     |
| `/`               | `index.tsx`          | Feed: Trending / Latest tabs, plus For you when signed in (`?tab=for_you` opens it). Category chips (hidden on For you, which shows what it is tailored to), the swipe pager, the sources sheet, the "More detail" sheet, the card "⋯" menu with undo, and a dismissible "Sign in for a feed tailored to you" line for guests. On wide screens (design `docs/design/web/Web-Final.dc.html`) the top bar carries the tabs, the Numbers strip runs under it, categories are a left list, and the right column shows top stories and trends (hidden under 1180 px, where its two calls are also skipped, or when empty; hidden topics and sources are filtered out of Top stories); clicking a top story opens its More detail. Other screens can send `?tab=top|latest|for_you`. Sends reading signals (view, dwell, open) for signed-in readers. |
| `/numbers`        | `numbers.tsx`        | "Numbers to know": every number `api.numbers_to_know` returns, each with a plain-language line, change, period, agency, and the FRED notice. Rows open the original data series.                                                                                                                                                                                                                                                                                  |
| `/about`          | `about.tsx`          | Transparency page: every source (with site and terms links), how cards are collected, filtered and written, how Trending / Latest / For you are ordered, what an account stores, and the disclaimer. Light restyle (designs `Mobile-About` / `Web-About`): serif lead line, small uppercase section labels, hairline source rows, tinted disclaimer box; uses `ScreenShell`. |
| `/signin`         | `signin.tsx`         | Sign in, create an account, or "Forgot password?" (emails a reset link to `/reset-password`; always answers "If that email has an account, we sent a reset link." so it never reveals who has an account). Password field with show/hide eye and browser-password-manager autocomplete; the password is cleared after every submit. Shows "Please sign in again." after an expired session. In sample mode no email is sent and a test reset link appears instead. Create account is a mode of this screen (`/signin?mode=signup` opens it; it adds a confirm-password field), with a "New to Element? Create account" box and "Browse as a guest" on sign in (designs `*-SignIn`, `*-CreateAccount`). No Google sign-in or age checkbox (no back end for them). |
| `/onboarding`     | `onboarding.tsx`     | "Pick topics you care about": multi-select from `api.categories`, saved with `api.set_prefs`, then opens For you. "Skip for now" is remembered on this device. Uses `ScreenShell` and the chip style of the Me design. |
| `/account`        | `account.tsx`        | Email (change it), password (change it, with confirm), sign out, favorite / hidden topics, sources you can switch off, "Delete my data" (prefs and history; login stays) and "Delete account" (`api.delete_account`, enabled only after typing DELETE; then signs out here). Restyled as the Me page (designs `Mobile-Me` / `Web-Me`): profile card, topic chips, sources, and a settings list (Change email, Change password, Numbers to know, About Element, Sign out, Delete my data, Delete my account) whose forms open inline; two columns on wide web. Not built (no back end): watchlist, daily brief toggle, Report a problem. |
| `/reset-password` | `reset-password.tsx` | Where the reset email lands. Reads the recovery token from the link (`#access_token=…&type=recovery`), removes it from the address bar, asks for a new password twice, sets it (`PUT /auth/v1/user`) and signs the user in. Expired or used links show "This reset link is invalid or has expired." Uses `ScreenShell`. |
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

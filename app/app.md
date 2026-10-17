# app/

Expo Router screens. Each `.tsx` file here is a route; this `.md` file is ignored by the router. Feed, Numbers, About and Account ("Sign in" for guests) are peers reached from the bottom nav (phones) or the left rail (wide web). The feed never needs an account.

| Route      | File          | What it does                                                                                                                                                                                                                   |
| ---------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| (root)     | `_layout.tsx` | Loads the fonts (4 weights of Newsreader and Instrument Sans), picks the API (sample fixtures or Supabase), shows a full-screen error if the build is misconfigured, and provides `app_config` and categories to every screen. |
| `/` | `index.tsx` | Feed: Top / Latest tabs, plus For you when signed in (`?tab=for_you` opens it). Category chips (hidden on For you, which shows what it is tailored to), the swipe pager, the sources sheet, and a dismissible "Sign in for a feed tailored to you" line for guests. On wide screens also Numbers to know on the right. |
| `/numbers` | `numbers.tsx` | "Numbers to know": six numbers, each with a plain-language line, change, period, agency, and the FRED notice. Rows open the original data series.                                                                              |
| `/about`   | `about.tsx`   | Disclaimer, what the AI label means, how Top ranks, required notices.                                                                                                                                                          |
| `/signin` | `signin.tsx` | Sign in or create an account (email + password). After the first sign-in it opens `/onboarding`. In sample mode any email and an 8+ character password work, and nothing leaves the device. |
| `/onboarding` | `onboarding.tsx` | "Pick topics you care about": multi-select from `api.categories`, saved with `api.set_prefs`, then opens For you. "Skip for now" is remembered on this device. |
| `/account` | `account.tsx` | Email, sign out, edit topics, and "Delete my data" (`api.delete_my_data`) with an in-page confirm. The login itself stays. |

## Run

```bash
npx expo start --web
```

With no `.env`, the app runs on the sample fixtures and shows a SAMPLE DATA banner. For real data, set `EXPO_PUBLIC_API_MODE=supabase` plus the Supabase URL and publishable key in `.env` (see `lib/lib.md`).

## Build for the web

```bash
npx expo export -p web
```

Output goes to `dist/` as a single-page app (`web.output: "single"` in `app.json`). The host must serve `index.html` for unknown paths so `/numbers` and `/about` work on reload; Cloudflare Pages does this by default when there is no `404.html`.

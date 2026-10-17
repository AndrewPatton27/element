# app/

Expo Router screens. Each `.tsx` file here is a route; this `.md` file is ignored by the router. Feed, Numbers and About are peers reached from the bottom nav (phones) or the left rail (wide web).

| Route      | File          | What it does                                                                                                                                                                                |
| ---------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (root) | `_layout.tsx` | Loads the fonts (4 weights of Newsreader and Instrument Sans), picks the API (sample fixtures or Supabase), shows a full-screen error if the build is misconfigured, and provides `app_config` and categories to every screen. |
| `/` | `index.tsx` | Feed: Top/Latest tabs, category chips, the swipe pager and the sources sheet. On wide screens also Numbers to know in the right rail. |
| `/numbers` | `numbers.tsx` | "Numbers to know": six numbers, each with a plain-language line, change, period, agency, and the FRED notice. Rows open the original data series. |
| `/about`   | `about.tsx`   | Disclaimer, what the AI label means, how Top ranks, required notices.                                                                                                                       |

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

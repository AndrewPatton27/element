# Accounts contract

Signed-in users get saved topics and a personal **For you** feed. Guests are unchanged: they keep `api.feed` (see `README.md`). Types are in `account.ts`; the SQL is `supabase/migrations/20261017030000_accounts.sql`.

## Files

| File | What it is |
|---|---|
| `account.ts` | `UserPrefs`, `TrackKind`, `TrackAction`, `Reaction`, `ForYouCard`, `ForYouPage`, RPC bodies (`SetPrefsParams`, `TrackParams`, `FeedForYouParams`, ...) and error messages. |
| `fixtures/prefs.json` | `UserPrefs`: follows energy and tech, hides insider trades, has liked a deals card and disliked a markets card. |
| `fixtures/feed_for_you.page1.json` | `ForYouPage`: 10 `[SAMPLE]` cards (copied from `feed.page1.json`) with `my_reaction`, and a `next_cursor`. |

## Sign-in

Supabase Auth, email + password. The app gets an `access_token` (a JWT, about 1 hour) and a `refresh_token`. Recommended: use `@supabase/supabase-js` for auth only (`signUp`, `signInWithPassword`, `signOut`, `onAuthStateChange`); it stores the session (localStorage on web, AsyncStorage on native) and refreshes the token before it expires. The raw REST calls, if needed:

| Action | Request (header `apikey: <publishable key>`, `Content-Type: application/json`) |
|---|---|
| Sign up | `POST /auth/v1/signup` body `{"email","password"}`. With "Confirm email" off the response holds a session (`access_token`, `refresh_token`, `expires_in`, `user`); with it on, only `user` and the user must click the email link. |
| Sign in | `POST /auth/v1/token?grant_type=password` body `{"email","password"}` |
| Refresh | `POST /auth/v1/token?grant_type=refresh_token` body `{"refresh_token"}` |
| Current user | `GET /auth/v1/user` + `Authorization: Bearer <access_token>` |
| Sign out | `POST /auth/v1/logout` + `Authorization: Bearer <access_token>` (204) |

## RPCs (signed in only)

All are `POST <SUPABASE_URL>/rest/v1/rpc/<name>` with headers:

```
apikey: <publishable key>
Authorization: Bearer <access_token>
Content-Type: application/json
Content-Profile: api
```

| RPC | Body | Returns |
|---|---|---|
| `get_prefs` | `{}` | `UserPrefs` |
| `set_prefs` | `{"p_followed": ["tech","energy"], "p_hidden": ["insider"]}` (null = keep, [] = clear) | `UserPrefs` (sets `onboarded: true`) |
| `track` | `{"p_blurb": "<card id>", "p_kind": "view" \| "open_source" \| "like" \| "dislike" \| "clear"}` | `{"status": "recorded" \| "ignored" \| "cleared"}` |
| `feed_for_you` | `{"p_cursor": null, "p_limit": 20}` | `ForYouPage` |
| `delete_my_data` | `{}` | `{"deleted_prefs": 0\|1, "deleted_events": n}` |

With supabase-js: `supabase.schema('api').rpc('feed_for_you', { p_cursor: null, p_limit: 20 })` sends the same request with the session token.

## Behaviour

- **Onboarding:** `onboarded` is false until the first `set_prefs`. Show the topic picker then.
- **For you score** (hours added to the card's normal rank): followed category +2; learned affinity per category from the last 30 days, +1 per like and -1 per dislike, capped at +-4. Hidden categories and cards the user disliked are left out. Only cards from the last 30 days.
- **Paging:** same as `api.feed`: send `next_cursor` back unchanged; `null` = end. A like, dislike or topic change made while scrolling changes the scores for the next pages, so one card may repeat or be skipped in that scroll. Drop ids you already show; after changing topics, reload from the first page.
- **Reactions:** one per card. `like` replaces a `dislike` and the other way round; a repeat returns `ignored`; `clear` removes it. A disliked card disappears from For you on the next page.
- **Views:** send `view` when a card is on screen for about a second, `open_source` when a source link is tapped. Repeats within an hour return `ignored`. `ignored` is not an error.
- **Errors:** anon calls get HTTP 401 (permission denied). Messages (`AccountRpcErrorMessage`): `not_authenticated` (401), `unknown_category: <slug>`, `category_followed_and_hidden: <slug>`, `invalid_kind`, `unknown_card`, `invalid_cursor` (all 422).
- **Delete:** `delete_my_data` removes prefs and reactions. Deleting the login itself is done by the project owner in the Supabase dashboard (that also removes the data).
- **Stored data:** user id, chosen topics, and card events (kind + time). No names, IPs or device data.

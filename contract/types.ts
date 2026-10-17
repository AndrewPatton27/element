// Shared card contract between the back end (Supabase `api` schema) and the app.
//
// Rules for this file:
// - Erasable TypeScript only: types and interfaces, no enums, namespaces or
//   parameter properties, so it runs under Node type stripping and Metro alike.
// - Keys are snake_case, exactly as returned by the `api` RPCs and views.
// - Import with `import type { ... } from '.../contract/types.ts'`.
// - Frozen. Changes go through review (see README.md).
// - Changed 2026-10-17 by PM review 2 (additive only): categories world, science, safety;
//   license class cc_by_sa; event types world_event, recall, science.

/** Card kinds. 'link_out' is reserved and never produced in v1; the app skips it. */
export type BlurbKind = 'summary' | 'data' | 'link_out';

/** Feed ordering. 'top' = ranked (importance + recency), 'latest' = newest first. */
export type FeedMode = 'top' | 'latest';

export type CategorySlug =
  | 'markets'
  | 'earnings'
  | 'economy'
  | 'policy'
  | 'tech'
  | 'deals'
  | 'energy'
  | 'insider'
  | 'personal-finance'
  | 'world'
  | 'science'
  | 'safety';

/** Row of `api.categories`. */
export interface Category {
  slug: CategorySlug;
  name: string;
  sort_order: number;
}

export type LicenseClass =
  | 'public_domain'
  | 'company_filing'
  | 'guardian_noncomm'
  | 'link_out'
  | 'iex_hist'
  | 'cc_by_sa';                          // Wikipedia text (attribution + license link required)

export type Exchange = 'NYSE' | 'Nasdaq' | 'NYSE American' | 'Cboe';

export type SourceKind = 'filing' | 'government' | 'news';

/** Known event types. Unknown strings may appear; render them with a fallback. */
export type EventType =
  | 'earnings'
  | 'exec_change'
  | 'deal'
  | 'insider'
  | 'macro_release'
  | 'fed'
  | 'world_event'
  | 'recall'
  | 'science';

/** One number for the "numbers to know" panel, also used inside data cards. */
export interface MacroFact {
  series_id: string;                    // "DGS10"
  label: string;                        // "10-yr Treasury"
  value: string;                        // preformatted: "4.12%", "$61.40"
  change: string | null;                // signed with unit: "+0.05 pts", "-0.8%"
  direction: 'up' | 'down' | 'flat' | null;
  period: string | null;                // "Sep 2026" for monthly data, null for daily
  as_of: string;                        // ISO date or datetime
  source_name: string;                  // full citation: "U.S. Energy Information Administration via FRED"
  source_short: string;                 // compact label: "EIA via FRED" (never bare "FRED")
  source_url: string;
  sort_order: number;
}

/** A stock symbol on a card. Prices are never shown in v1: `quote` is always null. */
export interface Ticker {
  symbol: string;
  name: string;
  exchange: Exchange | null;
  quote: null;
}

/** A source link on a card. Every card has 1..8 of these; every one has a URL. */
export interface Source {
  name: string;                         // "SEC", "Federal Reserve Board"
  kind: SourceKind;
  doc_label: string | null;             // "Form 8-K", "Press release"
  url: string;                          // the original page, never a redirect
  published_at: string;                 // ISO
  license_class: LicenseClass;
  attribution: string | null;
  is_primary: boolean;
}

export interface BlurbCard {
  id: string;                           // uuid
  kind: BlurbKind;                      // unknown kind -> the app skips the card
  headline: string;                     // <= 90 chars for summary/data
  body: string | null;                  // summary: <= 60 words; data: one template sentence
  category: CategorySlug;
  event_type: string | null;            // usually an EventType; unknown values allowed
  tickers: Ticker[];                    // 0..5
  macro: MacroFact[];                   // 0..3; filled for kind 'data'
  sources: Source[];                    // 1..8, primary first
  source_count: number;                 // distinct outlets, >= 1
  as_of: string;                        // primary source time (ISO)
  published_at: string;                 // our publish time (ISO)
  sort_at: string;                      // time used for 'latest' ordering (ISO)
  updated_at: string | null;            // set -> show an "Updated" tag
  revision: number;
  freshness: { delayed_hours: number | null };
  ai: {
    generated: boolean;                 // false for template cards (no AI involved)
    label: string | null;               // equals AppConfig.ai_notice when generated, else null
  };
  attribution: string | null;
  image: null;                          // never any image in v1
  is_saved: boolean;                    // always false for guests
  share_path: string;                   // "/b/<id>"
  importance?: number;                  // ranking input (about 1..20); optional, never shown
}

/** Response of `api.feed`. `next_cursor` null = end of feed. Treat the cursor as opaque. */
export interface FeedPage {
  items: BlurbCard[];
  next_cursor: string | null;
}

export type NoticePlacement =
  | 'numbers_panel'
  | 'data_card'
  | 'share'
  | 'about'
  | 'ticker_chip';

export interface RequiredNotice {
  key: string;                          // "fred", "takedown"
  text: string;
  url: string | null;
  placements: NoticePlacement[];
}

/** Single row of `api.app_config`. */
export interface AppConfig {
  disclaimer: string;                   // shown on every card
  ai_notice: string;                    // shown on cards where ai.generated is true
  required_notices: RequiredNotice[];
  min_supported_app_version: string;
  quotes_enabled: boolean;              // false in v1
  linkout_cards: boolean;               // false in v1
}

/** Arguments of `api.feed` (PostgREST RPC body). */
export interface FeedParams {
  p_mode?: FeedMode;                    // default 'top'
  p_cursor?: string | null;             // next_cursor from the previous page
  p_limit?: number;                     // default 20, clamped to 10..30
  p_category?: CategorySlug | null;
}

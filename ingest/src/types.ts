// Internal types for the ingest pipeline (the public card shape is in contract/types.ts).

import type { CategorySlug, Exchange, MacroFact, SourceKind } from '../../contract/types.ts';

export type LicenseClass = 'public_domain' | 'company_filing';

/** One collected item, ready for summarizing. */
export interface RawItem {
  source: 'sec_8k' | 'fed_rss';
  external_id: string;
  url: string;                       // the page we cite (and may fetch: allowlisted hosts only)
  title: string;
  published_at: string;              // ISO, primary source time
  license_class: LicenseClass;
  category: CategorySlug;
  event_type: string | null;
  tickers: TickerRef[];
  source_name: string;               // "SEC", "Federal Reserve Board"
  source_kind: SourceKind;
  doc_label: string;                 // "Form 8-K", "Press release"
  company?: string;                  // SEC only, display name
  items?: { number: string; title: string }[];   // SEC 8-K items
  summary_text: string;              // short licensed text from the feed itself
}

export interface TickerRef {
  symbol: string;
  name: string;
  exchange: Exchange | null;
}

/** What a summarizer returns (before validation). */
export interface SummaryDraft {
  headline: string;
  body: string | null;
  category: string;
  event_type: string | null;
  tickers: string[];
}

export interface SummarizeInput {
  item: RawItem;
  text: string;                      // licensed source text (feed text + page text)
  retryErrors?: string[];            // validator errors from the previous attempt
}

export interface Summarizer {
  name: string;
  /** true if this provider sends text to an AI model (counts toward the daily cap) */
  usesAi: boolean;
  summarize(input: SummarizeInput): Promise<SummaryDraft>;
}

/** Payload for api.publish_blurb. */
export interface PublishPayload {
  dedupe_key: string;
  item_id?: string;
  kind: 'summary' | 'data';
  headline: string;
  body: string | null;
  category: string;
  event_type: string | null;
  ai_generated: boolean;
  tickers: TickerRef[];
  macro: MacroFact[];
  as_of: string;
  sort_at: string;
  model: string | null;
  prompt_version: string | null;
  attribution: string | null;
  sources: {
    name: string;
    kind: SourceKind;
    doc_label: string | null;
    url: string;
    published_at: string;
    license_class: LicenseClass;
    attribution: string | null;
    is_primary: boolean;
  }[];
}

/** Payload for api.upsert_macro. */
export interface MacroObservation {
  series_id: string;
  obs_date: string;                  // YYYY-MM-DD
  value: number;
  display_value: string;
  change_text: string | null;
  direction: 'up' | 'down' | 'flat' | null;
  period_label: string | null;
}

// Runtime checks for data coming from the API. The shapes themselves live in
// contract/types.ts and are imported type-only; this file adds only guards.
// Bad rows are skipped, never allowed to crash the feed.

import type { AppConfig, BlurbCard, Category, FeedPage, MacroFact, RequiredNotice, Source } from '../contract/types.ts';
import { isRenderableKind } from './labels.ts';

type Obj = Record<string, unknown>;

function isObj(x: unknown): x is Obj {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}
const isStr = (x: unknown): x is string => typeof x === 'string';
const isStrOrNull = (x: unknown): x is string | null => x === null || typeof x === 'string';
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

// Only https:// is accepted — this matches the database CHECK
// (blurb_sources.url like 'https://%') and the "every card links to its source"
// rule, so a non-https (cleartext) link can never reach Linking.openURL.
export function isHttpUrl(x: unknown): x is string {
  return isStr(x) && /^https:\/\/[^\s]+$/i.test(x);
}

export function isSource(x: unknown): x is Source {
  return isObj(x) && isStr(x.name) && x.name !== '' && isHttpUrl(x.url) && isStr(x.published_at) && typeof x.is_primary === 'boolean';
}

export function isMacroFact(x: unknown): x is MacroFact {
  return (
    isObj(x) &&
    isStr(x.series_id) &&
    isStr(x.label) &&
    isStr(x.value) &&
    isStrOrNull(x.change) &&
    (x.direction === null || x.direction === 'up' || x.direction === 'down' || x.direction === 'flat') &&
    isStr(x.as_of) &&
    isStr(x.source_name) &&
    isStr(x.source_short) &&
    isHttpUrl(x.source_url)
  );
}

// A card is shown only if it is a known kind, has a headline and at least one
// source with a working link (project rule: every card links to its source).
export function isBlurbCard(x: unknown): x is BlurbCard {
  if (!isObj(x)) return false;
  if (!isStr(x.id) || x.id === '' || !isRenderableKind(x.kind)) return false;
  if (!isStr(x.headline) || x.headline.trim() === '' || !isStrOrNull(x.body)) return false;
  if (!isStr(x.category) || !isStr(x.as_of) || !isStr(x.sort_at)) return false;
  if (!Array.isArray(x.sources) || x.sources.length === 0 || !x.sources.every(isSource)) return false;
  if (!isNum(x.source_count)) return false;
  if (!Array.isArray(x.tickers) || !Array.isArray(x.macro)) return false;
  if (!isObj(x.ai) || typeof x.ai.generated !== 'boolean') return false;
  if (x.kind === 'data' && (x.macro.length === 0 || !x.macro.every(isMacroFact))) return false;
  return true;
}

// Keeps only valid, renderable cards. next_cursor must be a string or null.
export function parseFeedPage(x: unknown): FeedPage {
  if (!isObj(x) || !Array.isArray(x.items)) throw new Error('Feed response has no items array.');
  const next = isStr(x.next_cursor) && x.next_cursor !== '' ? x.next_cursor : null;
  return { items: x.items.filter(isBlurbCard), next_cursor: next };
}

export function parseMacroFacts(x: unknown): MacroFact[] {
  if (!Array.isArray(x)) throw new Error('numbers_to_know response is not a list.');
  return x.filter(isMacroFact).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

export function parseCategories(x: unknown): Category[] {
  if (!Array.isArray(x)) throw new Error('categories response is not a list.');
  return x.filter((c): c is Category => isObj(c) && isStr(c.slug) && isStr(c.name)).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

function isNotice(x: unknown): x is RequiredNotice {
  return isObj(x) && isStr(x.key) && isStr(x.text) && isStrOrNull(x.url) && Array.isArray(x.placements);
}

// Accepts the single row or the one-row array PostgREST returns for a view.
export function parseAppConfig(x: unknown): AppConfig {
  const row = Array.isArray(x) ? x[0] : x;
  if (!isObj(row) || !isStr(row.disclaimer) || !isStr(row.ai_notice)) {
    throw new Error('app_config response is missing disclaimer or ai_notice.');
  }
  return {
    disclaimer: row.disclaimer,
    ai_notice: row.ai_notice,
    required_notices: Array.isArray(row.required_notices) ? row.required_notices.filter(isNotice) : [],
    min_supported_app_version: isStr(row.min_supported_app_version) ? row.min_supported_app_version : '0.0.0',
    quotes_enabled: row.quotes_enabled === true,
    linkout_cards: row.linkout_cards === true,
  };
}

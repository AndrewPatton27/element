// Feed state and paging rules. Pure: no React imports, so node --test runs it.

import type { BlurbCard, CategorySlug, FeedMode, FeedPage } from '../contract/types.ts';
import { isBlurbCard } from './types.ts';

// The feed tabs. 'for_you' is the signed-in personal feed (api.feed_for_you).
export type FeedTab = FeedMode | 'for_you';

export interface FeedQuery {
  mode: FeedTab;
  user?: string | null; // for_you depends on who is signed in
  category: CategorySlug | null;
}

export interface FeedState {
  key: string; // which mode+category the items belong to
  items: BlurbCard[];
  cursor: string | null; // next_cursor of the last page
  done: boolean; // server said there is nothing more
  loading: boolean;
  error: string | null;
}

export type FeedAction =
  | { type: 'reset'; key: string }
  | { type: 'request'; key: string }
  | { type: 'page'; key: string; page: FeedPage }
  | { type: 'fail'; key: string; error: string };

export function feedKey(q: FeedQuery): string {
  return `${q.mode}|${q.category ?? 'all'}${q.mode === 'for_you' ? `|${q.user ?? ''}` : ''}`;
}

export function initialFeedState(key: string): FeedState {
  return { key, items: [], cursor: null, done: false, loading: false, error: null };
}

// Appends a page: drops cards already shown (by id) and cards that fail the guard.
export function appendPage(items: BlurbCard[], page: FeedPage): BlurbCard[] {
  const seen = new Set(items.map((c) => c.id));
  const next = items.slice();
  for (const card of page.items) {
    if (!isBlurbCard(card) || seen.has(card.id)) continue;
    seen.add(card.id);
    next.push(card);
  }
  return next;
}

// Changing mode or category starts a fresh list and cursor. Responses for an old
// key (a slow request that lands after the user switched filters) are ignored.
export function feedReducer(state: FeedState, action: FeedAction): FeedState {
  if (action.type === 'reset') return initialFeedState(action.key);
  if (action.key !== state.key) return state;
  switch (action.type) {
    case 'request':
      return { ...state, loading: true, error: null };
    case 'page':
      return {
        ...state,
        items: appendPage(state.items, action.page),
        cursor: action.page.next_cursor,
        done: action.page.next_cursor === null,
        loading: false,
      };
    case 'fail':
      return { ...state, loading: false, error: action.error };
  }
}

export function canLoadMore(state: FeedState): boolean {
  return !state.loading && !state.done && state.error === null;
}

// ---- Mock paging (used by the mock API with the sample fixtures) ----

export interface MockFeedParams extends FeedQuery {
  cursor: string | null;
  limit: number;
}

export function clampLimit(limit: number | undefined): number {
  const n = Number.isFinite(limit) ? Math.trunc(limit as number) : 20;
  return Math.min(30, Math.max(10, n));
}

const HOUR_MS = 3_600_000;

// Same shape as the stored ranking score: newer is higher, and doubling importance
// is worth one 8-hour half-life.
export function mockRankScore(card: BlurbCard): number {
  const hours = Date.parse(card.sort_at) / HOUR_MS;
  const importance = card.importance && card.importance > 0 ? card.importance : 1;
  return hours + 8 * Math.log2(importance);
}

function byDescThenId(score: (c: BlurbCard) => number) {
  return (a: BlurbCard, b: BlurbCard) => score(b) - score(a) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}

// Cursor is a plain offset string in mock mode; the real API's cursor is opaque.
export function mockFeedPage(all: BlurbCard[], p: MockFeedParams): FeedPage {
  const limit = clampLimit(p.limit);
  const filtered = all.filter((c) => p.category === null || c.category === p.category);
  const sorted = filtered.slice().sort(p.mode === 'latest' ? byDescThenId((c) => Date.parse(c.sort_at)) : byDescThenId(mockRankScore));
  const offset = p.cursor ? Math.max(0, parseInt(p.cursor, 10) || 0) : 0;
  const items = sorted.slice(offset, offset + limit);
  const end = offset + items.length;
  return { items, next_cursor: end < sorted.length ? String(end) : null };
}

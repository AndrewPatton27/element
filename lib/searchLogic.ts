// Search rules. Pure: no React imports, so node --test runs it (lib/__tests__/searchLogic.test.ts).
//
// The Search screen waits 300 ms after the last keystroke, only searches from 2
// characters (the database function enforces the same), remembers the last few
// searches on this device, and when the box is empty offers topics and companies
// to try.

import type { Category } from '../contract/types.ts';

export const SEARCH_DEBOUNCE_MS = 300;
export const SEARCH_MIN_CHARS = 2;
export const SEARCH_MAX_CHARS = 80; // api.search cuts the query here too
export const RECENT_MAX = 6;
export const RECENT_KEY = 'element.recent-searches';

// "Try a company" chips from the design. Element shows news about them, never prices.
export const SUGGESTED_TICKERS = ['AAPL', 'MSFT', 'BA'] as const;

// Trim, collapse runs of spaces and cap the length.
export function normalizeQuery(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, SEARCH_MAX_CHARS).trim();
}

export function canSearch(raw: string): boolean {
  return normalizeQuery(raw).length >= SEARCH_MIN_CHARS;
}

// What the screen shows for the text in the box.
export type SearchTarget =
  | { kind: 'idle' } // empty box: recent searches and suggestions
  | { kind: 'short' } // 1 character: ask for one more
  | { kind: 'query'; q: string }
  | { kind: 'category'; slug: string; name: string }; // a "Browse by category" tile

export function searchTarget(raw: string, category: { slug: string; name: string } | null): SearchTarget {
  if (category) return { kind: 'category', slug: category.slug, name: category.name };
  const q = normalizeQuery(raw);
  if (q.length === 0) return { kind: 'idle' };
  if (q.length < SEARCH_MIN_CHARS) return { kind: 'short' };
  return { kind: 'query', q };
}

// One key per list of results: a change of key starts a new list and ignores late answers.
export function searchKey(t: SearchTarget): string | null {
  if (t.kind === 'query') return `search|${t.q.toLocaleLowerCase()}`;
  if (t.kind === 'category') return `browse|${t.slug}`;
  return null;
}

// ---- Recent searches ----

// Newest first, no duplicates (ignoring case), capped. Queries too short to search are ignored.
export function addRecent(list: string[], raw: string, max = RECENT_MAX): string[] {
  const q = normalizeQuery(raw);
  if (q.length < SEARCH_MIN_CHARS) return list;
  const lower = q.toLocaleLowerCase();
  return [q, ...list.filter((r) => r.toLocaleLowerCase() !== lower)].slice(0, max);
}

export function removeRecent(list: string[], q: string): string[] {
  return list.filter((r) => r !== q);
}

// Storage holds JSON text; anything unreadable counts as "no recent searches".
export function parseRecents(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const x: unknown = JSON.parse(raw);
    if (!Array.isArray(x)) return [];
    const out: string[] = [];
    for (const v of x) {
      if (typeof v !== 'string') continue;
      const q = normalizeQuery(v);
      if (q.length >= SEARCH_MIN_CHARS && !out.some((o) => o.toLocaleLowerCase() === q.toLocaleLowerCase())) out.push(q);
    }
    return out.slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

export function serializeRecents(list: string[]): string {
  return JSON.stringify(list.slice(0, RECENT_MAX));
}

// ---- Suggestions and wording ----

// "Browse by category": every topic the app has cards for, in the server's order.
export function suggestedTopics(categories: Category[], hidden: string[] = []): Category[] {
  return categories.filter((c) => !hidden.includes(c.slug));
}

export function resultCountText(count: number, done: boolean): string {
  if (count === 0) return 'No results';
  const n = `${count}${done ? '' : '+'}`;
  return `${n} ${count === 1 && done ? 'result' : 'results'}`;
}

export function emptyResultsMessage(t: SearchTarget): string {
  if (t.kind === 'category') return `No ${t.name} cards yet. Check back soon.`;
  if (t.kind === 'query') return `Nothing found for “${t.q}”. Try a company name, a ticker or a topic.`;
  return '';
}

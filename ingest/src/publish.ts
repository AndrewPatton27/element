// Writes to Supabase through the service-role RPCs in the `api` schema
// (PostgREST, plain fetch). Also builds the publish payload from an item + draft.

import { fetchAllowed, type FetchLike } from './allowlist.ts';
import { config } from './config.ts';
import type { MacroObservation, PublishPayload, RawItem, SummaryDraft } from './types.ts';

export interface Publisher {
  upsertItem(item: RawItem): Promise<{ id: string; is_new: boolean; status: string }>;
  setItemStatus(id: string, status: 'skipped' | 'failed', note: string): Promise<void>;
  publishBlurb(p: PublishPayload): Promise<{ status: 'published' | 'duplicate' | 'ticker_cap'; id: string | null }>;
  upsertMacro(o: MacroObservation): Promise<void>;
}

export class SupabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseError';
  }
}

/**
 * PostgREST client for the service-role RPCs. New-style secret keys (sb_secret_...)
 * go only in the `apikey` header; legacy JWT keys also go in Authorization.
 */
export function createSupabasePublisher(opts: { url: string; key: string; fetchImpl?: FetchLike }): Publisher {
  const host = new URL(opts.url).hostname;
  const headers: Record<string, string> = {
    apikey: opts.key,
    'Content-Type': 'application/json',
    'Content-Profile': 'api',
    'Accept-Profile': 'api',
  };
  if (opts.key.startsWith('eyJ')) headers.Authorization = `Bearer ${opts.key}`;

  async function rpc<T>(name: string, body: unknown): Promise<T> {
    const res = await fetchAllowed(`${opts.url}/rest/v1/rpc/${name}`, {
      kind: 'api', method: 'POST', headers, body: JSON.stringify(body), extraHosts: [host], fetchImpl: opts.fetchImpl,
    });
    if (res.status < 200 || res.status >= 300) {
      let msg = res.text.slice(0, 300);
      try { msg = JSON.parse(res.text).message ?? msg; } catch { /* keep raw */ }
      throw new SupabaseError(`rpc ${name}: HTTP ${res.status}: ${msg}`);
    }
    return (res.text ? JSON.parse(res.text) : null) as T;
  }

  return {
    upsertItem: (item) => rpc('upsert_item', { p: itemPayload(item) }),
    setItemStatus: async (id, status, note) => { await rpc('set_item_status', { p_id: id, p_status: status, p_note: note }); },
    publishBlurb: (p) => rpc('publish_blurb', { p }),
    upsertMacro: async (o) => { await rpc('upsert_macro', { p: o }); },
  };
}

/** Dry-run publisher: records everything, sends nothing. */
export function createDryRunPublisher() {
  const items: RawItem[] = [];
  const cards: PublishPayload[] = [];
  const macro: MacroObservation[] = [];
  const seen = new Set<string>();
  const publisher: Publisher = {
    async upsertItem(item) {
      const is_new = !seen.has(item.url);
      seen.add(item.url);
      items.push(item);
      return { id: `dry-${items.length}`, is_new, status: 'new' };
    },
    async setItemStatus() { /* nothing */ },
    async publishBlurb(p) {
      if (cards.some((c) => c.dedupe_key === p.dedupe_key)) return { status: 'duplicate', id: null };
      cards.push(p);
      return { status: 'published', id: `dry-card-${cards.length}` };
    },
    async upsertMacro(o) { macro.push(o); },
  };
  return { publisher, items, cards, macro };
}

export function itemPayload(item: RawItem) {
  return {
    source: item.source,
    external_id: item.external_id,
    url: item.url,
    title: item.title,
    body_text: null,                 // page text is not stored; it is re-fetched (cached) when needed
    published_at: item.published_at,
    license_class: item.license_class,
    use_level: 'full_summarize',
    tickers: item.tickers.map((t) => t.symbol),
    event_type: item.event_type,
  };
}

/** Card payload from an item and its (validated) draft. */
export function buildPublishPayload(
  item: RawItem,
  draft: SummaryDraft,
  meta: { itemId?: string; aiGenerated: boolean; model: string | null },
): PublishPayload {
  const known = new Map(item.tickers.map((t) => [t.symbol.toUpperCase(), t]));
  const tickers = draft.tickers
    .map((s) => known.get(s.toUpperCase()) ?? { symbol: s.toUpperCase(), name: s.toUpperCase(), exchange: null })
    .slice(0, config.maxTickersPerCard);
  return {
    dedupe_key: item.url,
    item_id: meta.itemId,
    kind: 'summary',
    headline: draft.headline.trim(),
    body: draft.body?.trim() || null,
    category: draft.category,
    event_type: draft.event_type ?? item.event_type,
    ai_generated: meta.aiGenerated,
    tickers: tickers.length ? tickers : item.tickers,
    macro: [],
    as_of: item.published_at,
    sort_at: item.published_at,
    model: meta.model,
    prompt_version: meta.aiGenerated ? config.promptVersion : null,
    attribution: null,
    sources: [{
      name: item.source_name, kind: item.source_kind, doc_label: item.doc_label, url: item.url,
      published_at: item.published_at, license_class: item.license_class, attribution: null, is_primary: true,
    }],
  };
}

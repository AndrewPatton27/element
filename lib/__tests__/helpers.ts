import type { AppConfig, BlurbCard, MacroFact } from '../../contract/types.ts';

export const NOW = new Date('2026-10-17T18:00:00Z');

export function fact(over: Partial<MacroFact> = {}): MacroFact {
  return {
    series_id: 'DGS10',
    label: '10-yr Treasury',
    value: '4.12%',
    change: '+0.05 pts',
    direction: 'up',
    period: null,
    as_of: '2026-10-16',
    source_name: 'Board of Governors of the Federal Reserve System via FRED',
    source_short: 'Fed via FRED',
    source_url: 'https://fred.stlouisfed.org/series/DGS10',
    sort_order: 1,
    ...over,
  };
}

export function card(over: Partial<BlurbCard> = {}): BlurbCard {
  return {
    id: 'c1',
    kind: 'summary',
    headline: '[SAMPLE] Northwind Corp beats estimates',
    body: 'Northwind reported revenue of $1.2 billion.',
    category: 'earnings',
    event_type: 'earnings',
    tickers: [{ symbol: 'NWND', name: 'Northwind Corp', exchange: 'Nasdaq', quote: null }],
    macro: [],
    sources: [
      {
        name: 'SEC',
        kind: 'filing',
        doc_label: 'Form 8-K',
        url: 'https://www.sec.gov/Archives/edgar/data/1/0001.htm',
        published_at: '2026-10-17T12:00:00Z',
        license_class: 'company_filing',
        attribution: null,
        is_primary: true,
      },
    ],
    source_count: 1,
    as_of: '2026-10-17T12:00:00Z',
    published_at: '2026-10-17T12:05:00Z',
    sort_at: '2026-10-17T12:00:00Z',
    updated_at: null,
    revision: 1,
    freshness: { delayed_hours: null },
    ai: { generated: true, label: 'AI-generated summary · may contain errors' },
    attribution: null,
    image: null,
    is_saved: false,
    share_path: '/b/c1',
    importance: 5,
    ...over,
  };
}

export function dataCard(over: Partial<BlurbCard> = {}): BlurbCard {
  return card({
    id: 'd1',
    kind: 'data',
    category: 'economy',
    event_type: 'macro_release',
    headline: '[SAMPLE] 10-year yield ticks up',
    tickers: [],
    macro: [fact()],
    ai: { generated: false, label: null },
    ...over,
  });
}

export function config(over: Partial<AppConfig> = {}): AppConfig {
  return {
    disclaimer: 'Informational only · Not investment advice',
    ai_notice: 'AI-generated summary · may contain errors',
    required_notices: [
      { key: 'fred', text: 'FRED notice text', url: 'https://fred.stlouisfed.org/', placements: ['numbers_panel', 'data_card'] },
      { key: 'takedown', text: 'Takedown contact', url: null, placements: ['about'] },
    ],
    min_supported_app_version: '0.1.0',
    quotes_enabled: false,
    linkout_cards: false,
    ...over,
  };
}

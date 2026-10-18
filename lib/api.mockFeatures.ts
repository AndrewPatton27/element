// Pure mock implementations for search, related cards, following and briefs.
// Kept separate from fixture-loading code so these rules can run under node:test.
import type { BlurbCard, Brief, FeedPage, MacroFact, NumberTrend } from '../contract/types.ts';

export function createMockFeatureApi(cards: BlurbCard[], numbers: MacroFact[], trends: NumberTrend[]) {
  const page = (items: BlurbCard[], cursor?: string | null, limit = 20): FeedPage => {
    const start = Math.max(0, Number.parseInt(cursor ?? '0', 10) || 0);
    const slice = items.slice(start, start + limit);
    return { items: slice, next_cursor: start + slice.length < items.length ? String(start + slice.length) : null };
  };
  const brief = (requestedWindow: number): Brief => {
    const cutoff = (hours: number) => Date.now() - hours * 3_600_000;
    let window_hours = requestedWindow;
    let ranked = cards.filter((c) => Date.parse(c.sort_at) >= cutoff(window_hours));
    if (requestedWindow === 24 && ranked.length < 6) {
      window_hours = 48;
      ranked = cards.filter((c) => Date.parse(c.sort_at) >= cutoff(window_hours));
    }
    if (requestedWindow === 168) ranked = cards.filter((c) => Date.parse(c.sort_at) >= cutoff(168));
    ranked.sort((a, b) => (b.importance ?? 1) * Math.pow(0.5, Math.max(0, Date.now() - Date.parse(b.sort_at)) / 43_200_000) - (a.importance ?? 1) * Math.pow(0.5, Math.max(0, Date.now() - Date.parse(a.sort_at)) / 43_200_000));
    const groups = new Map<string, BlurbCard[]>();
    for (const c of ranked) groups.set(c.category, [...(groups.get(c.category) ?? []), c]);
    return {
      generated_at: new Date().toISOString(), window_hours,
      headline_cards: [...groups.values()].slice(0, 3).map((g) => g[0]),
      sections: [...groups.entries()].slice(0, 5).map(([category, grouped]) => ({ category, label: category, cards: grouped.slice(0, 3) })),
      numbers: numbers.slice(0, 4),
    };
  };
  return {
    search(q: string, cursor?: string | null, limit = 20) {
      const needle = q.trim().toLocaleLowerCase();
      if (needle.length < 2) return { items: [], next_cursor: null } as FeedPage;
      const found = cards.filter((c) => [c.headline, c.body, c.detail?.paragraphs.join(' '), c.detail?.key_points.join(' '), c.category, ...c.tickers.map((t) => `${t.symbol} ${t.name}`), ...c.sources.map((s) => s.name)].filter(Boolean).join(' ').toLocaleLowerCase().includes(needle))
        .sort((a, b) => (b.importance ?? 1) * Math.pow(0.5, Math.max(0, Date.now() - Date.parse(b.sort_at)) / 259_200_000) - (a.importance ?? 1) * Math.pow(0.5, Math.max(0, Date.now() - Date.parse(a.sort_at)) / 259_200_000));
      return page(found, cursor, limit);
    },
    relatedCards(cardId: string, limit = 5) {
      const source = cards.find((c) => c.id === cardId);
      if (!source) return [] as BlurbCard[];
      const tickers = new Set(source.tickers.map((t) => t.symbol.toLocaleLowerCase()));
      const series = new Set(source.macro.map((m) => m.series_id));
      return cards.filter((c) => c.id !== cardId && (c.category === source.category || c.tickers.some((t) => tickers.has(t.symbol.toLocaleLowerCase())) || c.macro.some((m) => series.has(m.series_id)))).slice(0, limit);
    },
    followingFeed(f: { topics: string[]; sources: string[]; tickers: string[]; cursor?: string | null; limit?: number }) {
      const topics = new Set(f.topics.map((x) => x.toLocaleLowerCase()));
      const sources = new Set(f.sources.map((x) => x.toLocaleLowerCase()));
      const tickers = new Set(f.tickers.map((x) => x.toLocaleLowerCase()));
      if (!topics.size && !sources.size && !tickers.size) return page([...cards].sort((a,b) => Date.parse(b.sort_at) + 8 * 3_600_000 * Math.log2(Math.max(b.importance ?? 1,0.1)) - Date.parse(a.sort_at) - 8 * 3_600_000 * Math.log2(Math.max(a.importance ?? 1,0.1))), f.cursor, f.limit);
      const direct = cards.filter((c) => topics.has(c.category.toLocaleLowerCase()) || c.sources.some((s) => sources.has(s.name.toLocaleLowerCase())) || c.tickers.some((t) => tickers.has(t.symbol.toLocaleLowerCase())));
      const directIds = new Set(direct.map((c) => c.id));
      const followedTickers = new Set(direct.flatMap((c) => c.tickers.map((t) => t.symbol.toLocaleLowerCase())));
      const related = cards.filter((c) => !directIds.has(c.id) && (c.tickers.some((t) => followedTickers.has(t.symbol.toLocaleLowerCase())) || direct.some((d) => d.category === c.category)));
      const freshness = (c: BlurbCard) => Math.pow(0.5, Math.max(0, Date.now() - Date.parse(c.sort_at)) / 43_200_000);
      const relevance = (c: BlurbCard, directMatch: boolean) => (directMatch ? 1 : 0.6) * freshness(c) * (c.importance ?? 1);
      const items = [
        ...direct.sort((a,b) => relevance(b,true)-relevance(a,true)).map((c) => ({ ...c, follow_reason: topics.has(c.category.toLocaleLowerCase()) ? `Because you follow ${c.category}` : `Because you follow ${c.tickers.find((t) => tickers.has(t.symbol.toLocaleLowerCase()))?.symbol ?? c.sources.find((s) => sources.has(s.name.toLocaleLowerCase()))?.name ?? 'this story'}` })),
        ...related.sort((a,b) => relevance(b,false)-relevance(a,false)).map((c) => ({ ...c, follow_reason: `Related to ${c.tickers[0]?.symbol ?? c.category}` })),
      ];
      return page(items, f.cursor, f.limit);
    },
    dailyBrief: () => brief(24),
    weeklyBrief: () => ({ ...brief(168), movers: trends.slice(0, 4).map((t) => ({ ...t, points: [...t.points] })) }),
  };
}

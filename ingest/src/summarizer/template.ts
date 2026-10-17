// Template cards: no AI. Built only from feed metadata (company, 8-K item numbers,
// press-release title), so they are always truthful. ai_generated = false.

import { config } from '../config.ts';
import type { SummarizeInput, Summarizer, SummaryDraft } from '../types.ts';

/** Short label for headlines and a plain explanation for the body, per 8-K item. */
export const ITEM_TEXT: Record<string, { short: string; explain: string }> = {
  '1.01': { short: 'material agreement', explain: 'entering a major agreement' },
  '1.02': { short: 'agreement ended', explain: 'ending a major agreement' },
  '2.01': { short: 'acquisition or sale completed', explain: 'completing an acquisition or a sale of assets' },
  '2.02': { short: 'results of operations', explain: 'quarterly or annual results' },
  '2.05': { short: 'exit or restructuring costs', explain: 'costs of exiting a business or restructuring' },
  '2.06': { short: 'material impairment', explain: 'a large write-down of assets' },
  '3.01': { short: 'listing rule notice', explain: 'a notice that the company no longer meets an exchange listing rule' },
  '4.02': { short: 'non-reliance on prior financials', explain: 'earlier financial statements that can no longer be relied on' },
  '5.02': { short: 'officer or director change', explain: 'changes in directors or senior officers' },
  '7.01': { short: 'Regulation FD disclosure', explain: 'information shared with investors under Regulation FD' },
  '8.01': { short: 'other events', explain: 'other events the company chooses to report' },
  '9.01': { short: 'financial statements and exhibits', explain: 'attached financial statements and exhibits' },
};

function cutAtWord(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:]$/, '') + '…';
}

export function templateDraft(input: SummarizeInput): SummaryDraft {
  const it = input.item;
  if (it.source === 'sec_8k') {
    const items = it.items ?? [];
    const main = items[0];
    const t = ITEM_TEXT[main?.number] ?? { short: 'filing', explain: 'a reportable event' };
    const company = it.company ?? 'A company';
    const others = items.slice(1).map((i) => i.number).filter((n) => n !== '9.01');
    let headline = `${company} files 8-K: Item ${main?.number ?? ''}, ${t.short}`;
    if (headline.length > config.headlineMaxChars) headline = cutAtWord(headline, config.headlineMaxChars);
    const also = others.length ? `, plus Item${others.length > 1 ? 's' : ''} ${others.join(' and ')}` : '';
    const body = `${company} filed a Form 8-K under Item ${main?.number}, which covers ${t.explain}${also}. Open the filing for details.`;
    return { headline, body, category: it.category, event_type: it.event_type, tickers: it.tickers.map((x) => x.symbol) };
  }
  // Federal Reserve press release: the public-domain title is the headline.
  return {
    headline: cutAtWord(it.title, config.headlineMaxChars),
    body: 'The Federal Reserve Board published this press release. Open the source for the full text.',
    category: it.category,
    event_type: it.event_type,
    tickers: [],
  };
}

export const templateSummarizer: Summarizer = {
  name: 'template',
  usesAi: false,
  async summarize(input) {
    return templateDraft(input);
  },
};

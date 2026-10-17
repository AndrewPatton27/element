// Template cards: no AI. Built only from feed metadata (company, 8-K item numbers,
// press-release title), so they are always truthful. ai_generated = false.

import { config } from '../config.ts';
import type { SummarizeInput, Summarizer, SummaryDraft } from '../types.ts';

/** Short label for headlines and a plain explanation for the body, per 8-K item. */
export const ITEM_TEXT: Record<string, { short: string; explain: string }> = {
  '1.01': { short: 'material agreement', explain: 'entering a major agreement' },
  '1.02': { short: 'agreement ended', explain: 'ending a major agreement' },
  '1.03': { short: 'bankruptcy or receivership', explain: 'a bankruptcy or receivership' },
  '1.05': { short: 'cybersecurity incident', explain: 'a material cybersecurity incident' },
  '2.01': { short: 'acquisition or sale completed', explain: 'completing an acquisition or a sale of assets' },
  '2.02': { short: 'results of operations', explain: 'quarterly or annual results' },
  '2.05': { short: 'exit or restructuring costs', explain: 'costs of exiting a business or restructuring' },
  '2.06': { short: 'material impairment', explain: 'a large write-down of assets' },
  '3.01': { short: 'listing rule notice', explain: 'a notice that the company no longer meets an exchange listing rule' },
  '4.01': { short: 'auditor change', explain: 'a change of outside auditor' },
  '4.02': { short: 'non-reliance on prior financials', explain: 'earlier financial statements that can no longer be relied on' },
  '5.02': { short: 'officer or director change', explain: 'changes in directors or senior officers' },
  '7.01': { short: 'Regulation FD disclosure', explain: 'information shared with investors under Regulation FD' },
  '8.01': { short: 'other events', explain: 'other events the company chooses to report' },
  '9.01': { short: 'financial statements and exhibits', explain: 'attached financial statements and exhibits' },
};

/**
 * Plain-language card text per 8-K item (8th-grade reading level, no jargon). The pipeline only
 * publishes template cards for watch-list companies and config.templateSecItems; other items fall
 * back to ITEM_TEXT wording.
 */
export const PLAIN_ITEM: Record<string, { headline: (co: string) => string; body: (co: string) => string }> = {
  '2.02': {
    headline: (co) => `${co} shares its latest financial results`,
    body: (co) => `${co} sent the SEC a report on its latest results, like sales and profit. Open the filing to see the numbers.`,
  },
  '5.02': {
    headline: (co) => `${co} reports a change in its top leaders`,
    body: (co) => `${co} told the SEC about a change among its top leaders. Open the filing to see who is coming or going.`,
  },
  '1.05': {
    headline: (co) => `${co} reports a cybersecurity incident`,
    body: (co) => `${co} told the SEC about a serious cybersecurity incident, such as a hack. Open the filing for details.`,
  },
  '4.02': {
    headline: (co) => `${co} says some past financial reports were wrong`,
    body: (co) => `${co} told the SEC that some earlier financial reports can no longer be trusted and must be fixed. Open the filing for details.`,
  },
  '2.05': {
    headline: (co) => `${co} reports costs to cut back part of its business`,
    body: (co) => `${co} told the SEC it expects costs from cutting back or closing part of its business. This kind of filing covers costs like layoffs or closing sites.`,
  },
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
    const company = it.company ?? 'A company';
    const plain = PLAIN_ITEM[main?.number ?? ''];
    const t = ITEM_TEXT[main?.number] ?? { short: 'filing', explain: 'a reportable event' };
    const headline = cutAtWord(plain ? plain.headline(company) : `${company} reports ${t.explain}`, config.headlineMaxChars);
    const body = plain ? plain.body(company) : `${company} told the SEC about ${t.explain}. Open the filing for details.`;
    return { headline, body, category: it.category, event_type: it.event_type, tickers: it.tickers.map((x) => x.symbol) };
  }
  if (it.source === 'fedreg') {
    // Public-domain rule title, cut at a word to the card limit (never past 90 chars).
    return {
      headline: cutAtWord(it.title, config.headlineMaxChars),
      // Not published by the pipeline (no relevance score without the AI); kept for completeness.
      body: `${it.agency ?? 'A federal agency'} published this final rule in the Federal Register. Open the source for the full text.`,
      category: it.category,
      event_type: null,
      tickers: [],
    };
  }
  // Federal Reserve or BEA release: the public-domain title is the headline.
  return {
    headline: cutAtWord(it.title, config.headlineMaxChars),
    body: it.source === 'bea_rss'
      ? 'The U.S. Bureau of Economic Analysis, the government office that tracks the economy, posted this report. Open the source to read it.'
      : 'The Federal Reserve, the central bank that sets U.S. interest rates, posted this news. Open the source to read it.',
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

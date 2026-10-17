// Gemini (free tier) summarizer. Only public-domain and SEC filing text is sent
// (the chain checks the license before any provider is called).

import { config } from '../config.ts';
import { fetchAllowed, type FetchLike } from '../allowlist.ts';
import { CATEGORY_SLUGS } from '../validate.ts';
import type { SummarizeInput, Summarizer, SummaryDraft } from '../types.ts';

export class RateLimitedError extends Error {
  constructor(provider: string) {
    super(`${provider}: rate limited`);
    this.name = 'RateLimitedError';
  }
}

export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderError';
  }
}

export function buildPrompt(input: SummarizeInput): string {
  const it = input.item;
  const lines = [
    'You write short, neutral news cards for busy readers about business and the economy.',
    'Use ONLY facts stated in the SOURCE TEXT. If the text is thin, say only what it says.',
    'Rules:',
    `- "headline": plain English, at most ${config.headlineMaxChars} characters.`,
    `- "body": 2 or 3 sentences, at most ${config.bodyMaxWords} words, or null if the text has no facts beyond the headline.`,
    '- Every number you write must appear in the source text exactly. Do not calculate new numbers.',
    '- Never give advice or opinions. Do not use words like should, recommend, buy, sell, hold, price target, guaranteed.',
    '- Do not copy more than 8 words in a row from the source; rephrase.',
    `- "category": one of ${CATEGORY_SLUGS.join(', ')}.`,
    '- "event_type": one of earnings, exec_change, deal, insider, macro_release, fed, or null.',
    '- "tickers": stock symbols that appear in the source text or the metadata below, else [].',
    'Return JSON only.',
    '',
    `SOURCE: ${it.source_name}, ${it.doc_label}, ${it.published_at}`,
    it.tickers.length ? `TICKERS: ${it.tickers.map((t) => `${t.symbol} (${t.name})`).join(', ')}` : '',
    `SUGGESTED CATEGORY: ${it.category}; SUGGESTED EVENT TYPE: ${it.event_type ?? 'null'}`,
  ];
  if (input.retryErrors?.length) {
    lines.push('', `Your previous answer was rejected for: ${input.retryErrors.join('; ')}. Fix these problems.`);
  }
  lines.push('', 'SOURCE TEXT:', input.text);
  return lines.join('\n');
}

export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    headline: { type: 'STRING' },
    body: { type: 'STRING', nullable: true },
    category: { type: 'STRING', enum: [...CATEGORY_SLUGS] },
    event_type: { type: 'STRING', nullable: true },
    tickers: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['headline', 'body', 'category', 'event_type', 'tickers'],
};

export function createGeminiSummarizer(opts: { apiKey: string; model?: string; fetchImpl?: FetchLike }): Summarizer {
  const model = opts.model ?? config.gemini.model;
  return {
    name: 'gemini',
    usesAi: true,
    async summarize(input): Promise<SummaryDraft> {
      const url = config.gemini.endpoint.replace('{model}', model);
      const res = await fetchAllowed(url, {
        kind: 'api',
        method: 'POST',
        fetchImpl: opts.fetchImpl,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey },  // key in a header, never in the URL
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: buildPrompt(input) }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 400,
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      });
      if (res.status === 429) throw new RateLimitedError('gemini');
      if (res.status < 200 || res.status >= 300) {
        throw new ProviderError(`gemini: HTTP ${res.status}: ${res.text.slice(0, 200)}`);
      }
      let text: string | undefined;
      try {
        text = JSON.parse(res.text)?.candidates?.[0]?.content?.parts?.[0]?.text;
      } catch {
        throw new ProviderError('gemini: response is not JSON');
      }
      if (!text) throw new ProviderError('gemini: empty response');
      return JSON.parse(text) as SummaryDraft;   // shape is checked by the validator
    },
  };
}

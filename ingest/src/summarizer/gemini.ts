// Gemini (free tier) summarizer. Only public-domain and SEC filing text is sent
// (the chain checks the license before any provider is called).

import { aiDailyCap, config, minIntervalMs } from '../config.ts';
import { fetchAllowed, type FetchLike } from '../allowlist.ts';
import { AI_CATEGORY_SLUGS } from '../validate.ts';
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

/** Rubric for the everyday_relevance score (same words in the prompt and both JSON schemas). */
export const RELEVANCE_RUBRIC = 'Would a typical college student or young adult who does not invest notice this or be affected by it? '
  + '5 = national headline, or it changes their money, jobs and internships, student loans, rent and prices, gas, travel and airfares, '
  + 'phones and subscriptions, apps and brands they use, or taxes on a first job; 3 = a well-known company or a change some people will notice; '
  + '1 = institutional or routine paperwork (board seats, pay plans, small-bank enforcement, technical rules).';

export function buildPrompt(input: SummarizeInput): string {
  const it = input.item;
  const lines = [
    'You write short, neutral news cards about business and the economy for college students and young adults.',
    'Use ONLY facts stated in the SOURCE TEXT. If the text is thin, say only what it says.',
    'WRITING STYLE: very easy to understand. Use plain words at about an 8th-grade reading level and short sentences. No jargon.',
    '- If a term like "convertible notes" or "restatement" cannot be avoided, explain it in a few plain words (for example "borrowed money that can turn into shares").',
    '- Sentence 1 says what happened, in plain words.',
    '- The last sentence says why it matters to a regular person or a student, but ONLY if that follows directly from the facts in the source. Never guess, predict prices or give advice. If it does not follow, leave it out.',
    `HARD LIMITS (a card that breaks one is rejected): headline at most ${config.headlineMaxChars} characters including spaces; body 2 or 3 sentences and at most ${config.bodyMaxWords} words in total.`,
    'Rules:',
    `- "headline": short and plain, at most ${config.headlineMaxChars} characters (aim for about ${config.headlineTargetChars}).`,
    `- "body": 2 or 3 short sentences, at most ${config.bodyMaxWords} words (aim for about ${Math.round(config.bodyMaxWords * 0.75)}), or null if the text has no facts beyond the headline.`,
    '- Every number you write must appear in the source text exactly. Do not calculate new numbers.',
    '- Never give advice or opinions. Do not use words like should, recommend, buy, sell, hold, price target, guaranteed.',
    '- Do not copy more than 8 words in a row from the source; rephrase.',
    `- "category": one of ${AI_CATEGORY_SLUGS.join(', ')}.`,
    '- "event_type": one of earnings, exec_change, deal, insider, macro_release, fed, or null.',
    '- "tickers": stock symbols that appear in the source text or the metadata below, else [].',
    `- "everyday_relevance": a whole number from 1 to 5. ${RELEVANCE_RUBRIC}`,
    `- "detail": a longer, still easy version for readers who tap the card. "paragraphs": ${config.detail.minParagraphs} to ${config.detail.maxParagraphs} short paragraphs, at most ${config.detail.maxWords} words in total: what happened, the background a student needs to understand it, and what it means for regular people ONLY if that follows from the source. "key_points": ${config.detail.minKeyPoints} to ${config.detail.maxKeyPoints} short points, each at most ${config.detail.keyPointMaxWords} words. Same rules as the card: plain words, facts from the source only, every number must appear in the source, no advice, no predictions, no copying more than 8 words in a row.`,
    'Return JSON only.',
    '',
    `SOURCE: ${it.source_name}, ${it.doc_label}, ${it.published_at}`,
    it.tickers.length ? `TICKERS: ${it.tickers.map((t) => `${t.symbol} (${t.name})`).join(', ')}` : '',
    `SUGGESTED CATEGORY: ${it.category}; SUGGESTED EVENT TYPE: ${it.event_type ?? 'null'}`,
  ];
  if (input.retryErrors?.length) {
    lines.push('', `Your previous answer was rejected for: ${input.retryErrors.join('; ')}. Fix these problems.`);
    if (input.retryErrors.some((e) => /longer than/.test(e))) {
      lines.push(`Write it shorter: headline at most ${config.headlineMaxChars} characters, body at most ${config.bodyMaxWords} words in 2 or 3 sentences.`);
    }
  }
  lines.push('', 'SOURCE TEXT:', input.text);
  return lines.join('\n');
}

export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    headline: { type: 'STRING', description: `At most ${config.headlineMaxChars} characters.` },
    body: { type: 'STRING', nullable: true, description: `2 or 3 sentences, at most ${config.bodyMaxWords} words.` },
    category: { type: 'STRING', enum: [...AI_CATEGORY_SLUGS] },
    event_type: { type: 'STRING', nullable: true },
    tickers: { type: 'ARRAY', items: { type: 'STRING' } },
    everyday_relevance: { type: 'INTEGER', description: `1 to 5. ${RELEVANCE_RUBRIC}` },
    detail: {
      type: 'OBJECT',
      description: `In-depth version: ${config.detail.minParagraphs}-${config.detail.maxParagraphs} short paragraphs (<= ${config.detail.maxWords} words in total) and ${config.detail.minKeyPoints}-${config.detail.maxKeyPoints} key points (<= ${config.detail.keyPointMaxWords} words each).`,
      properties: {
        paragraphs: { type: 'ARRAY', items: { type: 'STRING' } },
        key_points: { type: 'ARRAY', items: { type: 'STRING' } },
      },
      required: ['paragraphs', 'key_points'],
    },
  },
  required: ['headline', 'body', 'category', 'event_type', 'tickers', 'everyday_relevance', 'detail'],
};

export function createGeminiSummarizer(opts: {
  apiKey: string;
  model?: string;
  fetchImpl?: FetchLike;
  minIntervalMs?: number;
  dailyCap?: number;
}): Summarizer {
  const model = opts.model ?? config.gemini.model;
  return {
    name: 'gemini',
    usesAi: true,
    model,
    dailyCap: opts.dailyCap ?? aiDailyCap(),
    minIntervalMs: opts.minIntervalMs ?? minIntervalMs(config.gemini.freeRpm, 5000),
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
            maxOutputTokens: 1200,                // card + detail (sum-v3)
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

// Validates an AI (or template) draft before it can be published.
// A draft that fails is retried once with the errors, then replaced by a
// template card. Nothing here calls the network.

import { config } from './config.ts';

export const CATEGORY_SLUGS = [
  'markets', 'earnings', 'economy', 'policy', 'tech', 'deals', 'energy', 'insider', 'personal-finance',
] as const;

/** License classes whose text may be sent to the AI in this build. */
export const SUMMARIZABLE = ['public_domain', 'company_filing'] as const;

export class NotSummarizableError extends Error {
  constructor(licenseClass: string) {
    super(`license class "${licenseClass}" may not be summarized`);
    this.name = 'NotSummarizableError';
  }
}

/** Throws unless text with this license class may be sent to the AI. */
export function assertSummarizable(licenseClass: string): void {
  if (!(SUMMARIZABLE as readonly string[]).includes(licenseClass)) {
    throw new NotSummarizableError(licenseClass);
  }
}

export interface Draft {
  headline: string;
  body: string | null;
  category: string;
  event_type: string | null;
  tickers: string[];
}

export interface SourceText {
  text: string;                  // the licensed source text the draft was written from
  licenseClass: string;          // 'company_filing' | 'public_domain'
  tickers?: string[];            // tickers known from filing metadata
}

export interface Result {
  ok: boolean;
  errors: string[];
}

// ---- helpers -------------------------------------------------------------------

// Form names contain digits that are not facts ("8-K", "10-Q"); drop them before number checks.
const FORM_TOKENS = /\b(?:8-K|10-K|10-Q|20-F|6-K|S-1|S-4|13D|13G|DEF 14A|Form [345])\b/gi;
const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

export function extractNumbers(text: string): string[] {
  const cleaned = text.replace(FORM_TOKENS, ' ');
  const out: string[] = [];
  for (const m of cleaned.match(NUMBER) ?? []) {
    const n = Number(m.replace(/,/g, '').replace(/\.$/, ''));
    if (Number.isFinite(n)) out.push(String(n));
  }
  return out;
}

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .split(/[^a-z0-9'%$.]+/)
    .map((w) => w.replace(/^[.']+|[.']+$/g, ''))
    .filter(Boolean);
}

const isNumberToken = (w: string) => /^[$]?\d[\d,.]*%?$/.test(w);

/**
 * Longest run of consecutive words shared by `draft` and `source`.
 * Number tokens may sit inside a run but do not count toward its length.
 */
export function longestCopiedRun(draft: string, source: string, ignorePhrases: readonly string[] = []): number {
  let src = source.toLowerCase();
  for (const p of ignorePhrases) src = src.split(p.toLowerCase()).join(' | ');
  const a = words(draft);
  const b = words(src);
  let best = 0;
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        cur[j] = prev[j - 1] + (isNumberToken(a[i - 1]) ? 0 : 1);
        if (cur[j] > best) best = cur[j];
      }
    }
    prev = cur;
  }
  return best;
}

export function findAdvice(text: string, blocklist: readonly string[] = config.adviceBlocklist): string[] {
  const hits: string[] = [];
  for (const phrase of blocklist) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    if (new RegExp(`(^|[^a-z])${escaped}($|[^a-z])`, 'i').test(text)) hits.push(phrase);
  }
  return hits;
}

/** 8-K item titles may be quoted verbatim; they do not count toward the copy limit. */
export const ITEM_TITLES = [
  'Entry into a Material Definitive Agreement',
  'Termination of a Material Definitive Agreement',
  'Completion of Acquisition or Disposition of Assets',
  'Results of Operations and Financial Condition',
  'Costs Associated with Exit or Disposal Activities',
  'Material Impairments',
  'Notice of Delisting or Failure to Satisfy a Continued Listing Rule or Standard; Transfer of Listing',
  'Non-Reliance on Previously Issued Financial Statements or a Related Audit Report or Completed Interim Review',
  'Departure of Directors or Certain Officers; Election of Directors; Appointment of Certain Officers; Compensatory Arrangements of Certain Officers',
  'Regulation FD Disclosure',
  'Other Events',
  'Financial Statements and Exhibits',
];

// ---- main checks -----------------------------------------------------------------

/** Parses model output text into a Draft-shaped object, or returns errors. */
export function parseDraft(raw: string): { draft: Draft | null; errors: string[] } {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return { draft: null, errors: ['output is not valid JSON'] };
  }
  const errors = checkShape(obj);
  return { draft: errors.length ? null : (obj as Draft), errors };
}

export function checkShape(obj: unknown): string[] {
  const e: string[] = [];
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return ['output is not a JSON object'];
  const d = obj as Record<string, unknown>;
  if (typeof d.headline !== 'string' || d.headline.trim() === '') e.push('headline missing');
  else if (d.headline.length > config.headlineMaxChars) e.push(`headline longer than ${config.headlineMaxChars} chars`);
  if (d.body !== null && typeof d.body !== 'string') e.push('body must be a string or null');
  else if (typeof d.body === 'string' && d.body.trim().split(/\s+/).length > config.bodyMaxWords) {
    e.push(`body longer than ${config.bodyMaxWords} words`);
  }
  if (typeof d.category !== 'string' || !(CATEGORY_SLUGS as readonly string[]).includes(d.category)) {
    e.push('category is not one of the 9 slugs');
  }
  if (d.event_type !== null && d.event_type !== undefined && typeof d.event_type !== 'string') {
    e.push('event_type must be a string or null');
  }
  if (!Array.isArray(d.tickers) || d.tickers.some((t) => typeof t !== 'string')) e.push('tickers must be an array of strings');
  else if (d.tickers.length > config.maxTickersPerCard) e.push(`more than ${config.maxTickersPerCard} tickers`);
  return e;
}

/** Full validation of a draft against the licensed source text it came from. */
export function validateDraft(draft: Draft, source: SourceText): Result {
  const errors = checkShape(draft);
  if (errors.length) return { ok: false, errors };

  const text = `${draft.headline}\n${draft.body ?? ''}`;

  // 1. no advice language
  const advice = findAdvice(text);
  if (advice.length) errors.push(`advice language: ${advice.join(', ')}`);

  // 2. every number must appear in the source
  const srcNums = new Set(extractNumbers(source.text));
  const missing = extractNumbers(text).filter((n) => !srcNums.has(n));
  if (missing.length) errors.push(`numbers not in source: ${[...new Set(missing)].join(', ')}`);

  // 3. every ticker must appear in the source or its metadata
  const known = new Set((source.tickers ?? []).map((t) => t.toUpperCase()));
  for (const t of draft.tickers) {
    const sym = t.toUpperCase();
    if (!known.has(sym) && !new RegExp(`\\b${sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(source.text)) {
      errors.push(`ticker not in source: ${sym}`);
    }
  }

  // 4. copy limit
  const limit = config.copyLimitWords[source.licenseClass];
  if (limit === undefined) {
    errors.push(`no copy limit for license class ${source.licenseClass}`);
  } else {
    const run = longestCopiedRun(text, source.text, ITEM_TITLES);
    if (run > limit) errors.push(`copies ${run} consecutive words from the source (limit ${limit})`);
  }

  return { ok: errors.length === 0, errors };
}

// ---- publish payload check (mirrors api.publish_blurb) ----------------------------

export interface PublishSource {
  name: string;
  kind: string;
  url: string;
  license_class: string;
}

export function validatePublish(card: { kind: string; ai_generated: boolean; sources: PublishSource[] }): Result {
  const errors: string[] = [];
  if (!Array.isArray(card.sources) || card.sources.length === 0) errors.push('card needs at least one source link');
  else {
    if (card.sources.length > config.maxSourcesPerCard) errors.push(`more than ${config.maxSourcesPerCard} sources`);
    for (const s of card.sources) {
      if (!/^https:\/\//.test(s.url ?? '')) errors.push(`source URL must be https: ${s.name}`);
      if (s.license_class === 'dev_only') errors.push('dev_only sources can never be published');
    }
    if (card.ai_generated) {
      for (const s of card.sources) {
        if (!(SUMMARIZABLE as readonly string[]).includes(s.license_class)) {
          errors.push(`AI card cites a source whose text may not be summarized: ${s.license_class}`);
        }
      }
    }
  }
  if (card.kind === 'link_out') errors.push('link_out cards are disabled in this build');
  return { ok: errors.length === 0, errors };
}

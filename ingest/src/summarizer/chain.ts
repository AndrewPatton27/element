// Runs summarizers in order (a plain list: adding a provider is one entry).
// 1. License gate before any provider: only public-domain and filing text.
// 2. Each AI provider: skipped when its daily cap is reached; one retry with the
//    validator errors; a 429 or provider error moves on to the next provider.
// 3. The template summarizer is the last resort and never calls an AI.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { aiDailyCap, config } from '../config.ts';
import { assertSummarizable, checkShape, validateDraft } from '../validate.ts';
import { templateSummarizer } from './template.ts';
import type { SummarizeInput, Summarizer, SummaryDraft } from '../types.ts';

export interface UsageCounter {
  used(provider: string): number;
  add(provider: string): void;
}

/** In-memory counter (tests, dry runs). */
export function memoryCounter(): UsageCounter {
  const m = new Map<string, number>();
  return { used: (p) => m.get(p) ?? 0, add: (p) => m.set(p, (m.get(p) ?? 0) + 1) };
}

/** Per-day counter stored in a local JSON file (resets when the UTC date changes). */
export function fileCounter(path: string, today = () => new Date().toISOString().slice(0, 10)): UsageCounter {
  const load = (): { day: string; counts: Record<string, number> } => {
    try {
      const s = JSON.parse(readFileSync(path, 'utf8'));
      if (s.day === today()) return s;
    } catch { /* first run */ }
    return { day: today(), counts: {} };
  };
  return {
    used: (p) => load().counts[p] ?? 0,
    add: (p) => {
      const s = load();
      s.counts[p] = (s.counts[p] ?? 0) + 1;
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(s));
    },
  };
}

/** Keeps AI calls at least minIntervalMs apart (free tier has a requests-per-minute limit). */
let lastAiCall = 0;
async function pace(minIntervalMs: number): Promise<void> {
  const wait = lastAiCall + minIntervalMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastAiCall = Date.now();
}

export interface ChainResult {
  draft: SummaryDraft;
  provider: string;
  ai_generated: boolean;
  model: string | null;
  log: string[];                     // what happened, for the run report (no text, no keys)
}

export async function summarizeWithChain(
  input: SummarizeInput,
  providers: Summarizer[],
  counter: UsageCounter,
  opts: { cap?: number; model?: string; minIntervalMs?: number } = {},
): Promise<ChainResult> {
  assertSummarizable(input.item.license_class);   // throws before any provider sees the text
  const cap = opts.cap ?? aiDailyCap();
  const source = { text: input.text, licenseClass: input.item.license_class, tickers: input.item.tickers.map((t) => t.symbol) };
  const log: string[] = [];

  for (const p of providers) {
    if (!p.usesAi) continue;                        // template runs last, below
    let retryErrors: string[] | undefined;
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (counter.used(p.name) >= cap) {
        log.push(`${p.name}: daily cap ${cap} reached`);
        break;
      }
      await pace(opts.minIntervalMs ?? 0);
      counter.add(p.name);
      let draft: SummaryDraft;
      try {
        draft = await p.summarize({ ...input, retryErrors });
      } catch (e) {
        log.push(`${p.name}: ${(e as Error).name}: ${(e as Error).message}`);
        break;                                       // rate limit or provider error: next provider
      }
      const shape = checkShape(draft);
      const v = shape.length ? { ok: false, errors: shape } : validateDraft(draft, source);
      if (v.ok) {
        log.push(`${p.name}: ok (attempt ${attempt})`);
        return { draft, provider: p.name, ai_generated: true, model: opts.model ?? config.gemini.model, log };
      }
      log.push(`${p.name}: rejected (attempt ${attempt}): ${v.errors.join('; ')}`);
      retryErrors = v.errors;
    }
  }

  const draft = await templateSummarizer.summarize(input);
  log.push('template: used');
  return { draft, provider: 'template', ai_generated: false, model: null, log };
}

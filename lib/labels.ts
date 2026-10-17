// Which trust labels a card must show. Pure: no React imports, so node --test runs it.
//
// The strings come from api.app_config. The constants below are the fallbacks used
// before the config loads or if it comes back empty, so a card is never rendered
// without its disclaimer.

import type { AppConfig, BlurbCard, NoticePlacement, RequiredNotice } from '../contract/types.ts';

export const DISCLAIMER_FALLBACK = 'Informational only · Not investment advice';
export const AI_NOTICE_FALLBACK = 'AI-generated summary · may contain errors';

export const RENDERABLE_KINDS = ['summary', 'data'] as const;
export type RenderableKind = (typeof RENDERABLE_KINDS)[number];

// 'link_out' is reserved and unknown kinds may arrive from a newer back end: skip them.
export function isRenderableKind(kind: unknown): kind is RenderableKind {
  return kind === 'summary' || kind === 'data';
}

export interface CardLabels {
  disclaimer: string; // always non-empty
  aiLabel: string | null; // set only when the card says ai.generated
  sourcesText: string; // "SEC · +2 sources"
}

function nonEmpty(text: string | null | undefined, fallback: string): string {
  return typeof text === 'string' && text.trim() !== '' ? text : fallback;
}

export function disclaimerText(config: Pick<AppConfig, 'disclaimer'> | null | undefined): string {
  return nonEmpty(config?.disclaimer, DISCLAIMER_FALLBACK);
}

export function aiNoticeText(config: Pick<AppConfig, 'ai_notice'> | null | undefined): string {
  return nonEmpty(config?.ai_notice, AI_NOTICE_FALLBACK);
}

export function primarySource(card: Pick<BlurbCard, 'sources'>) {
  return card.sources.find((s) => s.is_primary) ?? card.sources[0] ?? null;
}

export function sourcesText(card: Pick<BlurbCard, 'sources' | 'source_count'>): string {
  const primary = primarySource(card);
  const name = primary ? primary.name : 'Source';
  const extra = Math.max(card.source_count, card.sources.length) - 1;
  return extra > 0 ? `${name} · +${extra} source${extra === 1 ? '' : 's'}` : name;
}

// The AI label is taken from app_config.ai_notice, not from card.ai.label, so the
// wording is the same on every card and cannot drift per row.
export function cardLabels(card: BlurbCard, config: AppConfig | null | undefined): CardLabels {
  return {
    disclaimer: disclaimerText(config),
    aiLabel: card.ai && card.ai.generated === true ? aiNoticeText(config) : null,
    sourcesText: sourcesText(card),
  };
}

export function noticesFor(config: Pick<AppConfig, 'required_notices'> | null | undefined, placement: NoticePlacement): RequiredNotice[] {
  return (config?.required_notices ?? []).filter((n) => n.placements.includes(placement));
}

// The FRED notice goes on any data card whose figures came through FRED.
export function cardNotices(card: BlurbCard, config: AppConfig | null | undefined): RequiredNotice[] {
  if (card.kind !== 'data') return [];
  const viaFred = card.macro.some((m) => /FRED/.test(m.source_name)) || card.sources.some((s) => /FRED/.test(s.name));
  return viaFred ? noticesFor(config, 'data_card') : [];
}

// "How this card was made", shown in the sources sheet. Honest about AI use.
export function howMadeText(card: Pick<BlurbCard, 'kind' | 'ai'>): string {
  if (card.kind === 'data') {
    return 'Built from official figures with a fixed template. No AI was used. The numbers come from the source above.';
  }
  if (card.ai.generated) {
    return 'An AI wrote this summary from the source above, then it was checked automatically against that text. It can still be wrong, so read the source for anything important.';
  }
  return 'Written from the filing’s details with a fixed template. No AI was used. Read the source for the full picture.';
}

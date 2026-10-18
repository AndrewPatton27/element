// Pure rules for the Brief screen (daily and weekly). No React imports, so node --test
// runs it. The screen loads api.dailyBrief() / api.weeklyBrief(); this file decides what
// to show from the result: hidden topics and sources, no card twice, the "Generated"
// line, the date labels, the one-line teaser and the footer wording.

import type { AppConfig, BlurbCard, Brief, Category, MacroFact, NumberTrend } from '../contract/types.ts';
import { categoryName, clampText, relativeTime } from './format.ts';
import { aiNoticeText, disclaimerText } from './labels.ts';

export type BriefMode = 'daily' | 'weekly';

/** A brief as the screen holds it. `movers` is only filled for the weekly brief. */
export interface BriefData extends Brief {
  movers: NumberTrend[];
}

export const BRIEF_MODES: { mode: BriefMode; label: string }[] = [
  { mode: 'daily', label: 'Daily brief' },
  { mode: 'weekly', label: 'Weekly brief' },
];

export interface BriefSectionView {
  category: string;
  title: string;
  cards: BlurbCard[];
}

export interface BriefView {
  headlines: BlurbCard[];
  sections: BriefSectionView[];
  numbers: MacroFact[];
  movers: NumberTrend[];
}

// ---- Normalising what the API returned ----

/** Fills the optional parts so the screen can read every field without checks. */
export function toBriefData(raw: Brief & { movers?: NumberTrend[] }): BriefData {
  return {
    generated_at: raw.generated_at,
    window_hours: raw.window_hours,
    headline_cards: raw.headline_cards ?? [],
    sections: raw.sections ?? [],
    numbers: raw.numbers ?? [],
    movers: Array.isArray(raw.movers) ? raw.movers : [],
  };
}

// The client returns an empty brief stamped with the epoch when the RPC is not live.
function hasRealTimestamp(iso: string): boolean {
  const t = Date.parse(iso);
  return !Number.isNaN(t) && t > Date.UTC(2000, 0, 1);
}

// ---- What is shown ----

/** Section heading: the server's label when it is a real name, else the category name. */
export function sectionTitle(section: { category: string; label: string }, categories: Category[] | null | undefined): string {
  const label = (section.label ?? '').trim();
  if (label !== '' && label.toLowerCase() !== section.category.toLowerCase()) return label;
  return categoryName(section.category, categories);
}

/**
 * Applies the reader's hidden topics / sources (`visible`, the same filter the feed uses),
 * keeps a card out of the sections when it is already a headline, drops empty sections
 * and ignores a card whose kind the app cannot draw (`canShow`).
 */
export function briefView(
  data: BriefData,
  categories: Category[] | null | undefined,
  visible: (cards: BlurbCard[]) => BlurbCard[] = (c) => c,
  canShow: (card: BlurbCard) => boolean = () => true,
): BriefView {
  const seen = new Set<string>();
  const take = (cards: BlurbCard[]): BlurbCard[] =>
    visible(cards.filter(canShow)).filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  const headlines = take(data.headline_cards);
  const sections = data.sections
    .map((s) => ({ category: s.category, title: sectionTitle(s, categories), cards: take(s.cards) }))
    .filter((s) => s.cards.length > 0);
  return { headlines, sections, numbers: data.numbers, movers: data.movers };
}

export function briefIsEmpty(view: BriefView): boolean {
  return view.headlines.length === 0 && view.sections.length === 0 && view.numbers.length === 0 && view.movers.length === 0;
}

/** Every card the brief shows, headlines first. Used for the AI label. */
export function briefCards(view: BriefView): BlurbCard[] {
  return [...view.headlines, ...view.sections.flatMap((s) => s.cards)];
}

// ---- Text ----

/** "last 24 h" / "last 168 h" (the window the server used, which can be wider than asked). */
export function windowText(hours: number): string {
  const h = Number.isFinite(hours) && hours > 0 ? Math.round(hours) : 24;
  return `last ${h} h`;
}

/** Heading of the ranked list. A daily brief that had to look back further says so. */
export function headlineLabel(mode: BriefMode, windowHours: number): string {
  if (mode === 'weekly') return 'Top stories · last week';
  if (!Number.isFinite(windowHours) || windowHours <= 24) return 'Today in a minute';
  const days = Math.round(windowHours / 24);
  return `Top stories · last ${days} days`;
}

/** "Generated 5 h ago · last 24 h", or just the window when the time is unknown. */
export function generatedLine(data: Pick<BriefData, 'generated_at' | 'window_hours'>, now: Date = new Date()): string {
  const window = windowText(data.window_hours);
  if (!hasRealTimestamp(data.generated_at)) return window.charAt(0).toUpperCase() + window.slice(1);
  const ago = relativeTime(data.generated_at, now);
  return ago ? `Generated ${ago} · ${window}` : window.charAt(0).toUpperCase() + window.slice(1);
}

const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface Parts {
  weekday: number;
  month: number;
  day: number;
}

// Local calendar date by default (the reader's day); `utc` makes tests independent of the machine.
function parts(d: Date, utc: boolean): Parts {
  return utc
    ? { weekday: d.getUTCDay(), month: d.getUTCMonth(), day: d.getUTCDate() }
    : { weekday: d.getDay(), month: d.getMonth(), day: d.getDate() };
}

/** "Saturday, October 18" (wide title meta). */
export function dayLabelLong(d: Date, utc = false): string {
  const x = parts(d, utc);
  return `${DAYS_LONG[x.weekday]}, ${MONTHS_LONG[x.month]} ${x.day}`;
}

/** "Sat, Oct 18" (phone list header). */
export function dayLabelShort(d: Date, utc = false): string {
  const x = parts(d, utc);
  return `${DAYS_LONG[x.weekday].slice(0, 3)}, ${MONTHS_LONG[x.month].slice(0, 3)} ${x.day}`;
}

/** "October 12 – 18", or "September 28 – October 4" across a month change. */
export function weekRangeLabel(end: Date, windowHours: number, utc = false): string {
  const days = Math.max(1, Math.round((Number.isFinite(windowHours) ? windowHours : 168) / 24));
  const start = new Date(end.getTime() - (days - 1) * 86_400_000);
  const a = parts(start, utc);
  const b = parts(end, utc);
  if (a.month === b.month) return `${MONTHS_LONG[a.month]} ${a.day} – ${b.day}`;
  return `${MONTHS_LONG[a.month]} ${a.day} – ${MONTHS_LONG[b.month]} ${b.day}`;
}

/** The day the brief is about: its own time when it has one, else now. */
export function briefDate(data: Pick<BriefData, 'generated_at'> | null, now: Date = new Date()): Date {
  return data && hasRealTimestamp(data.generated_at) ? new Date(data.generated_at) : now;
}

/** The date text beside the page title. Falls back to today when the brief has no time. */
export function briefDateLabel(mode: BriefMode, data: Pick<BriefData, 'generated_at' | 'window_hours'> | null, now: Date = new Date(), utc = false): string {
  const at = briefDate(data, now);
  return mode === 'weekly' ? weekRangeLabel(at, data?.window_hours ?? 168, utc) : dayLabelLong(at, utc);
}

/** One short teaser line for a row: the first sentence of the body, capped. '' when none. */
export function teaser(body: string | null | undefined, max = 110): string {
  const text = (body ?? '').replace(/\s+/g, ' ').trim();
  if (text === '') return '';
  const m = /^.*?[.!?](?=\s|$)/.exec(text);
  return clampText(m ? m[0] : text, max);
}

/**
 * The line under the page. The disclaimer is always there; the AI notice joins it only when
 * a card on screen was written by a model (cards from templates carry no AI label).
 */
export function briefFooter(cards: BlurbCard[], config: AppConfig | null | undefined): string {
  const ai = cards.some((c) => c.ai && c.ai.generated === true);
  return [ai ? aiNoticeText(config) : null, disclaimerText(config)].filter(Boolean).join(' · ');
}

/** Screen-reader sentence for a number trend: "10-year Treasury yield 5.10%, ▼ 0.09 this week. Source: U.S. Treasury". */
export function trendA11yLabel(t: Pick<NumberTrend, 'name' | 'value' | 'change' | 'direction' | 'source'>): string {
  const word = t.direction === 'up' ? 'up' : t.direction === 'down' ? 'down' : 'unchanged';
  const change = t.change.replace(/^[^\p{L}\p{N}]+/u, '').trim();
  return `${t.name} ${t.value}, ${word}${change ? `, ${change}` : ''}. Source: ${t.source}`;
}

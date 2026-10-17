// Pure rules for accounts and tailored recommendations. No React imports.

import type { BlurbCard } from '../contract/types.ts';
import { mockRankScore } from './feedLogic.ts';

export type Feedback = 'like' | 'dislike';
export type TrackEvent = 'view' | 'like' | 'dislike' | 'open_source' | 'clear';

export interface UserPrefs {
  followed: string[];
  hidden: string[];
  onboarded: boolean;
}

export const EMPTY_PREFS: UserPrefs = { followed: [], hidden: [], onboarded: false };

// Onboarding ("pick topics") shows once after sign-in until the user saves topics
// (the server's onboarded flag) or skips it on this device.
export function needsOnboarding(signedIn: boolean, prefs: UserPrefs | null, skipped: boolean): boolean {
  return signedIn && prefs !== null && !prefs.onboarded && !skipped;
}

// The For you feed returns cards with my_reaction ('like' | 'dislike' | null).
export function reactionOf(card: object): Feedback | undefined {
  const r = (card as { my_reaction?: unknown }).my_reaction;
  return r === 'like' || r === 'dislike' ? r : undefined;
}

// Event to send when a feedback button is pressed: the reaction, or 'clear' to undo it.
export function feedbackEvent(current: Feedback | undefined, pressed: Feedback): TrackEvent {
  return current === pressed ? 'clear' : pressed;
}

export function toggleTopic(selected: string[], slug: string): string[] {
  return selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug];
}

// Pressing the same button again clears it; pressing the other one switches.
export function nextFeedback(current: Feedback | undefined, pressed: Feedback): Feedback | null {
  return current === pressed ? null : pressed;
}

// Records each card view at most once per session (the server rate-limits too).
export class ViewTracker {
  private seen = new Set<string>();
  shouldTrack(cardId: string): boolean {
    if (this.seen.has(cardId)) return false;
    this.seen.add(cardId);
    return true;
  }
  reset() {
    this.seen.clear();
  }
}

// Mock "For you": cards in followed topics first (ranked), liked topics get a
// boost, disliked cards drop out, everything else follows. Mirrors the idea of
// the server function so sample mode behaves sensibly; the real order comes
// from api.feed_for_you.
export function mockForYouOrder(cards: BlurbCard[], topics: string[], feedback: Record<string, Feedback>, hidden: string[] = []): BlurbCard[] {
  const liked = new Set(cards.filter((c) => feedback[c.id] === 'like').map((c) => c.category as string));
  const kept = cards.filter((c) => feedback[c.id] !== 'dislike' && !hidden.includes(c.category));
  const score = (c: BlurbCard) => {
    let s = mockRankScore(c);
    if (topics.includes(c.category)) s += 24; // a followed topic is worth about a day of freshness
    if (liked.has(c.category)) s += 8;
    return s;
  };
  return kept.slice().sort((a, b) => score(b) - score(a) || (a.id < b.id ? -1 : 1));
}

// For you header: when none of the loaded cards is in a followed topic, the server
// is showing top stories instead, so the header must say so (not "Tailored to X").
export function forYouCoversTopics(cards: Pick<BlurbCard, 'category'>[], followed: string[]): boolean {
  if (followed.length === 0 || cards.length === 0) return true;
  return cards.some((c) => followed.includes(c.category));
}

// First-run tutorial logic (pure apart from the KeyValueStore it is given;
// tested in lib/__tests__/tutorialLogic.test.ts).
//
// - Seen flag: kept on this device under a versioned key, so a later tour
//   (TUTORIAL_VERSION bump) shows once again. Signed in or not, same flag.
// - Step navigation: next / back clamp to the step range.
// - Keyboard (web): ArrowDown / ArrowRight / PageDown = next, ArrowUp /
//   ArrowLeft / PageUp = back, Escape = skip. Enter / Space stay with the
//   focused button (handling them here too would step twice).
// - Auto-show: only on the first visit, and never over the /tutorial route
//   itself or a password-reset link opened from an email.

import type { KeyValueStore } from './storage.ts';

export const TUTORIAL_VERSION = 1;
export const TUTORIAL_SEEN_KEY = `element.tutorial-seen.v${TUTORIAL_VERSION}`;

export function hasSeenTutorial(store: KeyValueStore): boolean {
  try {
    return store.get(TUTORIAL_SEEN_KEY) !== null;
  } catch {
    // Unreadable storage: treat as seen so the tour never traps a reader in a loop.
    return true;
  }
}

export function markTutorialSeen(store: KeyValueStore, now: Date = new Date()): void {
  try {
    store.set(TUTORIAL_SEEN_KEY, now.toISOString());
  } catch {
    // storage blocked: the tour may show again next visit, which is harmless
  }
}

export function clampStep(step: number, count: number): number {
  if (count <= 0 || !Number.isFinite(step)) return 0;
  return Math.min(Math.max(Math.trunc(step), 0), count - 1);
}

export function nextStep(step: number, count: number): number {
  return clampStep(step + 1, count);
}

export function backStep(step: number, count: number): number {
  return clampStep(step - 1, count);
}

export function isLastStep(step: number, count: number): boolean {
  return count > 0 && clampStep(step, count) === count - 1;
}

export type TutorialAction = 'next' | 'back' | 'skip' | 'done' | null;

export function keyToAction(key: string, step: number, count: number): TutorialAction {
  switch (key) {
    case 'ArrowDown':
    case 'ArrowRight':
    case 'PageDown':
      return isLastStep(step, count) ? null : 'next';
    case 'ArrowUp':
    case 'ArrowLeft':
    case 'PageUp':
      return step > 0 ? 'back' : null;
    case 'Escape':
      return 'skip';
    default:
      return null;
  }
}

// Routes the first-run overlay never covers.
const NO_AUTO_SHOW = ['/tutorial', '/reset-password'];

export function shouldAutoShow(seen: boolean, pathname: string | null | undefined): boolean {
  if (seen) return false;
  const path = (pathname ?? '/').split('?')[0];
  return !NO_AUTO_SHOW.some((p) => path === p || path.startsWith(`${p}/`));
}

// "Step 2 of 4" for screen readers; the visual label is "Quick tour · 2 of 4".
export function progressLabel(step: number, count: number): string {
  return `Quick tour · ${clampStep(step, count) + 1} of ${Math.max(count, 1)}`;
}

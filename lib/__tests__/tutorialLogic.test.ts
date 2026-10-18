import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TUTORIAL_SEEN_KEY,
  backStep,
  clampStep,
  hasSeenTutorial,
  isLastStep,
  keyToAction,
  markTutorialSeen,
  nextStep,
  progressLabel,
  shouldAutoShow,
} from '../tutorialLogic.ts';
import { TUTORIAL_AI_LABEL, getTutorialSteps } from '../tutorialSteps.ts';
import { memoryStore, type KeyValueStore } from '../storage.ts';

test('seen flag: unset on first visit, set after markTutorialSeen, versioned key', () => {
  const s = memoryStore();
  assert.equal(hasSeenTutorial(s), false);
  markTutorialSeen(s, new Date('2026-10-18T08:00:00Z'));
  assert.equal(hasSeenTutorial(s), true);
  assert.equal(s.get(TUTORIAL_SEEN_KEY), '2026-10-18T08:00:00.000Z');
  assert.match(TUTORIAL_SEEN_KEY, /^element\.tutorial-seen\.v\d+$/);
});

test('broken storage never traps the reader in the tour', () => {
  const broken: KeyValueStore = {
    get: () => {
      throw new Error('blocked');
    },
    set: () => {
      throw new Error('blocked');
    },
    remove: () => {},
  };
  assert.equal(hasSeenTutorial(broken), true);
  assert.doesNotThrow(() => markTutorialSeen(broken));
});

test('step navigation clamps to the range', () => {
  assert.equal(nextStep(0, 4), 1);
  assert.equal(nextStep(3, 4), 3);
  assert.equal(backStep(0, 4), 0);
  assert.equal(backStep(2, 4), 1);
  assert.equal(clampStep(99, 4), 3);
  assert.equal(clampStep(-1, 4), 0);
  assert.equal(clampStep(Number.NaN, 4), 0);
  assert.equal(clampStep(2, 0), 0);
  assert.equal(isLastStep(3, 4), true);
  assert.equal(isLastStep(2, 4), false);
});

test('keyboard: arrows move, Esc skips, Enter is left to the focused button', () => {
  assert.equal(keyToAction('ArrowDown', 0, 4), 'next');
  assert.equal(keyToAction('ArrowRight', 1, 4), 'next');
  assert.equal(keyToAction('ArrowDown', 3, 4), null);
  assert.equal(keyToAction('ArrowUp', 2, 4), 'back');
  assert.equal(keyToAction('ArrowLeft', 0, 4), null);
  assert.equal(keyToAction('Escape', 2, 4), 'skip');
  assert.equal(keyToAction('Enter', 0, 4), null);
  assert.equal(keyToAction('j', 0, 4), null);
});

test('auto-show only on first visit and never over /tutorial or a reset link', () => {
  assert.equal(shouldAutoShow(false, '/'), true);
  assert.equal(shouldAutoShow(false, '/brief'), true);
  assert.equal(shouldAutoShow(true, '/'), false);
  assert.equal(shouldAutoShow(false, '/tutorial'), false);
  assert.equal(shouldAutoShow(false, '/reset-password'), false);
  assert.equal(shouldAutoShow(false, null), true);
});

test('progress label', () => {
  assert.equal(progressLabel(1, 4), 'Quick tour · 2 of 4');
});

for (const variant of ['mobile', 'web'] as const) {
  test(`${variant}: four steps that describe real behavior`, () => {
    const steps = getTutorialSteps(variant);
    assert.deepEqual(
      steps.map((s) => s.id),
      ['card', 'top', 'brief', 'recap'],
    );
    const all = JSON.stringify(steps);
    // Things the app really does are mentioned.
    for (const word of ['source', 'Brief', 'Following', 'Search', 'For you', 'no account needed', 'AI summary']) {
      assert.ok(all.includes(word), `${variant} mentions ${word}`);
    }
    // Things it does not do are not promised.
    assert.ok(!all.includes('7 AM'), 'no push promise');
    assert.ok(!/pulse/i.test(all), 'cards have no follow pulse button');
    assert.ok(!all.includes('weekly brief'), 'ticker opens sources, not the weekly brief');
    // Advice words never appear.
    assert.ok(!/\b(buy|sell|should)\b/i.test(all));
    // The practice notes do not repeat the disclaimer (shown once, in the footer).
    for (const s of steps) assert.ok(!(s.practiceNote ?? '').includes('Not investment advice'));
  });
}

test('mobile teaches swipes; web teaches thumbs buttons and j/↓ (no ←/→ like keys)', () => {
  const mobile = JSON.stringify(getTutorialSteps('mobile'));
  const web = JSON.stringify(getTutorialSteps('web'));
  assert.ok(mobile.includes('Swipe right') && mobile.includes('Swipe left') && mobile.includes('Swipe up'));
  assert.ok(web.includes('thumbs-up') && web.includes('thumbs-down') && web.includes('Press ↓ or j'));
  assert.ok(!web.includes('Swipe'));
  assert.ok(!web.includes('← to dislike'));
});

test('AI label is the canonical notice', () => {
  assert.equal(TUTORIAL_AI_LABEL, 'AI-generated summary · may contain errors');
});

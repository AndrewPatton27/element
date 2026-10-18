import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confidence, rerankQueue, shouldFetchAhead, targetAhead } from '../queueLogic.ts';
import { EMPTY_LOCAL, withReaction } from '../localPrefs.ts';
import { card } from './helpers.ts';

test('confidence rises with volume and variety; target stays in 3..7', () => {
  assert.equal(confidence({}), 0);
  assert.ok(confidence({ reactions: 4, topics: 2 }) > confidence({ reactions: 1 }));
  for (const value of [-1, 0, 0.5, 1, 2]) assert.ok(targetAhead(value) >= 3 && targetAhead(value) <= 7);
  assert.equal(targetAhead(0), 3);
  assert.equal(targetAhead(1), 7);
});

test('fetch trigger is below target only', () => {
  assert.equal(shouldFetchAhead(2, 3), true);
  assert.equal(shouldFetchAhead(3, 3), false);
});

test('rerank preserves seen prefix, removes duplicates and boosts liked topic in unseen tail', () => {
  const seen = card({ id: 'seen', category: 'tech' });
  const old = card({ id: 'old', category: 'earnings', sort_at: '2020-01-01T00:00:00Z' });
  const likedTopic = card({ id: 'liked', category: 'tech', sort_at: '2026-10-18T00:00:00Z' });
  const prefs = withReaction(EMPTY_LOCAL, seen, 'like');
  const result = rerankQueue([seen, old, likedTopic, old], prefs, 1);
  assert.equal(result[0].id, 'seen');
  assert.equal(result[1].id, 'liked');
  assert.equal(new Set(result.map((c) => c.id)).size, result.length);
  assert.deepEqual(rerankQueue([seen, old, likedTopic], prefs, 1, true).map((c) => c.id), ['seen', 'old', 'liked']);
});

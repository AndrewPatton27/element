import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrollToIndexFallbackOffset } from '../pagerLogic.ts';

const info = (index: number, averageItemLength = 0) => ({ index, highestMeasuredFrameIndex: 0, averageItemLength });

test('uses the known item height: offset = index * height', () => {
  assert.equal(scrollToIndexFallbackOffset(info(5), 800), 4000);
  assert.equal(scrollToIndexFallbackOffset(info(1), 640), 640);
});

test('index 0 (or the first card) scrolls to the top', () => {
  assert.equal(scrollToIndexFallbackOffset(info(0), 800), 0);
});

test('falls back to the measured average when height is unknown', () => {
  assert.equal(scrollToIndexFallbackOffset(info(3, 500), 0), 1500);
});

test('returns 0 when neither height nor average is usable', () => {
  assert.equal(scrollToIndexFallbackOffset(info(3, 0), 0), 0);
});

test('never returns a negative offset and floors fractional indexes', () => {
  assert.equal(scrollToIndexFallbackOffset(info(-2), 800), 0);
  assert.equal(scrollToIndexFallbackOffset(info(2.9), 800), 1600);
  assert.equal(scrollToIndexFallbackOffset(info(Number.NaN), 800), 0);
});

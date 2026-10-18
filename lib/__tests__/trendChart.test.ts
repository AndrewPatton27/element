import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chartShape, stepIndex, BASELINE } from '../../components/trendChart.ts';

test('chartShape: the last point is at the right edge and the area closes on the baseline', () => {
  const s = chartShape([1, 2, 3, 4]);
  assert.ok(s);
  assert.equal(s.cx, 592);
  assert.ok(s.area.startsWith('M8.0 '));
  assert.ok(s.area.endsWith(`${BASELINE} L8 ${BASELINE} Z`));
  assert.equal(s.points.split(' ').length, 4);
});

test('chartShape: highest value is near the top, lowest near the bottom, flat data does not divide by zero', () => {
  const s = chartShape([1, 5]);
  assert.ok(s);
  const [first, last] = s.points.split(' ').map((p) => Number(p.split(',')[1]));
  assert.ok(first > last);
  const flat = chartShape([4, 4, 4]);
  assert.ok(flat && Number.isFinite(flat.cy));
});

test('chartShape: fewer than two usable values draws nothing', () => {
  assert.equal(chartShape([]), null);
  assert.equal(chartShape([3]), null);
  assert.equal(chartShape([3, Number.NaN]), null);
});

test('stepIndex wraps both ways and tolerates an empty list', () => {
  assert.equal(stepIndex(3, 1, 4), 0);
  assert.equal(stepIndex(0, -1, 4), 3);
  assert.equal(stepIndex(1, 1, 4), 2);
  assert.equal(stepIndex(0, 1, 0), 0);
});

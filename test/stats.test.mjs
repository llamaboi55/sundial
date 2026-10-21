import test from 'node:test';
import assert from 'node:assert/strict';
import { prepare, summarize, longestFocus, hourly, daily, blocks, dayRange, weekRange, formatDuration, toCSV, MIN, HOUR } from '../src/js/stats.js';
import { categorize } from '../src/js/categories.js';

const s = (startMin, endMin, app, title = '') => ({ start: startMin * MIN, end: endMin * MIN, app, title });

test('categories with your own choices first', () => {
  assert.equal(categorize('YouTube'), 'entertainment');
  assert.equal(categorize('VS Code'), 'work');
  assert.equal(categorize('Some Game'), 'other');
  assert.equal(categorize('YouTube', { YouTube: 'learning' }), 'learning');
});

test('summary totals, score and top activities', () => {
  const list = prepare([
    s(0, 60, 'code', 'main.rs'),
    s(60, 75, 'chrome', 'Cats - YouTube - Google Chrome'),
    s(75, 90, 'slack', 'general'),
    s(90, 120, 'code', 'lib.rs'),
  ], 0, 1e12);
  const sum = summarize(list);
  assert.equal(sum.total, 120 * MIN);
  assert.equal(sum.focus, 90 * MIN);
  assert.equal(sum.distract, 15 * MIN);
  assert.equal(sum.score, 86);
  assert.equal(sum.byActivity[0].name, 'VS Code');
  assert.equal(sum.byActivity[0].titles.length, 2);
  assert.equal(sum.byCategory[0].id, 'work');
  assert.equal(summarize([]).score, null);
});

test('prepare clips to the range', () => {
  const list = prepare([s(-30, 30, 'code'), s(50, 200, 'code')], 0, 100 * MIN);
  assert.deepEqual(list.map((x) => [x.start / MIN, x.end / MIN]), [[0, 30], [50, 100]]);
});

test('longest focus survives short detours but not long ones', () => {
  const short = prepare([s(0, 30, 'code'), s(30, 31, 'slack'), s(31, 60, 'code')], 0, 1e12);
  assert.equal(longestFocus(short).ms, 59 * MIN);
  const long = prepare([s(0, 30, 'code'), s(30, 45, 'chrome', 'x - YouTube'), s(45, 60, 'code')], 0, 1e12);
  assert.equal(longestFocus(long).ms, 30 * MIN);
});

test('hourly buckets split sessions across hours', () => {
  const list = prepare([s(50, 70, 'code')], 0, 1e12);
  const h = hourly(list, 0);
  assert.equal(h[0].work, 10 * MIN);
  assert.equal(h[1].work, 10 * MIN);
});

test('daily totals', () => {
  const list = prepare([s(0, 60, 'code'), s(1440 + 10, 1440 + 20, 'chrome', 'a - Reddit')], 0, 1e12);
  const d = daily(list, [{ start: 0, end: 1440 * MIN }, { start: 1440 * MIN, end: 2880 * MIN }]);
  assert.equal(d[0].focus, HOUR);
  assert.equal(d[1].distract, 10 * MIN);
});

test('blocks join neighbouring sessions of the same activity', () => {
  const list = prepare([s(0, 10, 'code', 'a'), s(10, 20, 'code', 'b'), s(20, 25, 'slack'), s(25, 30, 'code')], 0, 1e12);
  assert.equal(blocks(list).length, 3);
});

test('day and week ranges are local and line up', () => {
  const { start, end } = dayRange(new Date(2026, 9, 21, 15, 30));
  assert.equal(new Date(start).getHours(), 0);
  assert.equal(new Date(end).getDate(), 22);
  const w = weekRange(new Date(2026, 9, 21));
  assert.equal(new Date(w.start).getDay(), 1);
  assert.equal(w.days.length, 7);
});

test('durations and CSV', () => {
  assert.equal(formatDuration(0), '0m');
  assert.equal(formatDuration(20_000), '<1m');
  assert.equal(formatDuration(95 * MIN), '1h 35m');
  const csv = toCSV(prepare([s(0, 1, 'code', 'say "hi", ok')], 0, 1e12));
  assert.match(csv, /^start,end,minutes,app,activity,category,title\n/);
  assert.match(csv, /"say ""hi"", ok"/);
});

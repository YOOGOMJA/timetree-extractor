import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDateRange, filterEventsByRange, aggregateWarnings } from '../../src/extension/sidepanel-export-policy.js';
import type { NormalizedCalendarEvent } from '../../src/core/normalize.js';

test('parseDateRange: from이 빈 문자열이면 null', () => {
  assert.equal(parseDateRange('', '2026-01-31'), null);
});

test('parseDateRange: to가 빈 문자열이면 null', () => {
  assert.equal(parseDateRange('2026-01-01', ''), null);
});

test('parseDateRange: from > to이면 null', () => {
  assert.equal(parseDateRange('2026-12-31', '2026-01-01'), null);
});

test('parseDateRange: 유효한 입력은 fromMs와 toMs를 반환한다', () => {
  const result = parseDateRange('2026-01-01', '2026-01-31');
  assert.ok(result);
  assert.equal(result.fromMs, new Date('2026-01-01T00:00:00').getTime());
  assert.equal(result.toMs, new Date('2026-01-31T00:00:00').getTime() + 86_400_000 - 1);
});

test('parseDateRange: 같은 날짜는 그날의 day-end까지 범위가 된다', () => {
  const result = parseDateRange('2026-01-15', '2026-01-15');
  assert.ok(result);
  assert.equal(result.toMs - result.fromMs, 86_400_000 - 1);
});

test('parseDateRange: invalid 날짜 문자열은 null', () => {
  assert.equal(parseDateRange('not-a-date', '2026-01-01'), null);
});

function makeEvent(overrides: Partial<NormalizedCalendarEvent> & { startMs?: number; startDate?: string }): NormalizedCalendarEvent {
  const { startMs, startDate, ...rest } = overrides;
  const start: NormalizedCalendarEvent['start'] =
    startMs !== undefined
      ? { kind: 'date-time', epochMs: startMs, timezone: 'UTC' }
      : { kind: 'date', date: startDate ?? '2026-01-15' };
  return {
    uid: 'timetree:1:e1',
    calendarName: 'cal',
    title: 't',
    start,
    end: start,
    source: { provider: 'timetree', eventId: 'e1', calendarId: 1 },
    warnings: [],
    ...rest,
  };
}

test('filterEventsByRange: 빈 events는 빈 배열을 반환한다', () => {
  assert.deepEqual(filterEventsByRange([], { fromMs: 0, toMs: 100 }), []);
});

test('filterEventsByRange: 경계값(fromMs 정각)은 포함된다', () => {
  const ev = makeEvent({ startMs: 1000 });
  assert.equal(filterEventsByRange([ev], { fromMs: 1000, toMs: 2000 }).length, 1);
});

test('filterEventsByRange: 경계값(toMs 정각)은 포함된다', () => {
  const ev = makeEvent({ startMs: 2000 });
  assert.equal(filterEventsByRange([ev], { fromMs: 1000, toMs: 2000 }).length, 1);
});

test('filterEventsByRange: 범위 밖은 제외된다', () => {
  const before = makeEvent({ startMs: 999 });
  const after = makeEvent({ startMs: 2001 });
  assert.deepEqual(filterEventsByRange([before, after], { fromMs: 1000, toMs: 2000 }), []);
});

test('filterEventsByRange: date kind는 그날 자정으로 비교한다', () => {
  const ev = makeEvent({ startDate: '2026-01-15' });
  const fromMs = new Date('2026-01-15T00:00:00').getTime();
  const toMs = new Date('2026-01-15T00:00:00').getTime() + 86_400_000 - 1;
  assert.equal(filterEventsByRange([ev], { fromMs, toMs }).length, 1);
});

test('aggregateWarnings: 빈 events는 빈 객체', () => {
  assert.deepEqual(aggregateWarnings([]), {});
});

test('aggregateWarnings: warning 없는 events는 빈 객체', () => {
  const ev = makeEvent({ warnings: [] });
  assert.deepEqual(aggregateWarnings([ev, ev]), {});
});

test('aggregateWarnings: 같은 warning은 합산된다', () => {
  const a = makeEvent({ warnings: ['timezone-missing'] });
  const b = makeEvent({ warnings: ['timezone-missing'] });
  assert.deepEqual(aggregateWarnings([a, b]), { 'timezone-missing': 2 });
});

test('aggregateWarnings: 여러 종류 warning을 각각 count', () => {
  const a = makeEvent({ warnings: ['timezone-missing', 'title-empty'] });
  const b = makeEvent({ warnings: ['title-empty'] });
  assert.deepEqual(aggregateWarnings([a, b]), {
    'timezone-missing': 1,
    'title-empty': 2,
  });
});

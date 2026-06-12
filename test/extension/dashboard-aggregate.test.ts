import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aggregateByCalendar, aggregateByLabel, groupWarnings, aggregateContentSignals } from '../../src/extension/dashboard-aggregate.js';
import type { NormalizedCalendarEvent } from '../../src/core/normalize.js';

function ev(over: Partial<NormalizedCalendarEvent>): NormalizedCalendarEvent {
  return {
    uid: 'u', calendarName: '개인', title: 'e',
    start: { kind: 'date', date: '2026-06-01' }, end: { kind: 'date', date: '2026-06-02' },
    source: { provider: 'timetree', eventId: 'x', calendarId: 1 }, warnings: [], ...over,
  };
}

test('aggregateByCalendar: 캘린더별 건수, 내림차순', () => {
  const out = aggregateByCalendar([
    ev({ calendarName: '개인' }), ev({ calendarName: '개인' }), ev({ calendarName: '하우스' }),
  ]);
  assert.deepEqual(out, [{ name: '개인', count: 2 }, { name: '하우스', count: 1 }]);
});

test('aggregateByLabel: 라벨별 건수(복수 라벨 각각 집계), 라벨 없는 이벤트 제외', () => {
  const out = aggregateByLabel([
    ev({ labels: ['업무', '약속'] }), ev({ labels: ['업무'] }), ev({}),
  ]);
  assert.deepEqual(out, [{ name: '업무', count: 2 }, { name: '약속', count: 1 }]);
});

test('aggregateByLabel: 라벨이 하나도 없으면 빈 배열', () => {
  assert.deepEqual(aggregateByLabel([ev({}), ev({})]), []);
});

test('groupWarnings: 경고 code별 영향 이벤트 묶음', () => {
  const out = groupWarnings([
    ev({ title: 'A', calendarName: '개인', warnings: ['timezone-not-iana'] }),
    ev({ title: 'B', calendarName: '하우스', warnings: ['timezone-not-iana', 'title-empty'] }),
    ev({ title: 'C', warnings: [] }),
  ]);
  const tz = out.find((g) => g.code === 'timezone-not-iana')!;
  assert.equal(tz.events.length, 2);
  assert.deepEqual(tz.events.map((e) => e.title), ['A', 'B']);
  const te = out.find((g) => g.code === 'title-empty')!;
  assert.deepEqual(te.events, [{ title: 'B', calendarName: '하우스' }]);
});

test('groupWarnings: 경고 없으면 빈 배열', () => {
  assert.deepEqual(groupWarnings([ev({}), ev({})]), []);
});

test('aggregateContentSignals: 참가자/첨부 있는 일정 건수 (#83)', () => {
  const out = aggregateContentSignals([
    ev({ participantCount: 3 }),
    ev({ participantCount: 1, attachmentCount: 2 }),
    ev({ attachmentCount: 1 }),
    ev({}),
  ]);
  assert.deepEqual(out, { participants: 2, attachments: 2 });
});

test('aggregateContentSignals: 없으면 0/0', () => {
  assert.deepEqual(aggregateContentSignals([ev({}), ev({})]), { participants: 0, attachments: 0 });
});

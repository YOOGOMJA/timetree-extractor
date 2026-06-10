import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkRecurringOverrides } from '../../src/core/recurrence-link.js';
import type { NormalizedCalendarEvent } from '../../src/core/normalize.js';

function master(over: Partial<NormalizedCalendarEvent> = {}): NormalizedCalendarEvent {
  return {
    uid: 'timetree:7:evt-master', calendarName: 'cal', title: '주간 회의',
    start: { kind: 'date-time', epochMs: 1767000000000, timezone: 'Asia/Seoul' },
    end: { kind: 'date-time', epochMs: 1767003600000, timezone: 'Asia/Seoul' },
    recurrence: { rrule: ['RRULE:FREQ=WEEKLY;BYDAY=MO'] },
    recurrenceGroupId: 'grp-abc',
    source: { provider: 'timetree', eventId: 'evt-master', calendarId: 7 },
    warnings: [], ...over,
  };
}
function override(over: Partial<NormalizedCalendarEvent> = {}): NormalizedCalendarEvent {
  return {
    uid: 'timetree:7:evt-override', calendarName: 'cal', title: '주간 회의(변경)',
    start: { kind: 'date-time', epochMs: 1767607200000, timezone: 'Asia/Seoul' },
    end: { kind: 'date-time', epochMs: 1767610800000, timezone: 'Asia/Seoul' },
    recurrenceGroupId: 'grp-abc', originalStartAt: 1767604800000,
    source: { provider: 'timetree', eventId: 'evt-override', calendarId: 7 },
    warnings: [], ...over,
  };
}

test('master 존재: override.uid를 master.uid로 통합하고 recurrenceId를 부여한다', () => {
  const [m, o] = linkRecurringOverrides([master(), override()]);
  assert.equal(o.uid, 'timetree:7:evt-master');
  assert.deepEqual(o.recurrenceId, { kind: 'date-time', epochMs: 1767604800000, timezone: 'Asia/Seoul' });
  assert.equal(m.uid, 'timetree:7:evt-master');
  assert.equal(m.recurrenceId, undefined);
});

test('master 부재: 단발 uid 유지 + recurrence-override-orphaned warning', () => {
  const [o] = linkRecurringOverrides([override()]);
  assert.equal(o.uid, 'timetree:7:evt-override');
  assert.equal(o.recurrenceId, undefined);
  assert.ok(o.warnings.includes('recurrence-override-orphaned'));
});

test('all-day master: recurrenceId는 originalStartAt의 UTC date로 구성된다 (master.start.date 복사 아님)', () => {
  // master.start.date('2025-12-29')와 originalStartAt의 UTC date('2026-01-05')를
  // 일부러 다르게 둬서 buildRecurrenceId가 master.start.date를 복사하지 않고
  // toUtcDate(originalStartAt)을 쓰는지 증명한다. new Date(1767604800000) → 2026-01-05.
  const m = master({ start: { kind: 'date', date: '2025-12-29' } });
  const [, o] = linkRecurringOverrides([m, override()]);
  assert.deepEqual(o.recurrenceId, { kind: 'date', date: '2026-01-05' });
});

test('한 master에 복수 override: 각각 distinct recurrenceId, 공통 uid', () => {
  const o2 = override({ uid: 'timetree:7:evt-override2', originalStartAt: 1768209600000,
    source: { provider: 'timetree', eventId: 'evt-override2', calendarId: 7 } });
  const out = linkRecurringOverrides([master(), override(), o2]);
  const overrides = out.filter((e) => e.recurrenceId);
  assert.equal(overrides.length, 2);
  assert.ok(overrides.every((e) => e.uid === 'timetree:7:evt-master'));
  assert.notDeepEqual(overrides[0].recurrenceId, overrides[1].recurrenceId);
});

test('동일 그룹에 master 2개(애매): override는 orphan 처리', () => {
  const m2 = master({ uid: 'timetree:7:evt-master2',
    source: { provider: 'timetree', eventId: 'evt-master2', calendarId: 7 } });
  const out = linkRecurringOverrides([master(), m2, override()]);
  const o = out.find((e) => e.source.eventId === 'evt-override')!;
  assert.equal(o.uid, 'timetree:7:evt-override');
  assert.ok(o.warnings.includes('recurrence-override-orphaned'));
});

test('일반 이벤트(group 없음): 무변경, warning/recurrenceId 없음', () => {
  const plain: NormalizedCalendarEvent = {
    uid: 'timetree:7:evt-plain', calendarName: 'cal', title: '단발',
    start: { kind: 'date-time', epochMs: 1767000000000, timezone: 'Asia/Seoul' },
    end: { kind: 'date-time', epochMs: 1767003600000, timezone: 'Asia/Seoul' },
    source: { provider: 'timetree', eventId: 'evt-plain', calendarId: 7 }, warnings: [],
  };
  const [out] = linkRecurringOverrides([plain]);
  assert.equal(out.uid, 'timetree:7:evt-plain');
  assert.equal(out.recurrenceId, undefined);
  assert.equal(out.warnings.length, 0);
});

test('입력 이벤트를 변형하지 않는다 (pure: 새 객체 반환)', () => {
  const o = override();
  const before = o.warnings;
  linkRecurringOverrides([o]);
  assert.equal(o.warnings, before);
  assert.equal(o.warnings.length, 0);
  assert.equal(o.uid, 'timetree:7:evt-override');
});

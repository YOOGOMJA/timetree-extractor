import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkRecurringOverrides } from '../../src/core/recurrence-link.js';
import { normalizeRawTimeTreeEvent, type NormalizedCalendarEvent } from '../../src/core/normalize.js';
import { createIcsCalendar } from '../../src/core/ics.js';

// 실데이터 모델: master는 RRULE+EXDATE 보유, recurrenceGroupId 없음.
// override는 recurrenceGroupId = master의 source.eventId를 가리키고, recurrence 없음.
function master(over: Partial<NormalizedCalendarEvent> = {}): NormalizedCalendarEvent {
  return {
    uid: 'timetree:7:evt-master', calendarName: 'cal', title: 'test 반복 일정',
    start: { kind: 'date', date: '2026-07-01' },
    end: { kind: 'date', date: '2026-07-02' },
    recurrence: { rrule: ['RRULE:FREQ=WEEKLY'], exdate: ['EXDATE:20260708T000000Z'] },
    source: { provider: 'timetree', eventId: 'evt-master', calendarId: 7 },
    warnings: [], ...over,
  };
}
function override(over: Partial<NormalizedCalendarEvent> = {}): NormalizedCalendarEvent {
  return {
    uid: 'timetree:7:evt-override', calendarName: 'cal', title: 'test 반복 일정 (수정됨)',
    start: { kind: 'date', date: '2026-07-08' },
    end: { kind: 'date', date: '2026-07-09' },
    recurrenceGroupId: 'evt-master',
    source: { provider: 'timetree', eventId: 'evt-override', calendarId: 7 },
    warnings: [], ...over,
  };
}

test('미이동 override: master UID 통합 + RECURRENCE-ID 부여 + master EXDATE 제거 (실데이터형)', () => {
  const out = linkRecurringOverrides([master(), override()]);
  const m = out.find((e) => e.source.eventId === 'evt-master')!;
  const o = out.find((e) => e.source.eventId === 'evt-override')!;
  assert.equal(o.uid, 'timetree:7:evt-master');
  assert.deepEqual(o.recurrenceId, { kind: 'date', date: '2026-07-08' });
  // master의 EXDATE는 override가 claim해 제거됨 (EXDATE+RECURRENCE-ID 충돌 방지)
  assert.deepEqual(m.recurrence, { rrule: ['RRULE:FREQ=WEEKLY'] });
  assert.equal(m.recurrenceId, undefined);
});

test('master 부재: 단발 uid 유지 + recurrence-override-orphaned warning', () => {
  const [o] = linkRecurringOverrides([override()]);
  assert.equal(o.uid, 'timetree:7:evt-override');
  assert.equal(o.recurrenceId, undefined);
  assert.ok(o.warnings.includes('recurrence-override-orphaned'));
});

test('이동 override(start가 어떤 EXDATE와도 불일치): 독립 유지, warning 없음, master EXDATE 보존', () => {
  // override.start=2026-07-15인데 master EXDATE는 07-08뿐 → 매칭 실패(이동으로 간주)
  const moved = override({
    uid: 'timetree:7:evt-moved', start: { kind: 'date', date: '2026-07-15' },
    source: { provider: 'timetree', eventId: 'evt-moved', calendarId: 7 },
  });
  const out = linkRecurringOverrides([master(), moved]);
  const m = out.find((e) => e.source.eventId === 'evt-master')!;
  const o = out.find((e) => e.source.eventId === 'evt-moved')!;
  assert.equal(o.uid, 'timetree:7:evt-moved');
  assert.equal(o.recurrenceId, undefined);
  assert.equal(o.warnings.length, 0);
  assert.deepEqual(m.recurrence?.exdate, ['EXDATE:20260708T000000Z']);
});

test('복수 override/복수 EXDATE: 각자 자기 슬롯 claim, master는 해당 EXDATE만 제거', () => {
  const m = master({ recurrence: { rrule: ['RRULE:FREQ=WEEKLY'], exdate: ['EXDATE:20260708T000000Z', 'EXDATE:20260715T000000Z'] } });
  const o1 = override();
  const o2 = override({
    uid: 'timetree:7:evt-override2', start: { kind: 'date', date: '2026-07-15' },
    source: { provider: 'timetree', eventId: 'evt-override2', calendarId: 7 },
  });
  const out = linkRecurringOverrides([m, o1, o2]);
  const mm = out.find((e) => e.source.eventId === 'evt-master')!;
  const overrides = out.filter((e) => e.recurrenceId);
  assert.equal(overrides.length, 2);
  assert.ok(overrides.every((e) => e.uid === 'timetree:7:evt-master'));
  assert.notDeepEqual(overrides[0].recurrenceId, overrides[1].recurrenceId);
  assert.equal(mm.recurrence?.exdate, undefined); // 둘 다 claim → exdate key 제거(빈 배열 아님)
  assert.deepEqual(mm.recurrence?.rrule, ['RRULE:FREQ=WEEKLY']);
});

test('timed override: master EXDATE datetime과 epoch 일치 시 링크', () => {
  const epoch = Date.UTC(2026, 6, 8, 9, 0, 0); // 2026-07-08 09:00 UTC
  const m = master({
    start: { kind: 'date-time', epochMs: Date.UTC(2026, 6, 1, 9, 0, 0), timezone: 'UTC' },
    recurrence: { rrule: ['RRULE:FREQ=WEEKLY'], exdate: ['EXDATE:20260708T090000Z'] },
  });
  const o = override({ start: { kind: 'date-time', epochMs: epoch, timezone: 'UTC' } });
  const out = linkRecurringOverrides([m, o]);
  const oo = out.find((e) => e.source.eventId === 'evt-override')!;
  assert.equal(oo.uid, 'timetree:7:evt-master');
  assert.deepEqual(oo.recurrenceId, { kind: 'date-time', epochMs: epoch, timezone: 'UTC' });
});

test('일반 이벤트(group 없음): 무변경', () => {
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
  const m = master();
  const o = override();
  const beforeExdate = m.recurrence!.exdate;
  const beforeWarnings = o.warnings;
  linkRecurringOverrides([m, o]);
  assert.equal(m.recurrence!.exdate, beforeExdate); // 원본 master 비변형
  assert.deepEqual(m.recurrence!.exdate, ['EXDATE:20260708T000000Z']);
  assert.equal(o.warnings, beforeWarnings);
  assert.equal(o.uid, 'timetree:7:evt-override');
});

test('end-to-end: raw master+override → ICS의 두 VEVENT가 공통 UID, override만 RECURRENCE-ID, master에 EXDATE 없음', () => {
  const base = { calendarId: 7, category: 'schedule', allDay: true, startTimezone: 'UTC', endTimezone: 'UTC' };
  const masterStart = Date.UTC(2026, 6, 1);
  const overrideStart = Date.UTC(2026, 6, 8);
  const raws = [
    { ...base, id: 'evt-master', title: 'M', startAt: masterStart, endAt: masterStart,
      recurrences: ['RRULE:FREQ=WEEKLY', 'EXDATE:20260708T000000Z'], recurringUuid: null },
    { ...base, id: 'evt-override', title: 'O', startAt: overrideStart, endAt: overrideStart,
      recurrences: [], recurringUuid: 'evt-master' },
  ];
  const normalized = raws
    .map((r) => normalizeRawTimeTreeEvent(r))
    .flatMap((r) => (r.ok ? [r.value] : []));
  const ics = createIcsCalendar(linkRecurringOverrides(normalized));

  const uidLines = ics.split('\r\n').filter((l) => l.startsWith('UID:'));
  assert.deepEqual(uidLines, ['UID:timetree:7:evt-master', 'UID:timetree:7:evt-master']);
  assert.match(ics, /RECURRENCE-ID;VALUE=DATE:20260708/);
  assert.equal((ics.match(/RECURRENCE-ID/g) ?? []).length, 1);
  assert.doesNotMatch(ics, /EXDATE/); // master EXDATE는 override가 대체하므로 제거됨
});

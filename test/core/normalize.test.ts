import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  alertEventFixture,
  allDayEventFixture,
  calendarFixture,
  labelsFixture,
  missingTimezoneTimedEventFixture,
  timedEventFixture,
  unsupportedRecurringEventFixture,
  weeklyRecurringEventFixture,
} from '../fixtures.js';
import { normalizeRawTimeTreeEvent, NORMALIZATION_WARNING_VALUES } from '../../src/core/normalize.js';

test('normalizes a timed event while preserving timezone and source identifiers', () => {
  const result = normalizeRawTimeTreeEvent(timedEventFixture, {
    calendar: calendarFixture,
    labels: labelsFixture,
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.uid, 'timetree:1:event-timed-1');
  assert.deepEqual(result.value.start, {
    kind: 'date-time',
    epochMs: timedEventFixture.startAt,
    timezone: 'Asia/Seoul',
  });
  assert.deepEqual(result.value.end, {
    kind: 'date-time',
    epochMs: timedEventFixture.endAt,
    timezone: 'Asia/Seoul',
  });
  assert.deepEqual(result.value.labels, ['Family']);
});

test('normalizes an all-day event to date-only boundaries', () => {
  const result = normalizeRawTimeTreeEvent(allDayEventFixture, {
    calendar: calendarFixture,
    labels: labelsFixture,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.start, { kind: 'date', date: '2026-05-05' });
  assert.deepEqual(result.value.end, { kind: 'date', date: '2026-05-06' });
});

test('derives all-day boundaries from UTC components so the date is timezone-stable', () => {
  // TimeTree all-day epochs are UTC-midnight; the emitted VALUE=DATE must not
  // shift by a day based on the export machine timezone (off-by-one regression).
  const result = normalizeRawTimeTreeEvent(
    { ...allDayEventFixture, id: 'event-all-day-utc-stable', endAt: Date.UTC(2026, 4, 6, 0, 0, 0) },
    { calendar: calendarFixture, labels: labelsFixture },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.end, { kind: 'date', date: '2026-05-06' });
});

test('does not warn about timezone validity for a valid IANA zone', () => {
  const result = normalizeRawTimeTreeEvent(
    { ...timedEventFixture, startTimezone: 'Asia/Seoul', endTimezone: 'Asia/Seoul' },
    { calendar: calendarFixture, labels: labelsFixture },
  );

  assert.equal(result.ok, true);
  assert.equal(result.value.warnings.includes('timezone-not-iana'), false);
});

test('warns when a present timezone is not a valid IANA zone name', () => {
  const result = normalizeRawTimeTreeEvent(
    { ...timedEventFixture, startTimezone: 'KST', endTimezone: 'KST' },
    { calendar: calendarFixture, labels: labelsFixture },
  );

  assert.equal(result.ok, true);
  assert.equal(result.value.warnings.includes('timezone-not-iana'), true);
  assert.equal(result.value.warnings.includes('timezone-missing'), false);
});

test('warns for offset-style timezone identifiers that Intl accepts but are not IANA', () => {
  for (const tz of ['+09:00', 'GMT+9', 'UTC+09:00']) {
    const result = normalizeRawTimeTreeEvent(
      { ...timedEventFixture, startTimezone: tz, endTimezone: tz },
      { calendar: calendarFixture, labels: labelsFixture },
    );
    assert.equal(result.ok, true);
    assert.equal(result.value.warnings.includes('timezone-not-iana'), true, `${tz} should warn`);
  }
});

test('non-IANA timezone은 UTC로 fallback되고 epochMs는 보존된다 (#28)', () => {
  const result = normalizeRawTimeTreeEvent(
    { ...timedEventFixture, startTimezone: '+09:00', endTimezone: '+09:00' },
    { calendar: calendarFixture, labels: labelsFixture },
  );
  assert.equal(result.ok, true);
  // epochMs는 그대로
  assert.deepEqual(result.value.start, {
    kind: 'date-time',
    epochMs: timedEventFixture.startAt,
    timezone: 'UTC',
  });
  assert.deepEqual(result.value.end, {
    kind: 'date-time',
    epochMs: timedEventFixture.endAt,
    timezone: 'UTC',
  });
  assert.equal(result.value.warnings.includes('timezone-not-iana'), true);
});

test('valid IANA timezone은 그대로 보존된다 (fallback 미적용)', () => {
  const result = normalizeRawTimeTreeEvent(timedEventFixture, {
    calendar: calendarFixture,
    labels: labelsFixture,
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.start.kind === 'date-time' && result.value.start.timezone, 'Asia/Seoul');
  assert.equal(result.value.warnings.includes('timezone-not-iana'), false);
});

test('fails timed normalization when timezone is missing', () => {
  const result = normalizeRawTimeTreeEvent(missingTimezoneTimedEventFixture, {
    calendar: calendarFixture,
    labels: labelsFixture,
  });

  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /startTimezone/);
});

test('preserves supported recurrence rules', () => {
  const result = normalizeRawTimeTreeEvent(weeklyRecurringEventFixture, {
    calendar: calendarFixture,
    labels: labelsFixture,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.recurrence, {
    rrule: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE'],
  });
  assert.equal(result.value.warnings.includes('recurrence-unsupported'), false);
});

test('unsupported recurrence는 event-level fail로 처리된다 (#27)', () => {
  const result = normalizeRawTimeTreeEvent(unsupportedRecurringEventFixture, {
    calendar: calendarFixture,
    labels: labelsFixture,
  });

  assert.equal(result.ok, false);
  assert.equal(result.value, undefined);
  assert.match(result.issues.join('\n'), /unsupported recurrence rule.*FREQ=YEARLY/);
});

test('WEEKLY without BYDAY는 unsupported로 fail한다 (spec subset)', () => {
  const result = normalizeRawTimeTreeEvent(
    { ...timedEventFixture, recurrences: ['RRULE:FREQ=WEEKLY'] },
    { calendar: calendarFixture, labels: labelsFixture },
  );
  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /FREQ=WEEKLY/);
});

test('MONTHLY with BYSETPOS는 unsupported로 fail한다 (비기본 패턴)', () => {
  const result = normalizeRawTimeTreeEvent(
    { ...timedEventFixture, recurrences: ['RRULE:FREQ=MONTHLY;BYDAY=MO;BYSETPOS=-1'] },
    { calendar: calendarFixture, labels: labelsFixture },
  );
  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /BYSETPOS/);
});

test('MONTHLY 기본 패턴은 통과한다', () => {
  const result = normalizeRawTimeTreeEvent(
    { ...timedEventFixture, recurrences: ['RRULE:FREQ=MONTHLY;BYMONTHDAY=15'] },
    { calendar: calendarFixture, labels: labelsFixture },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.recurrence, { rrule: ['RRULE:FREQ=MONTHLY;BYMONTHDAY=15'] });
});

test('EXRULE은 unsupported지만 event는 통과하고 warning만 남는다 (Apple/Outlook 호환)', () => {
  const result = normalizeRawTimeTreeEvent(
    {
      ...timedEventFixture,
      recurrences: ['RRULE:FREQ=WEEKLY;BYDAY=MO', 'EXRULE:FREQ=WEEKLY;BYDAY=FR'],
    },
    { calendar: calendarFixture, labels: labelsFixture },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.recurrence?.exrule, ['EXRULE:FREQ=WEEKLY;BYDAY=FR']);
  assert.equal(result.value.warnings.includes('recurrence-unsupported'), true);
});

test('normalizes an empty title to a placeholder with an explicit warning', () => {
  const result = normalizeRawTimeTreeEvent({ ...timedEventFixture, title: '' }, {
    calendar: calendarFixture,
    labels: labelsFixture,
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.title, '(untitled TimeTree event)');
  assert.equal(result.value.warnings.includes('title-empty'), true);
});

test('warns when participant and attachment data are intentionally omitted', () => {
  const result = normalizeRawTimeTreeEvent({
    ...timedEventFixture,
    attendees: [{ id: 'synthetic-attendee' }],
    files: [{ uuid: 'synthetic-file' }],
  }, {
    calendar: calendarFixture,
    labels: labelsFixture,
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.warnings.includes('participant-omitted'), true);
  assert.equal(result.value.warnings.includes('attachment-omitted'), true);
});

test('valid한 alert(음수 정수 minutesBefore)는 reminder로 변환된다 (#41)', () => {
  const result = normalizeRawTimeTreeEvent(alertEventFixture, {
    calendar: calendarFixture,
    labels: labelsFixture,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.reminders, [{ minutesBefore: -30 }]);
  assert.equal(result.value.warnings.includes('reminder-unsupported'), false);
});

test('인식 불가 shape의 alert는 silent drop되지 않고 reminder-unsupported warning이다 (#41)', () => {
  const result = normalizeRawTimeTreeEvent({
    ...timedEventFixture,
    alerts: [{ offset: -10 }, 5, 'PT10M'],
  }, { calendar: calendarFixture, labels: labelsFixture });
  assert.equal(result.ok, true);
  assert.equal(result.value.reminders, undefined);
  assert.equal(result.value.warnings.includes('reminder-unsupported'), true);
});

test('빈/누락 alerts는 reminder도 warning도 만들지 않는다 (회귀 방지, #41)', () => {
  const empty = normalizeRawTimeTreeEvent(timedEventFixture, {
    calendar: calendarFixture,
    labels: labelsFixture,
  });
  assert.equal(empty.ok, true);
  assert.equal(empty.value.reminders, undefined);
  assert.equal(empty.value.warnings.includes('reminder-unsupported'), false);

  const missing = normalizeRawTimeTreeEvent({ ...timedEventFixture, alerts: undefined }, {
    calendar: calendarFixture,
    labels: labelsFixture,
  });
  assert.equal(missing.ok, true);
  assert.equal(missing.value.reminders, undefined);
  assert.equal(missing.value.warnings.includes('reminder-unsupported'), false);
});

test('음수 정수가 아닌 minutesBefore(0/양수/소수/NaN)는 reminder-unsupported warning이다 (#41)', () => {
  for (const bad of [0, 30, -1.5, Number.NaN]) {
    const result = normalizeRawTimeTreeEvent({
      ...timedEventFixture,
      alerts: [{ minutesBefore: bad }],
    }, { calendar: calendarFixture, labels: labelsFixture });
    assert.equal(result.ok, true, `minutesBefore=${bad} should normalize ok`);
    assert.equal(result.value.reminders, undefined, `minutesBefore=${bad} must not emit reminder`);
    assert.equal(
      result.value.warnings.includes('reminder-unsupported'),
      true,
      `minutesBefore=${bad} must warn reminder-unsupported`,
    );
  }
});

test('valid + invalid alert 혼재 시 valid는 변환하고 invalid는 warning으로 surface한다 (#41)', () => {
  const result = normalizeRawTimeTreeEvent({
    ...timedEventFixture,
    alerts: [{ minutesBefore: -60 }, { minutesBefore: 15 }],
  }, { calendar: calendarFixture, labels: labelsFixture });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.reminders, [{ minutesBefore: -60 }]);
  assert.equal(result.value.warnings.includes('reminder-unsupported'), true);
});

test('같은 minutesBefore 중복 alert는 reminder 1개로 dedup된다 (#41 P1)', () => {
  const result = normalizeRawTimeTreeEvent({
    ...timedEventFixture,
    alerts: [{ minutesBefore: -30 }, { minutesBefore: -30 }, { minutesBefore: -30 }],
  }, { calendar: calendarFixture, labels: labelsFixture });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.reminders, [{ minutesBefore: -30 }]);
  assert.equal(result.value.warnings.includes('reminder-unsupported'), false);
});

test('cap(10) 초과 valid alert는 cap개로 잘리고 reminder-unsupported로 surface된다 (#41 P1)', () => {
  // 11개의 서로 다른(=dedup 후에도 11개) valid 음수 정수 minutesBefore.
  const alerts = Array.from({ length: 11 }, (_, i) => ({ minutesBefore: -(i + 1) }));
  const result = normalizeRawTimeTreeEvent({
    ...timedEventFixture,
    alerts,
  }, { calendar: calendarFixture, labels: labelsFixture });
  assert.equal(result.ok, true);
  assert.equal(result.value.reminders?.length, 10);
  assert.equal(result.value.warnings.includes('reminder-unsupported'), true);
});

test('NORMALIZATION_WARNING_VALUES는 reminder-unsupported를 포함한다', () => {
  assert.ok(
    (NORMALIZATION_WARNING_VALUES as readonly string[]).includes('reminder-unsupported'),
    'reminder-unsupported는 normalize warning enum에 등록되어야 한다 (VALARM 매핑의 정책)',
  );
});

test('valid한 URL은 그대로 보존된다', () => {
  const result = normalizeRawTimeTreeEvent({
    ...timedEventFixture,
    url: 'https://example.test/path?query=1',
  }, { calendar: calendarFixture, labels: labelsFixture });
  assert.equal(result.ok, true);
  assert.equal(result.value.url, 'https://example.test/path?query=1');
  assert.equal(result.value.warnings.includes('url-invalid'), false);
});

test('parse 실패하는 URL은 drop + url-invalid warning이다', () => {
  const result = normalizeRawTimeTreeEvent({
    ...timedEventFixture,
    url: 'not a real url',
  }, { calendar: calendarFixture, labels: labelsFixture });
  assert.equal(result.ok, true);
  assert.equal(result.value.url, undefined);
  assert.equal(result.value.warnings.includes('url-invalid'), true);
});

test('제어문자가 섞인 URL은 drop + url-invalid warning이다 (ICS line 구조 보호)', () => {
  const result = normalizeRawTimeTreeEvent({
    ...timedEventFixture,
    url: 'https://example.test/\nINJECT:value',
  }, { calendar: calendarFixture, labels: labelsFixture });
  assert.equal(result.ok, true);
  assert.equal(result.value.url, undefined);
  assert.equal(result.value.warnings.includes('url-invalid'), true);
});

test('ASCII printable id는 UID에 그대로 들어간다', () => {
  const result = normalizeRawTimeTreeEvent({
    ...timedEventFixture,
    id: 'event-abc-123',
  }, { calendar: calendarFixture, labels: labelsFixture });
  assert.equal(result.ok, true);
  assert.equal(result.value.uid, 'timetree:1:event-abc-123');
});

test('non-ASCII id는 UTF-8 percent-encoding으로 UID에 정규화된다 (재import dedup)', () => {
  const result = normalizeRawTimeTreeEvent({
    ...timedEventFixture,
    id: '회의-2026',
  }, { calendar: calendarFixture, labels: labelsFixture });
  assert.equal(result.ok, true);
  // '회'=E3 9A 8C wait '회'는 UTF-8로 EC 9A 8C, '의'는 EC 9D 98. '-'=0x2D, ASCII 보존.
  assert.equal(result.value.uid, 'timetree:1:%ED%9A%8C%EC%9D%98-2026');
  // 원본 보존 검증
  assert.equal(result.value.source.eventId, '회의-2026');
});

test('UID sanitize는 idempotent하다 (같은 입력 → 같은 출력)', () => {
  const raw = { ...timedEventFixture, id: '🗓️-event' };
  const a = normalizeRawTimeTreeEvent(raw, { calendar: calendarFixture, labels: labelsFixture });
  const b = normalizeRawTimeTreeEvent(raw, { calendar: calendarFixture, labels: labelsFixture });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(a.value.uid, b.value.uid);
  assert.match(a.value.uid, /^timetree:1:[\x20-\x7E]+$/u);
});

test('수정된 반복 instance: recurringUuid/recurStartAt를 neutral 필드로 번역한다', () => {
  const result = normalizeRawTimeTreeEvent({
    id: 'evt-override', calendarId: 7, category: 'schedule', allDay: false,
    title: '회의', startAt: 1767607200000, endAt: 1767610800000,
    startTimezone: 'Asia/Seoul', endTimezone: 'Asia/Seoul',
    recurrences: [], recurringUuid: 'grp-abc',
    recurStartAt: 1767604800000, recurEndAt: 1767608400000,
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.recurrenceGroupId, 'grp-abc');
  assert.equal(result.value.originalStartAt, 1767604800000);
  assert.equal(result.value.recurrenceId, undefined);
});

test('일반 이벤트: 링크 필드는 absent다', () => {
  const result = normalizeRawTimeTreeEvent({
    id: 'evt-plain', calendarId: 7, category: 'schedule', allDay: false,
    title: '회의', startAt: 1767607200000, endAt: 1767610800000,
    startTimezone: 'Asia/Seoul', endTimezone: 'Asia/Seoul', recurrences: [],
  });
  assert.equal(result.ok, true);
  assert.equal('recurrenceGroupId' in result.value, false);
  assert.equal('originalStartAt' in result.value, false);
});

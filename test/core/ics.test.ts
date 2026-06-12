import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeRawTimeTreeEvent } from '../../src/core/normalize.js';
import type { NormalizedCalendarEvent } from '../../src/core/normalize.js';
import { createIcsCalendar } from '../../src/core/ics.js';
import { allDayEventFixture, calendarFixture, labelsFixture, timedEventFixture, weeklyRecurringEventFixture } from '../fixtures.js';

function normalized(rawEvent: unknown) {
  const result = normalizeRawTimeTreeEvent(rawEvent, { calendar: calendarFixture, labels: labelsFixture });
  assert.equal(result.ok, true);
  return result.value;
}

test('writes a timed event with TZID based DTSTART and DTEND', () => {
  const ics = createIcsCalendar([normalized(timedEventFixture)], {
    prodId: '-//timetree-exporter//test//EN',
    now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });

  assert.match(ics, /^BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-\/\/timetree-exporter\/\/test\/\/EN\r\n/u);
  assert.match(ics, /BEGIN:VEVENT\r\n/);
  assert.match(ics, /UID:timetree:1:event-timed-1\r\n/);
  assert.match(ics, /DTSTAMP:20260101T000000Z\r\n/);
  assert.match(ics, /SUMMARY:Synthetic timed event\r\n/);
  assert.match(ics, /DTSTART;TZID=Asia\/Seoul:20260505T100000\r\n/);
  assert.match(ics, /DTEND;TZID=Asia\/Seoul:20260505T110000\r\n/);
  assert.match(ics, /LOCATION:Synthetic location\r\n/);
  // DESCRIPTION now mirrors labels/URL additively (issue #12); CATEGORIES/URL stay too.
  const unfolded = ics.replaceAll('\r\n ', '');
  assert.match(unfolded, /DESCRIPTION:Synthetic note\\n\\n라벨: Family\\n링크: https:\/\/example.test\/event\r\n/);
  assert.match(ics, /CATEGORIES:Family\r\n/);
  assert.match(ics, /URL:https:\/\/example.test\/event\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
});

test('writes an all-day event with VALUE=DATE boundaries', () => {
  const ics = createIcsCalendar([normalized(allDayEventFixture)], {
    now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });

  assert.match(ics, /DTSTART;VALUE=DATE:20260505\r\n/);
  assert.match(ics, /DTEND;VALUE=DATE:20260506\r\n/);
});

test('preserves normalized recurrence lines without duplicating property names', () => {
  const ics = createIcsCalendar([normalized(weeklyRecurringEventFixture)], {
    now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });

  assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=MO,WE\r\n/);
  assert.doesNotMatch(ics, /RRULE:RRULE:/);
});

test('does not duplicate property name for RDATE lines with parameters', () => {
  const event = normalized({
    ...timedEventFixture,
    id: 'event-rdate-with-params',
    recurrences: ['RDATE;TZID="UTC";VALUE=DATE:20260905,20270825'],
    recurringUuid: 'recurring-rdate-1',
  });

  const ics = createIcsCalendar([event], {
    now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });

  assert.doesNotMatch(ics, /RDATE:RDATE/);
  const unfolded = ics.replaceAll('\r\n ', '');
  assert.match(unfolded, /RDATE;TZID="UTC";VALUE=DATE:20260905,20270825\r\n/);
});

test('does not duplicate property name for EXDATE lines with parameters', () => {
  const event = normalized({
    ...timedEventFixture,
    id: 'event-exdate-with-params',
    recurrences: ['RRULE:FREQ=WEEKLY;BYDAY=MO', 'EXDATE;TZID="UTC";VALUE=DATE:20260907'],
    recurringUuid: 'recurring-exdate-1',
  });

  const ics = createIcsCalendar([event], {
    now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });

  assert.doesNotMatch(ics, /EXDATE:EXDATE/);
  const unfolded = ics.replaceAll('\r\n ', '');
  assert.match(unfolded, /EXDATE;TZID="UTC";VALUE=DATE:20260907\r\n/);
});

test('preserves URL property without TEXT escaping', () => {
  const event = normalized({
    ...timedEventFixture,
    url: 'https://example.test/path;key=a,b',
  });

  const ics = createIcsCalendar([event], {
    now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });

  assert.match(ics, /URL:https:\/\/example.test\/path;key=a,b\r\n/);
});

test('folds long unicode lines at UTF-8 octet boundaries without breaking code points', () => {
  const event = normalized({
    ...timedEventFixture,
    note: '한글'.repeat(40),
  });

  const ics = createIcsCalendar([event], {
    now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });

  for (const line of ics.split('\r\n')) {
    assert.ok(new TextEncoder().encode(line).byteLength <= 75, `line exceeds 75 octets without folding: ${line}`);
  }

  const unfolded = ics.replaceAll('\r\n ', '');
  assert.ok(unfolded.includes('한글'.repeat(40)), 'multi-byte content survives folding after unfold');
});

test('escapes ICS text values', () => {
  const event = normalized({
    ...timedEventFixture,
    title: 'Comma, semicolon; slash\\ newline\ntext',
    note: 'Line 1\nLine 2',
  });

  const ics = createIcsCalendar([event], {
    now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });

  assert.match(ics, /SUMMARY:Comma\\, semicolon\\; slash\\\\ newline\\ntext\r\n/);
  const unfolded = ics.replaceAll('\r\n ', '');
  assert.match(unfolded, /DESCRIPTION:Line 1\\nLine 2\\n\\n라벨: Family\\n링크: https:\/\/example.test\/event\r\n/);
});

test('emits a VTIMEZONE block for Asia/Seoul when a timed event uses it', () => {
  const ics = createIcsCalendar([normalized(timedEventFixture)], {
    now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });

  const unfolded = ics.replaceAll('\r\n ', '');
  assert.match(unfolded, /BEGIN:VTIMEZONE\r\nTZID:Asia\/Seoul\r\n/);
  assert.match(unfolded, /BEGIN:STANDARD\r\n[\s\S]*?TZOFFSETFROM:\+0900\r\n/);
  assert.match(unfolded, /BEGIN:STANDARD\r\n[\s\S]*?TZOFFSETTO:\+0900\r\n/);
  assert.match(unfolded, /TZNAME:KST\r\n/);
  assert.match(unfolded, /END:STANDARD\r\nEND:VTIMEZONE\r\n/);
});

test('places every VTIMEZONE block before the first VEVENT', () => {
  const ics = createIcsCalendar([normalized(timedEventFixture)], {
    now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });

  const firstVtimezone = ics.indexOf('BEGIN:VTIMEZONE');
  const firstVevent = ics.indexOf('BEGIN:VEVENT');
  assert.notStrictEqual(firstVtimezone, -1, 'expected a VTIMEZONE block');
  assert.notStrictEqual(firstVevent, -1, 'expected a VEVENT block');
  assert.ok(firstVtimezone < firstVevent, 'VTIMEZONE must precede VEVENT');
});

test('emits only one VTIMEZONE block when many events share a single TZID', () => {
  const ics = createIcsCalendar(
    [
      normalized({ ...timedEventFixture, id: 'event-shared-tz-1' }),
      normalized({ ...timedEventFixture, id: 'event-shared-tz-2' }),
      normalized({ ...timedEventFixture, id: 'event-shared-tz-3' }),
    ],
    { now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)) },
  );

  const matches = ics.match(/BEGIN:VTIMEZONE/g) ?? [];
  assert.equal(matches.length, 1, 'expected exactly one VTIMEZONE for a shared TZID');
});

test('emits no VTIMEZONE block when only all-day events are exported', () => {
  const ics = createIcsCalendar([normalized(allDayEventFixture)], {
    now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });

  assert.doesNotMatch(ics, /BEGIN:VTIMEZONE/);
});

test('UTC zone은 VTIMEZONE 블록을 생성하지 않는다 (RFC special-case, #43)', () => {
  // recurrence에 TZID="UTC"가 등장해도, UTC는 RFC 5545에서 special zone이므로
  // VTIMEZONE 컴포넌트가 필요하지 않다. timed event도 'Z' suffix form으로 emit된다.
  const event = normalized({
    ...allDayEventFixture,
    id: 'event-rdate-utc-only',
    recurrences: ['RDATE;TZID="UTC";VALUE=DATE:20260905,20270825'],
    recurringUuid: 'recurring-utc-rdate-1',
  });

  const ics = createIcsCalendar([event], {
    now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });

  const unfolded = ics.replaceAll('\r\n ', '');
  assert.doesNotMatch(unfolded, /BEGIN:VTIMEZONE\r\nTZID:UTC\r\n/);
});

test('derives America/New_York VTIMEZONE offset from event time (January is EST -0500, July is EDT -0400)', () => {
  const januaryEvent = normalized({
    ...timedEventFixture,
    id: 'event-ny-january-1',
    startTimezone: 'America/New_York',
    endTimezone: 'America/New_York',
    startAt: Date.UTC(2026, 0, 15, 17, 0, 0),
    endAt: Date.UTC(2026, 0, 15, 18, 0, 0),
  });
  const julyEvent = normalized({
    ...timedEventFixture,
    id: 'event-ny-july-1',
    startTimezone: 'America/New_York',
    endTimezone: 'America/New_York',
    startAt: Date.UTC(2026, 6, 15, 17, 0, 0),
    endAt: Date.UTC(2026, 6, 15, 18, 0, 0),
  });

  const januaryIcs = createIcsCalendar([januaryEvent], {
    now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });
  const julyIcs = createIcsCalendar([julyEvent], {
    now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });

  const januaryUnfolded = januaryIcs.replaceAll('\r\n ', '');
  const julyUnfolded = julyIcs.replaceAll('\r\n ', '');

  assert.match(januaryUnfolded, /TZID:America\/New_York\r\n/);
  assert.match(januaryUnfolded, /TZOFFSETFROM:-0500\r\n/);
  assert.match(januaryUnfolded, /TZOFFSETTO:-0500\r\n/);

  assert.match(julyUnfolded, /TZID:America\/New_York\r\n/);
  assert.match(julyUnfolded, /TZOFFSETFROM:-0400\r\n/);
  assert.match(julyUnfolded, /TZOFFSETTO:-0400\r\n/);
});

test('UTC와 함께 있는 다른 TZID는 자기 VTIMEZONE만 emit, UTC event는 Z form (#43)', () => {
  const seoulEvent = normalized(timedEventFixture);
  const utcEvent = normalized({
    ...timedEventFixture,
    id: 'event-mixed-utc-1',
    startTimezone: 'UTC',
    endTimezone: 'UTC',
  });

  const ics = createIcsCalendar([seoulEvent, utcEvent], {
    now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });

  const matches = ics.match(/BEGIN:VTIMEZONE/g) ?? [];
  assert.equal(matches.length, 1, 'UTC zone 제외, Asia/Seoul 한 블록만');
  const unfolded = ics.replaceAll('\r\n ', '');
  assert.match(unfolded, /TZID:Asia\/Seoul\r\n/);
  assert.doesNotMatch(unfolded, /TZID:UTC\r\n/);
  // UTC event의 DTSTART는 Z suffix form
  assert.match(unfolded, /DTSTART:\d{8}T\d{6}Z\r\n/);
});

test('UTC timezone event는 RFC 5545 canonical Z form으로 emit한다 (#43)', () => {
  const utcEvent = normalized({
    ...timedEventFixture,
    id: 'event-utc-z-form',
    startTimezone: 'UTC',
    endTimezone: 'UTC',
  });
  const ics = createIcsCalendar([utcEvent], { now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)) });
  const unfolded = ics.replaceAll('\r\n ', '');
  // TZID 파라미터 없이 Z suffix 형식
  assert.match(unfolded, /DTSTART:\d{8}T\d{6}Z\r\n/);
  assert.match(unfolded, /DTEND:\d{8}T\d{6}Z\r\n/);
  assert.doesNotMatch(unfolded, /DTSTART;TZID=UTC/);
});

test('Etc/UTC alias도 UTC와 동일하게 Z form으로 emit한다 (#43)', () => {
  const event = normalized({
    ...timedEventFixture,
    id: 'event-etc-utc-z',
    startTimezone: 'Etc/UTC',
    endTimezone: 'Etc/UTC',
  });
  const ics = createIcsCalendar([event], { now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)) });
  const unfolded = ics.replaceAll('\r\n ', '');
  assert.match(unfolded, /DTSTART:\d{8}T\d{6}Z\r\n/);
  assert.doesNotMatch(unfolded, /BEGIN:VTIMEZONE/);
});

test('mirrors labels and URL into DESCRIPTION while keeping CATEGORIES and URL lines (issue #12)', () => {
  const event = normalized({
    ...timedEventFixture,
    id: 'event-description-mirror-1',
    note: '기본 설명',
  });

  const ics = createIcsCalendar([event], {
    now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });

  const unfolded = ics.replaceAll('\r\n ', '');
  assert.match(unfolded, /DESCRIPTION:기본 설명\\n\\n라벨: Family\\n링크: https:\/\/example.test\/event\r\n/);
  // Additive policy: standards-compliant CATEGORIES/URL properties stay too.
  assert.match(ics, /CATEGORIES:Family\r\n/);
  assert.match(ics, /URL:https:\/\/example.test\/event\r\n/);
});

test('참가자·첨부 수를 DESCRIPTION 메모로 미러링한다 (#81)', () => {
  const event = normalized({
    ...timedEventFixture,
    id: 'event-counts-mirror-1',
    note: '기본 설명',
    participantCount: 3,
    attachmentCount: 2,
  });

  const ics = createIcsCalendar([event], { now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)) });
  const unfolded = ics.replaceAll('\r\n ', '');
  assert.match(unfolded, /참가자 3명/);
  assert.match(unfolded, /첨부 파일 2개\(미포함\)/);
});

test('composes DESCRIPTION from labels and URL even when there is no base description', () => {
  const event = normalized({
    ...timedEventFixture,
    id: 'event-description-mirror-no-base',
    note: '',
  });

  const ics = createIcsCalendar([event], {
    now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });

  const unfolded = ics.replaceAll('\r\n ', '');
  assert.match(unfolded, /DESCRIPTION:라벨: Family\\n링크: https:\/\/example.test\/event\r\n/);
});

test('emits no DESCRIPTION when there is no base description, labels, or URL', () => {
  const event = normalized({
    ...timedEventFixture,
    id: 'event-description-empty',
    note: '',
    url: undefined,
    labelId: null,
  });

  const ics = createIcsCalendar([event], {
    now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });

  assert.doesNotMatch(ics, /DESCRIPTION:/);
});

test('emits EXRULE alongside RRULE, RDATE, and EXDATE (preserved for Apple/Outlook)', () => {
  const event = normalized({
    ...timedEventFixture,
    id: 'event-exrule-kept',
    recurrences: [
      'RRULE:FREQ=WEEKLY;BYDAY=MO',
      'RDATE;TZID="UTC";VALUE=DATE:20260905',
      'EXRULE:FREQ=WEEKLY;BYDAY=TU',
      'EXDATE;TZID="UTC";VALUE=DATE:20260907',
    ],
    recurringUuid: 'recurring-exrule-1',
  });

  const ics = createIcsCalendar([event], {
    now: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)),
  });

  const unfolded = ics.replaceAll('\r\n ', '');
  assert.match(unfolded, /RRULE:FREQ=WEEKLY;BYDAY=MO\r\n/);
  assert.match(unfolded, /RDATE;TZID="UTC";VALUE=DATE:20260905\r\n/);
  assert.match(unfolded, /EXRULE:FREQ=WEEKLY;BYDAY=TU\r\n/);
  assert.match(unfolded, /EXDATE;TZID="UTC";VALUE=DATE:20260907\r\n/);
});

function makeReminderEvent(overrides: Partial<NormalizedCalendarEvent> = {}): NormalizedCalendarEvent {
  return {
    uid: 'timetree:1:e1',
    calendarName: 'cal',
    title: '회의',
    start: { kind: 'date-time', epochMs: Date.UTC(2026, 5, 1, 10, 0, 0), timezone: 'UTC' },
    end: { kind: 'date-time', epochMs: Date.UTC(2026, 5, 1, 11, 0, 0), timezone: 'UTC' },
    source: { provider: 'timetree', eventId: 'e1', calendarId: 1 },
    warnings: [],
    ...overrides,
  };
}

test('VALARM: 단일 30분 전 reminder는 PT30M trigger로 출력된다', () => {
  const ics = createIcsCalendar([makeReminderEvent({ reminders: [{ minutesBefore: -30 }] })]);
  assert.match(ics, /BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:회의\r\nTRIGGER:-PT30M\r\nEND:VALARM/);
});

test('VALARM: 시간 단위로 떨어지면 PTNH로 변환된다', () => {
  const ics = createIcsCalendar([makeReminderEvent({ reminders: [{ minutesBefore: -60 }] })]);
  assert.match(ics, /TRIGGER:-PT1H/);
  const ics2 = createIcsCalendar([makeReminderEvent({ reminders: [{ minutesBefore: -120 }] })]);
  assert.match(ics2, /TRIGGER:-PT2H/);
});

test('VALARM: 일 단위로 떨어지면 PND로 변환된다', () => {
  const ics = createIcsCalendar([makeReminderEvent({ reminders: [{ minutesBefore: -1440 }] })]);
  assert.match(ics, /TRIGGER:-P1D/);
  const ics2 = createIcsCalendar([makeReminderEvent({ reminders: [{ minutesBefore: -2880 }] })]);
  assert.match(ics2, /TRIGGER:-P2D/);
});

test('VALARM: 시간/일 단위로 떨어지지 않으면 분 단위 유지', () => {
  const ics = createIcsCalendar([makeReminderEvent({ reminders: [{ minutesBefore: -90 }] })]);
  assert.match(ics, /TRIGGER:-PT90M/);
});

test('VALARM: 다중 reminder는 VALARM block 여러 개 순서대로 출력', () => {
  const ics = createIcsCalendar([
    makeReminderEvent({ reminders: [{ minutesBefore: -30 }, { minutesBefore: -1440 }] }),
  ]);
  const valarmBlocks = ics.split('BEGIN:VALARM').length - 1;
  assert.equal(valarmBlocks, 2);
  const firstIdx = ics.indexOf('TRIGGER:-PT30M');
  const secondIdx = ics.indexOf('TRIGGER:-P1D');
  assert.ok(firstIdx >= 0 && secondIdx >= 0 && firstIdx < secondIdx, '순서 보존');
});

test('VALARM: reminders가 undefined면 VALARM 미출력', () => {
  const ics = createIcsCalendar([makeReminderEvent({})]);
  assert.ok(!ics.includes('BEGIN:VALARM'));
});

test('VALARM: reminders가 빈 배열이면 VALARM 미출력', () => {
  const ics = createIcsCalendar([makeReminderEvent({ reminders: [] })]);
  assert.ok(!ics.includes('BEGIN:VALARM'));
});

test('VALARM: block은 END:VEVENT 바로 앞에 위치한다', () => {
  const ics = createIcsCalendar([makeReminderEvent({ reminders: [{ minutesBefore: -30 }] })]);
  assert.match(ics, /END:VALARM\r\nEND:VEVENT/);
});

test('VALARM: DESCRIPTION에 escapeText 적용 (특수문자 title)', () => {
  const ics = createIcsCalendar([
    makeReminderEvent({ title: 'a; b, c\\d', reminders: [{ minutesBefore: -30 }] }),
  ]);
  assert.match(ics, /DESCRIPTION:a\\; b\\, c\\\\d\r\nTRIGGER:-PT30M/);
});

test('VALARM: 음수 정수가 아닌 값은 skip, 유효한 다른 reminder는 출력', () => {
  const ics = createIcsCalendar([
    makeReminderEvent({
      reminders: [
        { minutesBefore: 0 },          // skip (0)
        { minutesBefore: 30 },         // skip (양수)
        { minutesBefore: NaN },        // skip (NaN)
        { minutesBefore: -10.5 },      // skip (정수 아님)
        { minutesBefore: -45 },        // emit
      ],
    }),
  ]);
  const valarmBlocks = ics.split('BEGIN:VALARM').length - 1;
  assert.equal(valarmBlocks, 1);
  assert.match(ics, /TRIGGER:-PT45M/);
});

test('recurrenceId가 있으면 RECURRENCE-ID 라인을 emit한다 (zoned)', () => {
  const ev: NormalizedCalendarEvent = {
    uid: 'timetree:7:evt-master', calendarName: 'cal', title: '회의',
    start: { kind: 'date-time', epochMs: 1767607200000, timezone: 'Asia/Seoul' },
    end: { kind: 'date-time', epochMs: 1767610800000, timezone: 'Asia/Seoul' },
    recurrenceId: { kind: 'date-time', epochMs: 1767604800000, timezone: 'Asia/Seoul' },
    source: { provider: 'timetree', eventId: 'evt-master', calendarId: 7 }, warnings: [],
  };
  const ics = createIcsCalendar([ev]);
  assert.match(ics, /RECURRENCE-ID;TZID=Asia\/Seoul:\d{8}T\d{6}/);
});

test('all-day recurrenceId는 VALUE=DATE로 emit한다', () => {
  const ev: NormalizedCalendarEvent = {
    uid: 'timetree:7:evt-master', calendarName: 'cal', title: '회의',
    start: { kind: 'date', date: '2026-01-12' }, end: { kind: 'date', date: '2026-01-13' },
    recurrenceId: { kind: 'date', date: '2026-01-05' },
    source: { provider: 'timetree', eventId: 'evt-master', calendarId: 7 }, warnings: [],
  };
  const ics = createIcsCalendar([ev]);
  assert.match(ics, /RECURRENCE-ID;VALUE=DATE:20260105/);
});

test('recurrenceId가 없으면 RECURRENCE-ID 라인이 없다', () => {
  const ev: NormalizedCalendarEvent = {
    uid: 'timetree:7:evt-plain', calendarName: 'cal', title: '단발',
    start: { kind: 'date-time', epochMs: 1767607200000, timezone: 'Asia/Seoul' },
    end: { kind: 'date-time', epochMs: 1767610800000, timezone: 'Asia/Seoul' },
    source: { provider: 'timetree', eventId: 'evt-plain', calendarId: 7 }, warnings: [],
  };
  const ics = createIcsCalendar([ev]);
  assert.doesNotMatch(ics, /RECURRENCE-ID/);
});

test('all-day RRULE UNTIL은 DATE 형식으로 정규화된다 (#63)', () => {
  const ev = {
    uid: 'timetree:7:m', calendarName: 'cal', title: 'M',
    start: { kind: 'date', date: '2026-07-01' }, end: { kind: 'date', date: '2026-07-02' },
    recurrence: { rrule: ['RRULE:FREQ=WEEKLY;UNTIL=20260729T000000Z'] },
    source: { provider: 'timetree', eventId: 'm', calendarId: 7 }, warnings: [],
  } as const;
  const ics = createIcsCalendar([ev as unknown as NormalizedCalendarEvent]);
  assert.match(ics, /RRULE:FREQ=WEEKLY;UNTIL=20260729(?![0-9TZ])/);
  assert.doesNotMatch(ics, /UNTIL=20260729T/);
});

test('UTC date-time RRULE UNTIL(Z 없음)은 Z가 보충된다 (#63)', () => {
  const ev = {
    uid: 'timetree:7:m', calendarName: 'cal', title: 'M',
    start: { kind: 'date-time', epochMs: 1782000000000, timezone: 'UTC' },
    end: { kind: 'date-time', epochMs: 1782003600000, timezone: 'UTC' },
    recurrence: { rrule: ['RRULE:FREQ=WEEKLY;UNTIL=20260729T100000'] },
    source: { provider: 'timetree', eventId: 'm', calendarId: 7 }, warnings: [],
  } as const;
  const ics = createIcsCalendar([ev as unknown as NormalizedCalendarEvent]);
  assert.match(ics, /UNTIL=20260729T100000Z/);
});

test('UTC RRULE UNTIL이 이미 Z면 그대로 (#63)', () => {
  const ev = {
    uid: 'timetree:7:m', calendarName: 'cal', title: 'M',
    start: { kind: 'date-time', epochMs: 1782000000000, timezone: 'UTC' },
    end: { kind: 'date-time', epochMs: 1782003600000, timezone: 'UTC' },
    recurrence: { rrule: ['RRULE:FREQ=WEEKLY;UNTIL=20260729T100000Z'] },
    source: { provider: 'timetree', eventId: 'm', calendarId: 7 }, warnings: [],
  } as const;
  const ics = createIcsCalendar([ev as unknown as NormalizedCalendarEvent]);
  assert.match(ics, /UNTIL=20260729T100000Z(?!Z)/);
});

test('non-UTC zoned floating UNTIL은 보수적으로 미변경 (#63 잔여)', () => {
  const ev = {
    uid: 'timetree:7:m', calendarName: 'cal', title: 'M',
    start: { kind: 'date-time', epochMs: 1782000000000, timezone: 'Asia/Seoul' },
    end: { kind: 'date-time', epochMs: 1782003600000, timezone: 'Asia/Seoul' },
    recurrence: { rrule: ['RRULE:FREQ=WEEKLY;UNTIL=20260729T100000'] },
    source: { provider: 'timetree', eventId: 'm', calendarId: 7 }, warnings: [],
  } as const;
  const ics = createIcsCalendar([ev as unknown as NormalizedCalendarEvent]);
  assert.match(ics, /UNTIL=20260729T100000(?!Z)/);
});

test('UNTIL 없는 RRULE은 무변경 (#63 무회귀)', () => {
  const ev = {
    uid: 'timetree:7:m', calendarName: 'cal', title: 'M',
    start: { kind: 'date', date: '2026-07-01' }, end: { kind: 'date', date: '2026-07-02' },
    recurrence: { rrule: ['RRULE:FREQ=WEEKLY'] },
    source: { provider: 'timetree', eventId: 'm', calendarId: 7 }, warnings: [],
  } as const;
  const ics = createIcsCalendar([ev as unknown as NormalizedCalendarEvent]);
  assert.match(ics, /RRULE:FREQ=WEEKLY(?![;0-9])/);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
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

test('marks unsupported recurrence without silently dropping the source rule', () => {
  const result = normalizeRawTimeTreeEvent(unsupportedRecurringEventFixture, {
    calendar: calendarFixture,
    labels: labelsFixture,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.recurrence, {
    rrule: ['RRULE:FREQ=YEARLY;BYMONTH=5;BYMONTHDAY=5'],
  });
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

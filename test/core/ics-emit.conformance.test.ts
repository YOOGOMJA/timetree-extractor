import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import test from 'node:test';

import { createIcsCalendar } from '../../src/core/ics.js';
import { normalizeRawTimeTreeEvent } from '../../src/core/normalize.js';
import {
  allDayEventFixture,
  calendarFixture,
  labelsFixture,
  longKoreanSummaryEventFixture,
  newYorkTimedEventFixture,
  timedEventFixture,
  weeklyRecurringEventFixture,
} from '../fixtures.js';

// 본 conformance test는 ICS writer가 생성하는 문자열이 RFC 5545와 Google
// Calendar file import의 cross-cutting 요구를 만족하는지 검증한다. 각 invariant는
// 독립된 test로 작성해 하나의 실패가 다른 결과를 가리지 않는다.
//
// 정책 출처: docs/specs/ics-emit-cross-cutting-checks.md

function normalized(rawEvent: unknown) {
  const result = normalizeRawTimeTreeEvent(rawEvent, { calendar: calendarFixture, labels: labelsFixture });
  assert.equal(result.ok, true, `normalize failed: ${JSON.stringify(result)}`);
  return (result as { ok: true; value: unknown }).value as Parameters<typeof createIcsCalendar>[0][number];
}

const CONFORMANCE_NOW = new Date(Date.UTC(2026, 4, 27, 0, 0, 0));

function buildKitchenSinkIcs(): string {
  return createIcsCalendar(
    [
      normalized(timedEventFixture),
      normalized(allDayEventFixture),
      normalized(newYorkTimedEventFixture),
      normalized(weeklyRecurringEventFixture),
      normalized(longKoreanSummaryEventFixture),
    ],
    { prodId: '-//timetree-exporter//conformance//EN', now: CONFORMANCE_NOW },
  );
}

test('conformance: 모든 line이 CRLF로 끝나고 lone LF가 없다', () => {
  const ics = buildKitchenSinkIcs();
  for (let i = 0; i < ics.length; i++) {
    if (ics[i] === '\n') {
      assert.equal(ics[i - 1], '\r', `lone LF at offset ${i} (context: ${JSON.stringify(ics.slice(Math.max(0, i - 30), i + 5))})`);
    }
  }
});

test('conformance: output에 UTF-8 BOM(0xEF 0xBB 0xBF) prefix가 없다', () => {
  const ics = buildKitchenSinkIcs();
  const bytes = new TextEncoder().encode(ics);
  assert.ok(
    !(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf),
    'output starts with UTF-8 BOM — Google import에서 BEGIN:VCALENDAR 인식 실패 가능',
  );
});

test('conformance: 모든 content line이 75 octet 이하이다 (folding continuation도 동일 기준)', () => {
  const ics = buildKitchenSinkIcs();
  const encoder = new TextEncoder();
  // RFC 5545 §3.1: line은 CRLF + WSP로 unfold. trailing empty line(파일 끝) 제외.
  const lines = ics.split('\r\n');
  for (const [i, line] of lines.entries()) {
    if (line === '') continue; // 마지막 CRLF 뒤 빈 segment
    const byteLen = encoder.encode(line).byteLength;
    assert.ok(
      byteLen <= 75,
      `line ${i} is ${byteLen} octets (limit 75): ${JSON.stringify(line.slice(0, 60))}...`,
    );
  }
});

test('conformance: folded line을 unfold한 뒤 strict UTF-8 decode가 통과한다 (멀티바이트 경계 무결성)', () => {
  const ics = buildKitchenSinkIcs();
  const unfolded = ics.replaceAll('\r\n ', '');
  const bytes = new TextEncoder().encode(unfolded);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  assert.doesNotThrow(() => decoder.decode(bytes), 'unfolded ICS가 valid UTF-8이 아님 — folding이 multi-byte 경계를 자름');
});

test('conformance: BEGIN:VCALENDAR과 END:VCALENDAR가 각각 정확히 1회 등장', () => {
  const ics = buildKitchenSinkIcs();
  const begin = ics.match(/(^|\r\n)BEGIN:VCALENDAR\r\n/g) ?? [];
  const end = ics.match(/(^|\r\n)END:VCALENDAR(\r\n|$)/g) ?? [];
  assert.equal(begin.length, 1, `BEGIN:VCALENDAR count = ${begin.length}`);
  assert.equal(end.length, 1, `END:VCALENDAR count = ${end.length}`);
});

test('conformance: VEVENT 개수는 input event 개수와 일치한다', () => {
  const inputs = [
    normalized(timedEventFixture),
    normalized(allDayEventFixture),
    normalized(newYorkTimedEventFixture),
    normalized(weeklyRecurringEventFixture),
    normalized(longKoreanSummaryEventFixture),
  ];
  const ics = createIcsCalendar(inputs, { now: CONFORMANCE_NOW });
  const veventCount = (ics.match(/(^|\r\n)BEGIN:VEVENT\r\n/g) ?? []).length;
  assert.equal(veventCount, inputs.length, `VEVENT count = ${veventCount}, expected ${inputs.length}`);
});

test('conformance: all-day event의 DTEND는 DTSTART + 1일(exclusive)이다', () => {
  const ics = createIcsCalendar([normalized(allDayEventFixture)], { now: CONFORMANCE_NOW });
  // allDayEventFixture: 2026-05-05 → DTEND 2026-05-06 (exclusive)
  const start = /DTSTART;VALUE=DATE:(\d{8})\r\n/.exec(ics);
  const end = /DTEND;VALUE=DATE:(\d{8})\r\n/.exec(ics);
  assert.ok(start, 'DTSTART;VALUE=DATE not found');
  assert.ok(end, 'DTEND;VALUE=DATE not found');
  const startDate = parseIcsDate(start![1]);
  const endDate = parseIcsDate(end![1]);
  const deltaMs = endDate.getTime() - startDate.getTime();
  assert.equal(deltaMs, 24 * 60 * 60 * 1000, `DTEND - DTSTART = ${deltaMs}ms, expected 1 day exclusive`);
});

function parseIcsDate(yyyymmdd: string): Date {
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6)) - 1;
  const d = Number(yyyymmdd.slice(6, 8));
  return new Date(Date.UTC(y, m, d));
}

test('conformance: RRULE line에 COUNT와 UNTIL이 동시에 등장하지 않는다', () => {
  const ics = buildKitchenSinkIcs();
  const rrules = ics.match(/(^|\r\n)RRULE:[^\r\n]+/g) ?? [];
  for (const raw of rrules) {
    const line = raw.replace(/^\r\n/, '');
    const hasCount = /(^|;)COUNT=/.test(line);
    const hasUntil = /(^|;)UNTIL=/.test(line);
    assert.ok(!(hasCount && hasUntil), `RRULE에 COUNT와 UNTIL이 동시 등장 (RFC 5545 §3.3.10 위반): ${line}`);
  }
});

test('conformance: 모든 UID 값은 ASCII printable subset이다 (재import dedup 보장)', () => {
  const ics = buildKitchenSinkIcs();
  const uids = (ics.match(/(^|\r\n)UID:[^\r\n]+/g) ?? []).map((line) => line.replace(/^\r\n/, '').slice(4));
  assert.ok(uids.length > 0, 'expected at least one UID');
  for (const uid of uids) {
    assert.match(uid, /^[\x20-\x7E]+$/u, `non-ASCII UID detected: ${JSON.stringify(uid)}`);
  }
});

test('conformance: 출력 byte size <= 900_000 (1MB Google import cliff에 대한 safety margin)', () => {
  const ics = buildKitchenSinkIcs();
  const byteLen = Buffer.byteLength(ics, 'utf8');
  assert.ok(byteLen <= 900_000, `output ${byteLen} bytes > 900_000 safety margin`);
});

test('conformance: 사용된 모든 TZID에 대해 VTIMEZONE 블록이 정확히 1개 존재한다', () => {
  const ics = buildKitchenSinkIcs();

  const usedTzids = new Set<string>();
  for (const m of ics.matchAll(/;TZID=("[^"]+"|[^;:\r\n]+)/g)) {
    usedTzids.add(m[1].replace(/^"|"$/g, ''));
  }

  const declaredTzids: string[] = [];
  for (const m of ics.matchAll(/BEGIN:VTIMEZONE\r\nTZID:([^\r\n]+)/g)) {
    declaredTzids.push(m[1]);
  }
  const declaredSet = new Set(declaredTzids);

  for (const tzid of usedTzids) {
    assert.ok(declaredSet.has(tzid), `TZID ${tzid} used but not declared in VTIMEZONE`);
  }
  assert.equal(
    declaredTzids.length,
    declaredSet.size,
    `중복 VTIMEZONE blocks: ${JSON.stringify(declaredTzids)}`,
  );
});

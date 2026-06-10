#!/usr/bin/env node
// #59 RECURRENCE-ID override 실데이터 smoke 검증 스크립트.
//
// 캡처한 TimeTree API 응답(raw apiEvent JSON)을 *프로덕션과 동일한 경로*
// (mapApiEventToRawTimeTreeEvent → normalizeRawTimeTreeEvent → linkRecurringOverrides
//  → createIcsCalendar)로 통과시켜, 수정된 반복 instance가 master와 공통 UID + RECURRENCE-ID로
// 묶이는지 기계적으로 판정한다.
//
// 사용법:
//   npm run build
//   node scripts/verify-recurrence-smoke.mjs <captured.json>
//
// <captured.json> 형식: 다음 중 아무거나 허용
//   - apiEvent 배열                         (예: [ { "id": "...", "recurring_uuid": "..." }, ... ])
//   - { "events": [ ...apiEvent ] }         (API 응답 전체를 그대로 붙여넣은 경우)
//
// dist/ 모듈을 import하므로 반드시 `npm run build`를 먼저 실행한다.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const distBase = resolve(here, '..', 'dist', 'src');

const { mapApiEventToRawTimeTreeEvent } = await import(`${distBase}/browser/timetree-page-extractor.js`);
const { normalizeRawTimeTreeEvent } = await import(`${distBase}/core/normalize.js`);
const { linkRecurringOverrides } = await import(`${distBase}/core/recurrence-link.js`);
const { createIcsCalendar } = await import(`${distBase}/core/ics.js`);

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('usage: node scripts/verify-recurrence-smoke.mjs <captured.json>');
  process.exit(2);
}

let parsed;
try {
  parsed = JSON.parse(readFileSync(inputPath, 'utf8'));
} catch (err) {
  console.error(`입력 JSON을 읽지 못했다: ${err.message}`);
  process.exit(2);
}

const apiEvents = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.events) ? parsed.events : null;
if (!apiEvents) {
  console.error('입력은 apiEvent 배열이거나 { "events": [...] } 형식이어야 한다.');
  process.exit(2);
}

// 1) 프로덕션 경로로 정규화
const raws = apiEvents.map(mapApiEventToRawTimeTreeEvent);
const normalized = raws
  .map((r) => normalizeRawTimeTreeEvent(r))
  .flatMap((r) => (r.ok ? [r.value] : []));
const linked = linkRecurringOverrides(normalized);
const ics = createIcsCalendar(linked);

// 2) 관찰값 테이블 (raw 실값 기록용)
console.log('\n=== 관찰된 raw 링크 필드 (문서에 기록) ===');
console.log('eventId\trecurring_uuid\trecur_start_at\thas_RRULE');
for (const raw of raws) {
  const hasRRule = (raw.recurrences ?? []).some((r) => r.startsWith('RRULE:'));
  console.log(`${raw.id}\t${raw.recurringUuid ?? '∅'}\t${raw.recurStartAt ?? '∅'}\t${hasRRule}`);
}

// 3) 링크 판정
console.log('\n=== 링크 판정 (normalize→link 결과) ===');
console.log('eventId\tuid\trecurrenceId\torphanWarning');
const byEventId = new Map(linked.map((e) => [e.source.eventId, e]));
for (const raw of raws) {
  const e = byEventId.get(raw.id);
  if (!e) {
    console.log(`${raw.id}\t(normalize fail/드롭)`);
    continue;
  }
  const rid = e.recurrenceId
    ? e.recurrenceId.kind === 'date'
      ? `DATE:${e.recurrenceId.date}`
      : `${e.recurrenceId.timezone}:${e.recurrenceId.epochMs}`
    : '∅';
  const orphan = e.warnings.includes('recurrence-override-orphaned');
  console.log(`${raw.id}\t${e.uid}\t${rid}\t${orphan ? 'YES' : '-'}`);
}

// 4) ICS의 UID / RECURRENCE-ID 라인
console.log('\n=== ICS UID / RECURRENCE-ID 라인 ===');
console.log(
  ics
    .split('\r\n')
    .filter((l) => /^BEGIN:VEVENT|^UID:|^RECURRENCE-ID|^RRULE:/.test(l))
    .join('\n'),
);

// 5) 종합 판정
const overrides = raws.filter((r) => r.recurStartAt != null && r.recurringUuid != null);
const linkedOverrides = overrides.filter((r) => {
  const e = byEventId.get(r.id);
  return e && e.recurrenceId != null && !e.warnings.includes('recurrence-override-orphaned');
});
const orphanedOverrides = overrides.length - linkedOverrides.length;

console.log('\n=== 종합 ===');
console.log(`override 후보: ${overrides.length}건`);
console.log(`master와 링크됨(RECURRENCE-ID emit): ${linkedOverrides.length}건`);
console.log(`orphan fallback(단발 UID + warning): ${orphanedOverrides}건`);

if (overrides.length === 0) {
  console.log('\n판정: override 후보가 없다. 수정된 반복 instance가 캡처에 포함됐는지 확인하라.');
  process.exit(1);
}
if (linkedOverrides.length === overrides.length) {
  console.log('\n판정: ✅ 모든 override가 master와 링크됐다. 가정이 실데이터와 일치한다.');
  console.log('다음: 이 ICS를 Google Calendar로 import해 series override로 반영되는지 육안 확인하라.');
  process.exit(0);
}
console.log('\n판정: ⚠️ 일부 override가 orphan으로 떨어졌다. 가정이 틀렸을 수 있다.');
console.log('master의 recurring_uuid가 override와 다른 값이거나, master가 캡처에 없을 수 있다.');
console.log('관찰값 테이블의 recurring_uuid 컬럼을 비교하고, linkRecurringOverrides 판별 로직 정정을 검토하라.');
process.exit(1);

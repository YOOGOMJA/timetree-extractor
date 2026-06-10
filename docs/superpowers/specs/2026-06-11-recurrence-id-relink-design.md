# RECURRENCE-ID 링크 모델 재설계 (#62, Option C+)

결론: `linkRecurringOverrides`를 실데이터 모델에 맞게 다시 짠다. override는 `recurrenceGroupId`(=raw `recurring_uuid`)로 **master의 `source.eventId`를 가리키므로**, 그 방향으로 master를 찾는다. **미이동 override**(override.start가 master의 EXDATE 슬롯과 일치)는 master UID + `RECURRENCE-ID`로 묶고 **그 EXDATE를 master에서 제거**(EXDATE+RECURRENCE-ID 충돌 방지). **이동/애매** override는 현행대로 독립 이벤트 유지(이미 비파손).

- 대상 이슈: #62 (#14 가정 반증, 실데이터 모델 확정)
- 선행: #61(master 드롭) — merged, 이제 master가 normalize를 통과함
- 상태 구분: **검증됨**(실데이터) / **가정** / **범위 외**

## 핵심 통찰 (검증됨)

수정 회차가 생기면 TimeTree는 master의 RRULE에 `EXDATE:<수정일>`을 추가하고 override를 별도 이벤트로 만든다. 현재 코드는 master를 `RRULE+EXDATE`로, override를 독립 이벤트로 emit → **"series(수정일 제외) + 수정일 독립 이벤트"** = 중복·data-loss 없음. 따라서 #62는 **충실도 향상**(수정 회차를 진짜 series override로)이지 data-loss 수정이 아니다.

## 실데이터 모델 (검증됨, Claude in Chrome 관찰)

| 역할 | 판별 | 링크 키 |
| --- | --- | --- |
| master | `recurrence != null` (RRULE 보유), `recurrenceGroupId == null` | 자신의 `source.eventId` |
| override | `recurrenceGroupId != null` | `recurrenceGroupId` == master의 `source.eventId` |
| normal | `recurrenceGroupId == null`, `recurrence == null` | — |

- override엔 `recur_start_at`(=`originalStartAt`)이 **없음** → 의존 폐기.
- override의 원래 슬롯: 미이동이면 `override.start`, 이동이면 master EXDATE에만(명시 링크 없음).

## 아키텍처

`src/core/recurrence-link.ts` `linkRecurringOverrides` 재작성. 시그니처 `(events: NormalizedCalendarEvent[]) => NormalizedCalendarEvent[]` 유지(호출부 무변경). `src/core/ics.ts`는 이미 `recurrenceId`→RECURRENCE-ID, `recurrence.exdate`→EXDATE를 emit하므로 **무변경**(링크 패스가 master의 exdate를 줄여서 넘김).

### 알고리즘

1. **master 색인**: `recurrence != null`인 이벤트를 `source.eventId → event`로 Map(`mastersById`).
2. **override별 매칭**: `recurrenceGroupId != null`인 각 override에 대해:
   - `master = mastersById.get(override.recurrenceGroupId)`
   - master 없음 → orphan: `recurrence-override-orphaned` warning, 독립 유지.
   - master 있음:
     - master EXDATE 슬롯들 중 **override.start와 일치하고 아직 미claim된** 것을 찾는다(§매칭).
     - 일치 슬롯 있음(=미이동) → **링크**: `uid=master.uid`, `recurrenceId=override.start`; 그 EXDATE를 해당 master에서 claim(제거 대상).
     - 일치 슬롯 없음(=이동/EXDATE없음) → 독립 유지(warning 없음 — 비파손 동작).
3. **master 재구성**: claim된 EXDATE 라인을 master의 `recurrence.exdate`에서 제거. 비면 `exdate` key 제거(빈 배열 금지). 다른 필드 무변경.
4. master·normal·미링크 override는 그 외 무변경.

순서: 한 번의 패스로 (a) master별 claim 집합과 (b) override별 링크 결과를 동시에 계산한 뒤, 마지막에 events를 map하며 master는 claim 반영, override는 링크 반영.

### EXDATE ↔ override.start 매칭 (§매칭)

EXDATE 라인에서 슬롯 키를 추출해 override.start와 비교한다.

- EXDATE 라인 파싱: `EXDATE`와 optional `;params` 제거 후 `:` 뒤 값. 값이 `YYYYMMDDT...`이면 앞 8자리로 날짜 `YYYY-MM-DD` 추출, 시각부가 있으면 datetime으로도 파싱.
- 비교:
  - `override.start.kind === 'date'` → override.start.date(`YYYY-MM-DD`) 와 EXDATE 값의 날짜부(`YYYYMMDD`→`YYYY-MM-DD`) 일치.
  - `override.start.kind === 'date-time'` → override.start의 epoch과 EXDATE 값(`YYYYMMDDTHHMMSSZ`)의 UTC epoch 일치.
- `override.start.kind`와 EXDATE 표현이 호환되지 않으면 불일치로 처리(보수적 → 독립 유지).

검증된 실데이터(all-day, 제목만 수정)는 date-kind 경로로 정확히 일치한다.

### RECURRENCE-ID 값

미이동이므로 `recurrenceId = override.start`(이미 NormalizedDateTime). master.start와 kind가 같을 때만 링크(다르면 이동/불일치로 간주해 독립 유지). 기존 `buildRecurrenceId(originalStartAt, masterStart)`는 제거(또는 override.start 기반으로 축소).

## 에러 처리 / 안전망

- master 부재 → `recurrence-override-orphaned` warning + 독립(data-loss 0).
- 이동/매칭 실패 → 독립(현행 비파손 동작). 별도 warning 없음.
- 절대 wrong RECURRENCE-ID를 emit하지 않음(매칭된 슬롯만 링크).
- master EXDATE는 claim된 것만 제거; 미수정 occurrence를 지우는 EXDATE는 보존.

## 테스트 매트릭스

- 실데이터형: master(RRULE+EXDATE:20260708) + override(groupId=master.eventId, start=2026-07-08 all-day) → override.uid==master.uid, recurrenceId={kind:'date',date:'2026-07-08'}, **master.exdate에서 20260708 제거됨**.
- master 부재 override → uid 유지 + orphan warning.
- 이동 override(start가 어떤 EXDATE와도 불일치) → uid 유지, recurrenceId 없음, warning 없음, master EXDATE 보존.
- 복수 override/복수 EXDATE: 각 override가 자기 슬롯과 1:1 claim, 각 master EXDATE 정확히 해당 것만 제거.
- 일반 이벤트(groupId 없음) → 무변경.
- timed override(date-time) start가 EXDATE datetime과 epoch 일치 → 링크.
- master EXDATE가 모두 claim되면 exdate key 제거(빈 배열 아님).
- 입력 불변성: 원본 event 객체 비변형(spread 새 객체).
- end-to-end: raw(master+override) → normalize → link → ICS에서 두 VEVENT 공통 UID + override에 RECURRENCE-ID + master에 EXDATE 없음.

## 범위 외 (YAGNI)

- 이동(시간 변경) override의 series 링크 — 원래 슬롯↔override 명시 매핑이 없어 보수적 미링크(독립 유지로 충분).
- `originalStartAt`/`recur_start_at` 필드 제거 — SQLite 캐시 경로엔 존재할 수 있어 보존(링크에서 미사용만 함).
- UNTIL emit 정합성 — 별도 #63.
- normalize/contract의 RRULE subset — 별도 #61(merged).

## 문서 동반 갱신

- `docs/specs/ics-normalization-contract.md` §"Recurring instance override" — 링크 키(recurring_uuid→master.id), 미이동 EXDATE 매칭+제거, 이동 독립 유지로 갱신.
- `docs/specs/google-calendar-import-field-compat.md` — `recurringUuid → RECURRENCE-ID` 행을 실모델 반영으로 갱신.
- `MEMORY.md`의 [[timetree-recurring-instance-model]]는 이미 반영됨(추가 갱신 불필요).

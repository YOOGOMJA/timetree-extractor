# RECURRENCE-ID override 보존 설계 (#14)

결론: 수정된 반복 instance를 master와 **동일 UID + `RECURRENCE-ID`** 로 emit해 Google Calendar에서 series override로 반영한다. master를 export에서 찾을 수 없거나 그룹화가 애매하면 **현행 단발 UID로 fallback + warning** 하여 data-loss를 만들지 않는다.

- 대상 이슈: #14 (의존 #11 — closed, 사전 캡처 #57 — merged)
- 관련 문서: `docs/research/google-calendar-import-field-research.md`(RECURRENCE-ID honor 조건), `docs/specs/ics-normalization-contract.md`, `docs/specs/google-calendar-import-field-compat.md`
- 상태 구분: **검증됨**(probe 실행) / **가정**(실데이터 미검증) / **범위 외**

## 배경과 문제 (검증됨)

TimeTree에서 반복 일정 중 한 회차만 수정하면 그 instance는 자기만의 `eventId`를 갖는다. 현재 normalize는 UID를 `timetree:{calendarId}:{eventId}`로 만들고 `RECURRENCE-ID`를 emit하지 않으므로, master와 override가 서로 다른 UID를 가진 **독립 event 2개**로 export된다.

probe(`master`=RRULE, `override`=recurStartAt 보유)를 현행 코드로 실행해 재현 확인:

```
BEGIN:VEVENT
UID:timetree:7:evt-master
BEGIN:VEVENT
UID:timetree:7:evt-override     ← 별도 UID, RECURRENCE-ID 없음
```

또한 normalize 출력에 `recurringUuid`/`recurStartAt`가 **존재하지 않음**(probe `present? false`) — 즉 그룹화 입력이 `NormalizedCalendarEvent`까지 전달되지 않는다. 이것이 아래 설계가 sidecar를 두는 이유다.

Google import 측 제약(research 문서): `RECURRENCE-ID`는 **master VEVENT가 같은 파일에 있고 UID가 동일할 때만** honor된다. 단독이면 별 단발 event가 된다.

## 데이터 모델 가정 (실데이터 미검증)

| 역할 | 판별 조건 (가정) |
| --- | --- |
| master (series 정의) | `recurrences` 비어있지 않음(RRULE) **&&** `recurStartAt == null` |
| override (수정된 단일 회차) | `recurStartAt != null` (원래 occurrence 시각, epoch ms) |
| 연결 키 | master·override가 **동일 `recurringUuid` 공유** |

미검증 위험: master가 override와 같은 `recurringUuid`를 갖는지, 혹은 override의 `recurringUuid`가 master의 `id`를 가리키는지는 실데이터로 확인되지 않았다. probe는 가정에 맞춰 합성한 입력을 썼으므로 **아키텍처/메커니즘만 검증**하며 데이터 의미론은 검증하지 못한다. 가정이 틀리면 아래 fallback이 흡수한다. 실데이터 검증은 별도 후속(이 spec 범위 외).

## 아키텍처 (A안 — 검증된 추천)

```
raw[] → normalize(각각) → linkRecurringOverrides(전체) → createIcsCalendar(전체)
                ↑ link sidecar 보존        ↑ uid/recurrenceId/warning 확정
```

per-event `normalizeRawTimeTreeEvent`는 순수성을 유지(형제 이벤트를 모름)하고, 새 pure 함수가 배열을 받아 cross-event 링크를 해소한다.

추천 근거(검증됨):
- normalize 단일-이벤트 호출이 테스트에 37곳 → normalize에 형제 context를 주입하는 대안(B안)은 33+ 테스트에 churn을 유발.
- core의 배열 단위 함수 선례는 `createIcsCalendar(events[])` 하나뿐 → linking pass는 이 기존 배열 seam 앞에 합류하여 패턴을 따른다.

## 컴포넌트 설계

### 1. normalize sidecar (additive)

`NormalizationResult`의 `ok: true` variant에 optional `link` 필드를 additive로 추가한다. 기존 37개 `.value` 호출은 무영향.

```ts
| { ok: true; value: NormalizedCalendarEvent; link: RecurrenceLink; issues: [] }

type RecurrenceLink = { recurringUuid: string | null; recurStartAt: number | null };
```

`recurringUuid`/`recurStartAt`는 raw contract에 이미 존재(#57). normalize는 이를 `link`로 그대로 전달만 한다(해석하지 않음).

### 2. `NormalizedCalendarEvent.recurrenceId` (emit용)

emit 전용 필드를 추가한다. 타입은 `NormalizedDateTime`(start/end와 동일) — ics.ts의 기존 DTSTART 포맷 헬퍼를 재사용하기 위함.

```ts
recurrenceId?: NormalizedDateTime;
```

### 3. `linkRecurringOverrides(items)` (core, pure)

입력: `Array<{ event: NormalizedCalendarEvent; link: RecurrenceLink }>`
출력: `NormalizedCalendarEvent[]` (uid/recurrenceId/warnings 확정)

규칙:
1. `recurringUuid == null` 항목은 그대로 통과(일반 이벤트).
2. 나머지를 `recurringUuid`로 그룹화.
3. 그룹에서 master(=`recurrence` 존재 && `recurStartAt == null`)를 찾는다.
4. 각 override(`recurStartAt != null`):
   - master 정확히 1개 → `event.uid = master.uid`, `event.recurrenceId = formatRecurrenceId(recurStartAt, master)`
   - master 0개 또는 2개 이상(애매) → 단발 uid 유지 + warning `recurrence-override-orphaned`
5. master·일반 이벤트는 무변경. master를 drop하지 않으므로 "master 동일 export 포함"이 자동 보장.

엣지: `recurringUuid` 보유 but `recurStartAt == null` && `recurrence` 없음인 항목(불명확 멤버)은 override도 master도 아니므로 무변경·warning 없음(일반 이벤트와 구분 불가).

### 4. `formatRecurrenceId(recurStartAt, master)` (정합성 핵심)

RECURRENCE-ID는 master `DTSTART`와 **VALUE/TZID가 일치해야** 한다. override 자신의 (변경된) start가 아니라, `recurStartAt`(원래 슬롯)을 **master의 timezone·all-day 타입**으로 `NormalizedDateTime`을 구성한다. 이렇게 해야 RRULE이 생성하는 원래 occurrence와 매칭된다.

- all-day master → `RECURRENCE-ID;VALUE=DATE:YYYYMMDD`
- zoned master → `RECURRENCE-ID;TZID=...:YYYYMMDDTHHMMSS`
- UTC fallback master(#43) → `RECURRENCE-ID:YYYYMMDDTHHMMSSZ`

### 5. ics.ts emit

`event.recurrenceId`가 있으면 DTSTART와 동일한 date-time 포맷 헬퍼로 `RECURRENCE-ID` 라인을 push(UID 직후, RRULE/DTSTART 인접 위치). master에는 recurrenceId가 없으므로 master는 RRULE만 emit.

### 6. warning enum (closed)

`NORMALIZATION_WARNING_VALUES` tuple에 `'recurrence-override-orphaned'`를 추가하고 enum sync 테스트를 갱신한다.

### 7. 배선 (2곳)

`cli/export-preview.ts`, `extension/sidepanel-export-policy.ts`가 normalize 결과의 `{value, link}`를 모아 `linkRecurringOverrides`를 `createIcsCalendar` 직전에 호출하도록 변경.

## 에러/fallback 처리

- master 부재·복수(애매) → 단발 UID 유지(현행과 동일 출력) + `recurrence-override-orphaned` warning. data-loss 0.
- 가정 자체가 틀린 경우(예: override가 master와 다른 recurringUuid) → 그룹 매칭 실패 → 동일 fallback 경로로 흡수.

## 테스트 매트릭스

- master + override(동일 recurringUuid) → override.uid == master.uid, RECURRENCE-ID emit
- override + master 부재 → 단발 uid 유지 + `recurrence-override-orphaned` warning
- all-day master → `RECURRENCE-ID;VALUE=DATE`
- zoned master → `RECURRENCE-ID;TZID=...`
- UTC fallback master(#43) → `RECURRENCE-ID:...Z`
- 한 master에 복수 override → 각각 distinct RECURRENCE-ID, 공통 UID
- 일반 이벤트(recurringUuid null) → 무변경, recurrenceId/warning 없음
- 동일 recurringUuid에 master 2개(애매) → override orphan + warning
- master가 같은 export 출력에 VEVENT로 포함됨(conformance)
- enum sync 테스트에 새 warning 포함

## 범위 외 (YAGNI)

- 삭제된 instance용 `EXDATE` master 주입 (#14는 수정 instance 한정)
- 없는 master 합성 (날조 불가 — fallback으로 처리)
- recurringUuid/recurStartAt 데이터 의미론의 실데이터 검증 (별도 후속)

## 문서 갱신 동반

- `docs/specs/google-calendar-import-field-compat.md`의 `recurringUuid → RECURRENCE-ID` 행을 "(계획)"에서 구현 반영으로 갱신.
- `docs/specs/ics-normalization-contract.md`에 RECURRENCE-ID/override 링크 정책 한 절 추가.

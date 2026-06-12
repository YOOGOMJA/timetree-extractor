# RECURRENCE-ID override import 수동 검증 runbook (#85)

> 상태: 준비 완료, **실 import 결과 미기록**(human/browser 필요). 2026-06-12.
> 목적: GCal API로 재현 불가한 두 경로를 사람이 파일 import로 확인한다.
> (a) `.ics` 파일 import 경로 자체, (b) RECURRENCE-ID로 수정된 반복 instance가 import 후 정합한지.

## 왜 수동인가

Google Calendar **API**(`create_event`)는 (1) `.ics` 파일 import endpoint가 없고, (2) 기존 반복 series의 단일 occurrence를 RECURRENCE-ID로 덮어쓰는 override 생성을 지원하지 않는다. 따라서 이 경로는 **설정 → 가져오기**(파일 import) UI로만 검증 가능하다.

## 샘플 artifact

`docs/research/artifacts/recurrence-id-override-sample.ics` — 재현용 최소 ICS.

생성 모델(실데이터 기준, [[timetree-recurring-instance-model]]):
- **master**: `UID:timetree:7:master-1`, 매주 월 10:00 KST (`RRULE:FREQ=WEEKLY;BYDAY=MO`).
- **override**: 같은 `UID`, `RECURRENCE-ID;TZID=Asia/Seoul:20260615T100000`, 제목 "주간 회의 — 안건 추가".
- master의 EXDATE는 링크 시 소비됨(EXDATE + RECURRENCE-ID 같은 날짜 동시 emit 충돌 방지).

핵심 구조:
```
BEGIN:VEVENT
UID:timetree:7:master-1
RRULE:FREQ=WEEKLY;BYDAY=MO
DTSTART;TZID=Asia/Seoul:20260601T100000
END:VEVENT
BEGIN:VEVENT
UID:timetree:7:master-1
RECURRENCE-ID;TZID=Asia/Seoul:20260615T100000
SUMMARY:주간 회의 — 안건 추가
END:VEVENT
```

## 절차 (Google Calendar)

1. **개인 캘린더** 하나를 검증 대상으로 정한다(공유 캘린더 금지).
2. calendar.google.com → 설정 → 가져오기/내보내기 → `recurrence-id-override-sample.ics` 선택 → 대상 캘린더 = 위 개인 캘린더 → 가져오기.
3. 2026-06 월요일들을 확인.
4. 검증 후 **가져온 일정 전부 삭제**(아래 정리).

## 기대값 vs 실제 (실제는 import 후 기록)

| 항목 | 기대 | 실제 |
| --- | --- | --- |
| 매주 월 "주간 회의" 생성 | 06-01, 06-08, 06-22, 06-29 … 반복 | TBD |
| 06-15 occurrence | 시리즈의 그 자리만 "주간 회의 — 안건 추가"로 대체 | TBD |
| 06-15에 원본 + 수정본 **중복** 여부 | 중복 없음(RECURRENCE-ID가 그 occurrence를 덮음) | TBD |
| 시간대 | 전부 10:00 KST | TBD |
| 파일 import 자체 성공 | 오류 없이 가져옴 | TBD |

## Apple Calendar

동일 파일을 macOS Calendar.app에 import(파일 → 가져오기) → 개인 캘린더 대상 → 같은 표를 채운다.

## 정리 (필수)

검증 끝나면 가져온 일정(시리즈 + override)을 **전부 삭제**. 개인 캘린더만 사용했는지 재확인.

## 보안 제약

- 개인 캘린더만. 공유 캘린더 절대 금지.
- 캘린더 수정(가져오기) 전 사용자 확인.
- 검증용 일정은 결과 기록 후 삭제.

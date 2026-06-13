# RECURRENCE-ID override import 수동 검증 runbook (#85)

> 상태: **검증 완료**(Google Calendar, 2026-06-12). Google이 RECURRENCE-ID override + EXDATE-소비 모델을 정상 처리함을 확인. 아래 "결과" 참고.
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

## 결과 (Google Calendar, 2026-06-12, 개인 캘린더 "KyeongSoo Yoo")

| 항목 | 기대 | 실제 |
| --- | --- | --- |
| 파일 import 자체 | 오류 없이 가져옴 | ✅ "일정 2개 중 2개를 가져왔습니다" |
| 매주 월 "주간 회의" 반복 | 06-08, 06-22 … 반복 | ✅ 06-22 "주간 회의" 10–11시 확인 |
| 06-15 occurrence | 그 자리만 "주간 회의 — 안건 추가"로 대체 | ✅ 06-15만 override 제목 |
| 06-15 원본+수정본 **중복** | 중복 없음(RECURRENCE-ID가 occurrence를 덮음) | ✅ 06-15 일정 **1개**, 중복 없음 |
| 시간대 | 전부 10:00 KST | ✅ 전부 오전 10–11시 |

**결론**: Google file import는 (1) `.ics` 파일 import을 정상 수행하고, (2) master `UID` + `RRULE` + 같은 `UID`의 `RECURRENCE-ID` override를 올바르게 묶어 해당 occurrence만 대체한다(중복 생성 없음). 우리의 EXDATE-소비 링크 모델([[timetree-recurring-instance-model]])이 Google에서 의도대로 동작. **정리**: 검증 후 series(모든 일정) 삭제 완료, 06-15 주 "일정 없음" 확인.

> Apple Calendar는 미검증(동일 파일로 추후). 절차는 아래 유지.

## 제출 직전 회귀 점검 (#96, 2026-06-13)

배포 제출 직전 정확성 게이트. **캘린더를 다시 건드리지 않고** 회귀 부재를 입증:

1. 전체 테스트 281 pass, 반복/시간대/RECURRENCE-ID 타깃 88 pass.
2. export 코어(`src/core/ics.ts`·`recurrence-link.ts`·`normalize.ts`)가 #85 검증(PR #88) 이후 **무변경** → #85의 실 Google import 결과가 그대로 유효.
3. 동일 파이프라인으로 재생성한 master+override ICS가 커밋된 `artifacts/recurrence-id-override-sample.ics`와 **byte-identical**(DTSTAMP 제외) — RECURRENCE-ID/RRULE/EXDATE 구조 회귀 0.

결론: 제출 직전 정확성 회귀 없음. 실 import 재검증은 export 산출물이 #85와 동일함이 증명되어 불필요.

## Apple Calendar

동일 파일을 macOS Calendar.app에 import(파일 → 가져오기) → 개인 캘린더 대상 → 같은 표를 채운다.

## 정리 (필수)

검증 끝나면 가져온 일정(시리즈 + override)을 **전부 삭제**. 개인 캘린더만 사용했는지 재확인.

## 보안 제약

- 개인 캘린더만. 공유 캘린더 절대 금지.
- 캘린더 수정(가져오기) 전 사용자 확인.
- 검증용 일정은 결과 기록 후 삭제.

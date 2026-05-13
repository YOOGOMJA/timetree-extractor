# TimeTree SQLite cache probe

결론: **로그인된 TimeTree Web page의 IndexedDB SQLite cache에서 event table schema와 event row를 read-only로 확인했다.** Passive network observer만으로는 최신 cache 상태에서 `events` response가 빈 delta일 수 있으므로, 1차 extractor가 실제 일정 목록을 확보하려면 network observer와 별도로 SQLite cache reader 경계를 설계해야 한다.

## 조사 범위

- 확인일: 2026-05-13
- 실행 위치: 로그인된 TimeTree Web page context
- 도구: `agent-browser`와 임시 `/tmp` smoke script
- 저장 정책: raw SQLite file, raw row, event title, note, location, person name, cookie, token, CSRF, HAR 저장 안 함
- 출력 정책: schema, count, JavaScript type, binary JSON field length category만 확인

## 확인한 storage 구조

TimeTree Web은 `timetree-sqlite` IndexedDB database를 사용한다.

| Store | 관찰 결과 | 메모 |
| --- | --- | --- |
| `metadata` | SQLite file size와 name 보유 | name은 `/timetree` 형태 |
| `blocks` | 4 KiB block 55개 | offset은 일부 negative offset으로 저장됨 |

Block offset은 단순 absolute offset만이 아니라 file size 기준 negative offset도 포함한다. Smoke에서는 `actualOffset = fileSize + offset` 방식으로 negative offset을 복원했을 때 SQLite header가 확인됐다.

## 확인한 SQLite table

SQLite schema 기준 table은 다음 3개였다.

| Table | Column count | Row count 확인 | 메모 |
| --- | ---: | --- | --- |
| `events` | 38 | `COUNT(*)`는 malformed error, cursor scan은 17 rows 성공 | 실제 event data table |
| `kysely_migration` | 2 | 52 rows | app migration metadata |
| `kysely_migration_lock` | 2 | 13 rows | app migration lock metadata |

`PRAGMA quick_check`는 issue를 보고했다. 따라서 이 cache file은 app의 active VFS snapshot으로 보이며, 단순 SQLite file copy로는 일부 aggregate query가 실패할 수 있다. 다만 `SELECT ... FROM events` cursor scan은 끝까지 성공했다.

## `events` table 주요 column

P0 extraction에 필요한 column은 모두 존재했다.

| 목적 | Column | 확인 |
| --- | --- | --- |
| identity | `id`, `primary_id`, `calendar_id`, `uuid` | 존재 |
| title | `title` | 존재 |
| all-day | `all_day` | 존재 |
| time | `start_at`, `end_at` | 존재 |
| timezone | `start_timezone`, `end_timezone` | 존재 |
| recurrence | `recurrences`, `recurring_uuid`, `recur_start_at`, `recur_end_at` | 존재 |
| metadata | `label_id`, `location`, `url`, `note` | 존재 |
| privacy-sensitive extended data | `attendees`, `alerts`, `attachment`, `files` | 존재 |
| inactive marker | `deactivated_at` | 존재 |

## Row scan 결과

Raw value는 기록하지 않았다.

| 항목 | 결과 |
| --- | --- |
| scanned row count | 17 |
| scan error | 없음 |
| inactive/deactivated row count | 0 |
| `title` type | `string` |
| `all_day` type | `number` |
| `start_at` / `end_at` type | `number` |
| `start_timezone` / `end_timezone` type | `string` |
| `note` type | `null` 또는 `string` |
| `url` type | `null` |
| structured columns | `Uint8Array` 형태 |

`attendees`, `recurrences`, `alerts`, `attachment`, `files`는 `jsonb` column이며 smoke에서는 `Uint8Array`로 노출됐다. 따라서 다음 구현은 SQLite JSONB decode 또는 app-compatible decoding strategy가 필요하다.

## 구현 판단 변경

기존 passive network observer는 여전히 필요하지만, 단독으로는 충분하지 않다.

- Network observer 역할:
  - TimeTree app의 sync event를 방해하지 않고 관찰한다.
  - cache freshness와 endpoint shape를 확인한다.
- SQLite cache reader 역할:
  - 이미 cache된 full event rows를 read-only로 순회한다.
  - P0 field를 extractor contract로 mapping한다.

따라서 1차 extractor의 현실적인 구조는 다음이다.

1. Page context에서 passive observer 설치
2. IndexedDB `timetree-sqlite`를 read-only로 snapshot
3. SQLite `events` table을 cursor scan
4. raw value를 저장하지 않고 memory에서 `RawTimeTreeEvent` contract로 mapping
5. unsupported JSONB/recurrence는 warning 또는 fail-closed 처리

## 다음 구현 gate

다음 단계는 바로 Chrome extension UI가 아니라, `src/browser/`에 SQLite cache reader boundary를 추가하는 것이다.

Acceptance criteria:

- IndexedDB `timetree-sqlite`를 read-only로 연다.
- block offset 복원 logic을 unit test로 고정한다.
- SQLite engine은 dependency decision을 먼저 기록한다.
- `events` row를 memory에서 읽고 P0 field type을 validation한다.
- JSONB decode를 못 하는 경우에도 title/time/timezone/all-day는 보존한다.
- raw private row dump를 파일이나 log에 남기지 않는다.

## 남은 risk

- TimeTree 내부 cache schema는 official API가 아니므로 언제든 변경될 수 있다.
- Active VFS snapshot은 `PRAGMA quick_check` issue를 낼 수 있어 query strategy를 좁혀야 한다.
- SQLite JSONB binary decode는 별도 검증이 필요하다.
- Shared calendar의 participant/attachment data가 cache에 포함될 수 있으므로 export default는 최소 필드로 제한해야 한다.

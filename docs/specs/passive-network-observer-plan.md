# Passive network observer implementation plan

결론: 직접 `fetch`로 TimeTree API를 재호출하는 extractor는 유지하지 않는다. 다만 실제 smoke 결과, **passive network observer만으로는 최신 cache 상태의 full event list를 보장하지 못하므로** 다음 gate는 passive observer와 read-only SQLite cache reader를 분리하는 방향으로 조정한다.

## 배경

실제 로그인된 TimeTree page smoke test에서 확인한 사실은 다음과 같다.

- 로그인된 Chrome profile은 `Profile 1`이었다.
- TimeTree event page 접근은 성공했다.
- TimeTree Web app은 `GET /api/v1/calendar/:calendarId/events?since=...`를 성공적으로 호출했다.
- 같은 endpoint를 extension 쪽에서 직접 재호출하는 방식은 `400`이 발생했다.
- event detail page를 여는 것만으로 TimeTree app이 `PUT /api/v1/calendar/:calendarId/mark`를 호출했다.
- passive observer는 `calendars`, `labels`, `events` endpoint를 관찰했지만, `events` response는 빈 delta일 수 있었다.
- IndexedDB `timetree-sqlite` cache의 `events` table에서는 schema와 17개 row scan을 확인했다.

따라서 직접 API client 방식은 v1 방향으로 적합하지 않다. 구현은 app의 기존 network flow를 방해하지 않고, network observation과 local cache read-only scan을 분리해야 한다.

## RALPLAN-DR summary

### Principles

1. **Local-only**: server 전송 없이 browser/local process 안에서만 처리한다.
2. **Passive first**: extension은 TimeTree API를 직접 재호출하지 않고, app이 받은 `GET` response만 관찰한다.
3. **No credential persistence**: credential, cookie, session token, CSRF header, HAR, raw private dump를 저장하지 않는다.
4. **Fail closed**: schema mismatch, unsupported recurrence, missing timezone은 silent success로 처리하지 않는다.
5. **Layer separation**: `core`는 순수 TypeScript, `browser`는 mapping/observer logic, `extension`은 injection/message bridge만 담당한다.

### Decision drivers

1. **정확성**: timezone/all-day/recurrence field를 실제 payload에서 확인해야 한다.
2. **privacy/security**: browser session과 private calendar data를 repo나 log에 남기면 안 된다.
3. **reversibility**: Chrome extension UI/manifest 전에 observer 단위를 작게 검증해야 한다.

### Viable options

| Option | 설명 | 장점 | 단점 | 판단 |
| --- | --- | --- | --- | --- |
| A. 직접 fetch 재호출 | content script가 `/api/v1/calendar/:id/events`를 직접 호출 | 구현이 단순함 | 실제 page에서 `400`, session/header coupling 가능성, API client처럼 동작 | 기각 |
| B. DevTools/HAR 기반 capture | CDP 또는 HAR로 network response를 수집 | 관찰은 쉬움 | HAR/raw response 저장 위험, extension product 구조와 다름 | 기각 |
| C. page context passive observer | page context에 `fetch` wrapper를 주입해 matching `GET` response만 clone/parse | app flow와 일치, 직접 API client 회피, TDD 가능 | 최신 cache 상태에서는 `events`가 빈 delta일 수 있음 | 부분 채택 |
| E. read-only SQLite cache reader | IndexedDB `timetree-sqlite` blocks를 read-only snapshot으로 복원하고 `events` table을 cursor scan | full cached event rows 접근 가능, P0 field 존재 확인 | SQLite engine/JSONB decode decision 필요, 내부 cache schema 의존 | 다음 gate로 채택 |
| D. DOM extraction | rendered DOM에서 event 정보를 읽음 | API surface 의존 감소 | timezone/all-day/recurrence gap이 이미 확인됨 | 기각 |

## Architecture decision record

### Decision

Chrome extension 기준 현재 구현은 **page context passive fetch observer**를 유지하되, 다음 구현 gate는 **read-only SQLite cache reader**를 추가하는 것이다.

### Drivers

- TimeTree app의 실제 `GET /events` request는 성공하지만 직접 재호출은 실패했다.
- event page open 자체가 `PUT /mark`를 유발하므로 extension은 추가 mutation을 절대 만들면 안 된다.
- raw response 저장 없이 memory에서 contract validation을 수행해야 한다.

### Alternatives considered

- 직접 fetch extractor: 실제 smoke test에서 `400`이 발생했고, internal API client화 risk가 있다.
- HAR/CDP capture: debugging에는 유용하지만 raw private response 저장 risk가 크고 extension architecture가 아니다.
- DOM extractor: 기존 DOM only 검증에서 migration-critical field gap이 확인됐다.

### Why chosen

page context observer는 TimeTree Web app이 정상적으로 받은 response를 `Response.clone()`으로 읽고, 필요한 endpoint의 shape만 contract mapper로 넘긴다. 이 방식은 API 재호출을 줄이고, extension product boundary와 맞다.

### Consequences

- 구현은 injection timing에 민감하다.
- content script isolated world와 page world 사이 message bridge가 필요하다.
- test는 browser 없는 unit test와 실제 page smoke test로 나뉜다.
- UI/manifest는 observer가 안정화된 뒤로 미룬다.

### Follow-ups

1. endpoint matcher와 sanitizer를 TDD로 구현한다.
2. page context `fetch` wrapper를 TDD 가능한 pure function으로 분리한다.
3. content script message bridge를 구현한다.
4. 실제 TimeTree page에서 저장 없는 smoke test를 수행한다.
5. smoke 결과가 안정적이면 `ICS` writer contract로 넘어간다.

## Proposed source layout

| 파일 | 역할 |
| --- | --- |
| `src/browser/timetree-endpoints.ts` | TimeTree URL/path matcher. `GET /api/v1/calendar/:calendarId/events`와 labels 등 허용 endpoint만 판별한다. |
| `src/browser/passive-fetch-observer.ts` | `fetch` wrapper 설치/해제 logic. response clone, JSON parse, callback dispatch를 담당한다. |
| `src/browser/observed-payload.ts` | observed payload type, redaction/sanitization policy, validation result shape. |
| `src/extension/injected-observer.ts` | page context에 주입될 script entry. DOM/event bus 또는 `window.postMessage`로 content script에 전달한다. |
| `src/extension/content-script.ts` | injected script 설치와 message filtering. credential/header/raw dump 저장 금지. |
| `test/browser/passive-fetch-observer.test.ts` | fetch wrapper unit tests. |
| `test/browser/timetree-endpoints.test.ts` | endpoint matcher tests. |
| `test/extension/content-script-boundary.test.ts` | message boundary와 redaction tests. |

## Implementation steps

### Step 1. Endpoint matcher를 먼저 만든다

- 허용:
  - `GET /api/v1/calendar/:calendarId/events?since=...`
  - `GET /api/v1/calendar/:calendarId/labels`
  - 필요 시 `GET /api/v2/calendars`
- 제외:
  - `PUT`, `POST`, `PATCH`, `DELETE`
  - `activities`, `users`, `virtual_users`, `auths`, `user`, `settings`
  - Sentry, assets, notice, memorialdays

Acceptance criteria:

- allowed events endpoint만 match한다.
- mutation method는 항상 reject한다.
- query string에 token-like key가 있으면 reject 또는 redacted issue로 처리한다.

### Step 2. Passive fetch observer core를 만든다

- original `fetch`를 보존한다.
- matching `GET` response만 `response.clone().json()`으로 읽는다.
- original response는 app에 그대로 반환한다.
- JSON parse 실패는 app flow를 깨지 않고 observer issue로만 보고한다.
- observer uninstall 함수가 original fetch를 복원한다.

Acceptance criteria:

- app fetch return value identity/behavior가 유지된다.
- matching response만 callback으로 전달된다.
- non-matching endpoint는 callback을 호출하지 않는다.
- parse failure가 원래 fetch를 reject시키지 않는다.

### Step 3. Payload sanitizer와 mapper 연결

- raw response를 file/log에 저장하지 않는다.
- memory에서 `events` array 여부만 확인한다.
- 각 event는 기존 `mapApiEventToRawTimeTreeEvent`와 `validateRawTimeTreeEvent`를 통과시킨다.
- participant/attachment는 warning으로 남기되 content를 저장하지 않는 option을 둔다.

Acceptance criteria:

- malformed payload는 fail closed다.
- unsupported recurrence는 source rule을 잃지 않는다.
- participant/attachment content는 persisted output에 포함되지 않는다.

### Step 4. Extension message boundary를 만든다

- injected observer는 page context에서 실행된다.
- content script는 `window.postMessage` 또는 `CustomEvent`로 sanitized observed result만 받는다.
- message source/type/origin을 검증한다.
- token/cookie/header를 전달하지 않는다.

Acceptance criteria:

- 다른 origin message는 무시한다.
- unknown message type은 무시한다.
- raw request/response headers가 message payload에 없다.

### Step 5. 저장 없는 smoke harness를 만든다

- Chrome profile reuse는 manual/local smoke 용도만 허용한다.
- smoke output은 다음만 포함한다.
  - endpoint match 여부
  - status code
  - event count
  - first event key list
  - P0 field type map
  - contract pass/fail boolean
- smoke output은 event title, note, location, person name, raw id를 저장하지 않는다.

Acceptance criteria:

- smoke 결과가 repo에 private data를 남기지 않는다.
- `git status`와 sensitive grep으로 확인 가능하다.

## SQLite cache reader follow-up

다음 gate에서 추가로 확인할 항목은 다음이다.

- `timetree-sqlite` IndexedDB `metadata`/`blocks`를 read-only로 읽는다.
- negative block offset 복원 규칙을 test fixture로 고정한다.
- SQLite engine 선택은 별도 dependency decision으로 기록한다.
- `events` table은 aggregate query보다 cursor scan을 우선한다. 실제 smoke에서 `COUNT(*)`는 malformed error를 냈지만 row cursor scan은 성공했다.
- `jsonb` column(`attendees`, `recurrences`, `alerts`, `attachment`, `files`)은 raw dump하지 않고 decode 가능 여부만 fixture로 검증한다.

## Stop conditions

다음 조건이면 구현을 중단한다.

- observer 설치가 TimeTree app fetch 동작을 깨뜨린다.
- response body 확인에 credential/header/token 저장이 필요하다.
- event payload에서 timezone/all-day/recurrence P0 field가 안정적으로 확보되지 않는다.
- passive observer만으로는 payload를 확보할 수 없어 direct API client가 필요해진다.
- user가 public distribution 또는 SaaS 방향으로 범위를 변경한다.

## Verification plan

- Unit:
  - endpoint matcher
  - passive fetch observer
  - payload sanitizer
  - mapper/validator integration
- Integration:
  - simulated page fetch sequence
  - injected script ↔ content script message bridge
- Smoke:
  - logged-in TimeTree page에서 저장 없는 observer shape check
- Static:
  - `npm test`
  - `npm run typecheck`
  - `npm run build`
  - `git diff --check`
  - sensitive grep

## Available-agent-types roster

현재 follow-up에서 사용할 수 있는 주요 agent type은 다음과 같다.

- `planner`: 구현 순서와 risk 조정
- `architect`: extension/page context boundary 검토
- `critic`: privacy/testability plan 검토
- `executor`: TypeScript 구현
- `test-engineer`: TDD test coverage 보강
- `verifier`: smoke/evidence 검증
- `code-reviewer`: 최종 diff review

## Follow-up staffing guidance

### Ralph path

추천: `$ralph` 단일 owner 실행.

- 적합한 이유: 구현 범위가 작고, privacy gate와 TDD loop를 순차적으로 유지하는 것이 중요하다.
- 권장 보조 역할:
  - `test-engineer`: endpoint/observer/message boundary test 검토
  - `architect`: injection boundary 확인
  - `verifier`: smoke evidence 검증

### Team path

추천하지 않는다. 현 단계는 shared-file conflict 가능성 대비 병렬화 이득이 작다.

팀을 쓴다면 분리 가능한 lane은 다음 정도다.

- Lane 1: endpoint matcher + tests
- Lane 2: passive observer core + tests
- Lane 3: extension message boundary + docs

Team verification path:

- 각 lane은 자기 test를 먼저 통과시킨다.
- leader가 전체 `npm test`, `typecheck`, sensitive grep을 통합 실행한다.
- 실제 TimeTree smoke는 leader가 한 번만 수행한다.

## Goal-mode follow-up suggestions

- `$ultragoal`: observer 구현과 smoke verification을 durable goal로 추적하고 싶을 때 적합하다.
- `$autoresearch-goal`: TimeTree endpoint/payload 안정성 연구를 더 길게 할 때 적합하다.
- `$performance-goal`: 현재 단계에는 부적합하다.

## Recommended next action

결론적으로 다음 action은 **TDD로 passive network observer를 구현하는 `$ralph` 실행**이다. 구현 전 test spec은 `docs/specs/passive-network-observer-test-spec.md`를 따른다.

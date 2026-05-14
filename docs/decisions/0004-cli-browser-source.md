# Decision 0004: CLI는 browser session을 다루지 않는다

결론: CLI는 TimeTree browser session에 직접 접근하지 않는다. 제품 경계는 Option C(extension 전용 browser 추출)를 따르고, 개발자 dev smoke는 Option A(agent-browser/CDP 등 외부 도구)로 한정한다. CLI에는 login/session/credential 핸들링 코드를 추가하지 않는다.

## 배경

`docs/specs/cli-harness-plan.md`의 Task 1–3(`export-preview`, `write-ics`, argument parser)은 구현됐다. CLI는 `RawTimeTreeEvent[]` 또는 `NormalizedCalendarEvent[]`를 받아 ICS preview/export까지 처리할 수 있지만, 실데이터를 CLI 안으로 가져오는 경로는 아직 결정되지 않았다.

`src/browser/sqlite-cache-reader.ts`는 이미 browser 의존성 없는 형태(`metadataRecords + blockRecords + openDatabase` 주입)로 분리되어 있어, browser 추출 결과를 어떤 surface에서 만들지가 남은 결정이다.

## 고려한 옵션

- **Option A**: CLI가 `agent-browser`/CDP로 이미 열려 있는 브라우저에 attach해서 cache를 읽는다.
- **Option B**: 별도 browser-side helper가 sanitized SQLite byte source를 파일로 export하고, CLI가 그 파일을 소비한다.
- **Option C**: CLI는 browser 접근을 갖지 않는다. browser 추출은 Chrome extension 전용으로 유지한다.

## 결정

- **제품 경계**: Option C
  - CLI 패키지에는 browser session, CDP, IndexedDB, fetch 인터셉터 코드를 포함하지 않는다.
  - CLI는 `RawTimeTreeEvent[]` 또는 동등한 sanitized record를 입력으로 받는 library/binary로 유지한다.
  - 실사용자 추출 경로는 Chrome extension에서만 제공한다.
- **개발자 dev smoke**: Option A
  - 개발자가 자신의 로그인된 TimeTree Web session에서 `agent-browser`/CDP 또는 동등한 외부 도구로 cache 추출을 검증한다.
  - 이 검증은 CLI 외부에서 수행하고, 그 결과(sanitized record)를 필요하면 CLI에 수동으로 전달한다.
- **Option B는 현재 채택하지 않는다**
  - "browser-side helper" 구현체(extension dev mode, paste snippet 등)와 그 출력 format은 extension packaging 결정과 함께 다룬다.
  - 지금 file format 계약을 박아두면 extension scope가 정해지기 전에 input format을 동결시키게 된다.

## 근거

1. **계획 정합성**: `cli-harness-plan.md`는 "raw credential/session token을 저장하지 않는다"를 명시하고 있다. Option A를 CLI 내부에 포함하면 이 조건과 충돌할 risk가 생긴다.
2. **제품 책임 분리**: v1 제품 추출 surface는 extension이다(Decision 0002). CLI는 contract/pipeline 검증 도구이지 사용자 제품이 아니다. CLI에 browser 코드를 넣으면 두 가지 사용자 surface를 동시에 유지하게 된다.
3. **가역성**: Option C는 추가하지 않는 결정이고, 나중에 Option B를 도입하더라도 이번 결정이 차단하지 않는다. 반대로 CLI에 CDP/session 코드를 한 번 넣으면 제거 비용이 크다.
4. **검증 가치 보존**: dev smoke는 CLI 안에 있을 필요가 없다. agent-browser/CDP가 CLI 외부에서 동일한 검증을 더 작은 결합도로 제공한다.

## 기각한 대안과 이유

### Option A를 CLI 내부 feature로 포함

기각한다. CDP/agent-browser bridge를 CLI에 포함시키면 session handle, target attach, lifecycle 관리, browser process discovery까지 따라온다. dev smoke가 주는 가치 대비 CLI 표면적이 크게 늘고, "credential/session을 저장하지 않는다"는 boundary와 충돌할 risk가 생긴다.

### Option B를 지금 확정

기각한다. browser-side helper의 형태(extension export 기능, paste snippet, 별도 dev script)가 extension packaging 결정과 묶여 있어, 지금 input file format을 박으면 extension scope에 제약을 건다. file format 계약은 helper가 실제로 등장하는 시점에 결정한다.

### CLI에 input adapter를 아예 두지 않음

기각하지는 않지만 현재 결정에서 다루지 않는다. CLI는 이미 library API로 `RawTimeTreeEvent[]`를 받을 수 있다. 사용자 facing input flag(예: `--input`)는 helper가 등장한 뒤에 추가해도 늦지 않다.

## 허용/금지 범위

허용:

- CLI는 library export로 `RawTimeTreeEvent[]` 또는 sanitized record를 받아 normalize/ICS export까지 수행한다.
- 개발자는 CLI 외부에서 agent-browser/CDP, browser devtools 등으로 dev smoke를 수행할 수 있다.
- 향후 extension 또는 helper가 sanitized record file을 만들면, 그 file을 읽는 input adapter를 추가하는 별도 decision으로 다룬다.

금지:

- CLI 패키지에 CDP/agent-browser client 코드를 포함하지 않는다.
- CLI에 TimeTree login, session token, cookie, header 저장 또는 전달 코드를 추가하지 않는다.
- CLI가 직접 browser process를 spawn하거나 attach하지 않는다.
- raw SQLite bytes, raw HTTP payload, HAR file을 CLI가 disk에 commit하거나 log하지 않는다.

## Acceptance criteria

- `src/cli/` 아래에 browser/CDP/IndexedDB/fetch 인터셉터 import가 없다.
- `package.json` 의존성에 browser automation/CDP 관련 package가 추가되지 않는다.
- dev smoke 절차는 CLI 외부 문서에서 다룬다(필요해지면 별도 문서로 분리).

## 재검토 조건

다음이 발생하면 이 decision을 재검토한다.

- extension 또는 외부 helper가 sanitized record file을 안정적으로 만들기 시작하고, CLI가 그 file을 표준 입력으로 받는 것이 사용자 가치에 유의미해진다.
- agent-browser/CDP dev smoke가 반복 가능하지 않거나 비용이 커서 CI 수준 자동화가 필요해진다.
- 제품 방향이 변경되어 CLI가 사용자 제품 surface로 승격된다.

## 결과

이번 결정은 CLI 표면적을 늘리지 않고 cli-harness-plan의 Task 4를 닫는다. 다음 구현 gate는 Chrome extension packaging 또는 helper format이며, 둘 중 어느 쪽이 먼저인지는 별도 decision에서 결정한다.

Constraint: CLI는 사용자 제품 surface가 아니라 contract/pipeline 검증 도구이다
Rejected: Option A를 CLI 내부 feature로 포함 | session/credential boundary와 충돌
Rejected: Option B를 지금 확정 | extension scope 결정 전 input format 동결 risk
Confidence: medium
Scope-risk: low
Directive: CLI에 browser session, CDP, credential 코드를 추가하지 말 것

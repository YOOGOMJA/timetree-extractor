# Passive network observer test spec

결론: passive network observer 구현은 TDD로만 진행한다. 첫 구현 단위는 endpoint matcher이고, 마지막 구현 단위는 실제 TimeTree page smoke harness다.

## Test strategy

| Level | 목적 | 실행 환경 |
| --- | --- | --- |
| Unit | endpoint matcher, fetch observer, sanitizer의 deterministic behavior 검증 | Node built-in test runner |
| Integration | simulated page context에서 fetch wrapper와 message bridge 검증 | Node test with synthetic globals |
| Smoke | 로그인된 TimeTree page에서 response shape만 확인 | local Chrome profile, 저장 없는 manual command |
| Static | TypeScript/build/format/sensitive data 확인 | CLI |

## TDD sequence

### 1. Endpoint matcher tests

예상 파일:

- `test/browser/timetree-endpoints.test.ts`
- 구현 파일: `src/browser/timetree-endpoints.ts`

Required tests:

1. `matches calendar events GET endpoint`
   - input: `GET https://timetreeapp.com/api/v1/calendar/123/events?since=1778588071445`
   - expected: `{ ok: true, kind: 'events', calendarId: 123 }`

2. `matches labels GET endpoint`
   - input: `GET /api/v1/calendar/123/labels`
   - expected: `{ ok: true, kind: 'labels', calendarId: 123 }`

3. `rejects mutation methods even on known paths`
   - input: `PUT /api/v1/calendar/123/mark`
   - expected: reject with issue containing `mutation`

4. `rejects private user and member endpoints`
   - input examples:
     - `/api/v1/user`
     - `/api/v1/auths`
     - `/api/v2/calendars/alias/users`
   - expected: no match

5. `rejects token-like query keys`
   - input: events endpoint URL with a query key named `token` and any value
   - expected: reject with issue containing `token-like query`

### 2. Passive fetch observer tests

예상 파일:

- `test/browser/passive-fetch-observer.test.ts`
- 구현 파일: `src/browser/passive-fetch-observer.ts`

Required tests:

1. `returns the original fetch response to the application`
   - fake fetch returns a Response-like object.
   - observer callback is called separately.
   - returned response remains consumable by caller.

2. `observes matching JSON response through clone`
   - fake response implements `clone().json()`.
   - callback receives sanitized observed payload.

3. `does not observe non-matching requests`
   - assets, Sentry, user/auth endpoints do not trigger callback.

4. `does not break application fetch when observer JSON parsing fails`
   - `clone().json()` rejects.
   - original fetch still resolves.
   - observer reports issue through error callback.

5. `uninstall restores original fetch`
   - install returns cleanup.
   - cleanup makes global fetch equal original function.

### 3. Payload sanitizer tests

예상 파일:

- `test/browser/observed-payload.test.ts`
- 구현 파일: `src/browser/observed-payload.ts`

Required tests:

1. `summarizes event payload without private text fields`
   - input includes title, note, location, attendees.
   - output summary includes key list and field types, not actual text values.

2. `maps event payload to raw contract in memory`
   - input synthetic event passes `mapApiEventToRawTimeTreeEvent`.
   - output can include normalized contract object only in memory test fixture.

3. `fails closed when events is missing`
   - input `{ unexpected: [] }`
   - expected: failure issue `events must be an array`.

4. `keeps unsupported recurrence visible as warning path`
   - malformed or unsupported recurrence does not disappear silently.

### 4. Extension message boundary tests

예상 파일:

- `test/extension/content-script-boundary.test.ts`
- 구현 files:
  - `src/extension/injected-observer.ts`
  - `src/extension/content-script.ts`

Required tests:

1. `accepts only TimeTree observer message type`
   - unknown type ignored.

2. `rejects messages from unexpected origin`
   - origin not `https://timetreeapp.com` ignored.

3. `does not pass headers or credentials across boundary`
   - payload with `headers`, `cookie`, `authorization`, `csrf` is rejected or redacted.

4. `passes sanitized observed payload to registered handler`
   - event count, key list, field type map pass through.

### 5. Existing contract regression tests

Existing files must keep passing:

- `test/core/contracts.test.ts`
- `test/core/normalize.test.ts`
- `test/browser/timetree-page-extractor.test.ts`

Additional regression expectations:

- existing direct fetch extractor may remain as test harness utility, but product path should not rely on it.
- if direct extractor remains, docs must mark it as synthetic/injected fetch only, not live TimeTree API client.

## Smoke test spec

Smoke test는 실제 browser session을 사용하되 저장하지 않는다.

### Preconditions

- User is already logged into TimeTree in a local Chrome profile.
- Use profile reuse, not auth state export.
- Do not run `state save`.
- Do not run HAR capture.
- Do not write response body to disk.

### Allowed smoke output

Smoke output may include:

```json
{
  "urlOk": true,
  "titleOk": true,
  "observedEndpoints": ["events", "labels"],
  "eventCount": 42,
  "firstEventKeyCount": 31,
  "firstEventKeys": ["all_day", "calendar_id", "end_at"],
  "p0FieldTypes": {
    "id": "string",
    "calendar_id": "number",
    "all_day": "boolean",
    "start_at": "number",
    "start_timezone": "string|null",
    "end_at": "number",
    "end_timezone": "string|null",
    "recurrences": "array"
  },
  "contractShapeLikely": true
}
```

Smoke output must not include:

- event title
- note
- location
- URL field value
- attendee name
- calendar member name
- raw event id
- cookie
- CSRF header
- Authorization header
- HAR
- full raw JSON response

## Required verification commands

Before claiming implementation complete:

```bash
npm test
npm run typecheck
npm run build
git diff --check
# Use the project sensitive-value grep from the final implementation report.
# It must include known private TimeTree aliases/event ids and credential/header patterns,
# but those concrete private values should not be copied into this spec.
```

The grep command should produce no sensitive values. Documentation references to the words `session` or `token` are acceptable when they are policy statements, not actual values.

## Acceptance criteria

Implementation is complete only when all are true.

- endpoint matcher blocks mutation and private endpoints.
- observer reads only matching `GET` response clone.
- observer does not change original app fetch behavior.
- observer can be uninstalled.
- content script boundary passes only sanitized payload.
- no credential/header/token/cookie/HAR/raw dump is stored.
- existing normalization contract tests still pass.
- live smoke test confirms payload P0 field shape or records a no-go reason.

## No-go conditions

- The observer requires saving browser state or cookies.
- The observer needs request headers to be copied into code or files.
- The observer breaks TimeTree page behavior.
- The only reliable extraction path is direct API client behavior.
- P0 fields are absent or unstable in actual observed payloads.

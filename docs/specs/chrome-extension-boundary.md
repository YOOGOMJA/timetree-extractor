# Chrome extension boundary

결론: 1차 구현은 Chrome extension을 염두에 두되, extension product를 만들지는 않는다. 지금 고정할 것은 **core logic과 page extraction boundary의 분리**다.

## Boundary map

| Layer | 현재 경로 | 허용 | 금지 |
| --- | --- | --- | --- |
| Core | `src/core/` | raw contract validation, normalization, warning/fail policy | `window`, `document`, `fetch`, `chrome` API, credential/session 처리 |
| Browser boundary | `src/browser/` | TimeTree page URL 검증, injected fetch 결과 mapping, payload shape validation | credential/header/cookie 저장, mutation API call, background crawling |
| Extension adapter | `src/extension/` | content script에서 current page context를 얇게 연결 | manifest/UI/options/background sync 구현, token persistence |

## 현재 구현 범위

- `extractVisibleTimeTreeEvents`는 `locationHref`가 `https://timetreeapp.com/calendars/...`인지 확인한다.
- 실제 network 호출 구현은 `fetchJson`으로 주입받는다.
- content script adapter는 `credentials: 'same-origin'` browser fetch를 사용하지만, credential 값을 읽거나 저장하지 않는다.
- payload에 `events` array가 없거나 malformed recurrence가 있으면 조용히 빈 결과로 처리하지 않고 실패한다.
- internal API surface 사용은 `internal-api-surface` warning으로 남긴다.

## 아직 하지 않는 것

- Chrome extension manifest 작성
- popup/options UI 작성
- extension permission 최소화 설계
- 실제 로그인된 TimeTree page smoke test
- `ICS` file writer
- background sync 또는 자동 crawling
- public extension distribution

## 다음 gate

다음 단계는 실제 로그인된 TimeTree page에서 **저장 없는 read-only smoke test**를 수행할지 판단하는 것이다. 이 gate에서 확인할 것은 endpoint path, payload shape, timezone/all-day/recurrence 안정성이다.

이 gate에서도 credential, session token, cookie, CSRF header, HAR file, raw private dump는 저장하지 않는다.

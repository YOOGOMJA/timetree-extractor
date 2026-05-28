# Chrome extension boundary

결론: 1차 구현은 Chrome extension을 염두에 두되, extension product를 만들지는 않는다. 실제 page smoke test 이후 현재 기준은 **core logic, passive network observer, read-only SQLite cache reader boundary의 분리**다.

## Boundary map

| Layer | 현재 경로 | 허용 | 금지 |
| --- | --- | --- | --- |
| Core | `src/core/` | raw contract validation, normalization, warning/fail policy | `window`, `document`, `fetch`, `chrome` API, credential/session 처리 |
| Browser boundary | `src/browser/` | TimeTree page URL 검증, allowed endpoint matching, passive response observation, read-only SQLite cache shape validation | credential/header/cookie 저장, mutation API call, background crawling, raw private dump |
| Extension adapter | `src/extension/` | page context observer injection과 sanitized message bridge | manifest/UI/options/background sync 구현, token persistence |

## 현재 구현 범위

- `extractVisibleTimeTreeEvents`는 `locationHref`가 `https://timetreeapp.com/calendars/...`인지 확인한다.
- 기존 직접 `fetchJson` 방식은 synthetic test harness로만 유지한다. live product path는 passive observer와 SQLite cache reader를 분리한다.
- content script adapter는 credential 값을 읽거나 저장하지 않는다.
- payload에 `events` array가 없거나 malformed recurrence가 있으면 조용히 빈 결과로 처리하지 않고 실패한다.
- internal API surface 사용은 `internal-api-surface` warning으로 남긴다.

## 빌드 산출물

- Content-script(`src/extension/content-script.ts`)와 sidepanel(`src/extension/sidepanel.tsx`)은 **모두 esbuild로 IIFE 번들**(`dist/src/extension/content-script.bundle.js`, `dist/src/extension/sidepanel.bundle.js`)로 묶는다. MV3 sidepanel은 `<script type="module">` 직접 로드 대신 IIFE 번들 참조로 통일 — 외부 의존(`preact` 등) 추가 시 ESM bare specifier 해소 문제를 회피하기 위함. 결정 근거와 거부된 대안(importmap + web_accessible_resources, ESM 번들, Preact 철회, 별도 bundler 도입)은 `docs/decisions/0005-sidepanel-iife-bundle.md` 참조.
- Background service worker(`src/extension/background.js`)는 manifest `"type": "module"` 선언으로 **ESM 그대로 유지**한다(상대 경로 import만 사용, bare specifier 없음). 외부 npm dep가 들어오는 시점에 별도 결정.

## 아직 하지 않는 것

- Chrome extension manifest 작성
- popup/options UI 작성
- extension permission 최소화 설계
- full Chrome extension product smoke test
- `ICS` file writer
- background sync 또는 자동 crawling
- public extension distribution

## 다음 gate

다음 단계는 `docs/research/timetree-sqlite-cache-probe.md` 결과를 바탕으로 SQLite cache reader dependency와 contract를 결정하는 것이다. Passive observer는 endpoint와 freshness 관찰에는 유효하지만, full event list 확보는 SQLite cache scan 쪽이 더 직접적이다.

이 gate에서도 credential, session token, cookie, CSRF header, HAR file, raw private dump는 저장하지 않는다.

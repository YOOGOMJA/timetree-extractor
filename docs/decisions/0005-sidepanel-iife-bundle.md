# Decision 0005: sidepanel은 esbuild IIFE bundle로 로드한다

결론: **sidepanel(`src/extension/sidepanel.tsx` entry)은 content-script와 동일하게 esbuild로 IIFE 번들(`dist/src/extension/sidepanel.bundle.js`)로 묶고, `sidepanel.html`은 `type="module"` 없이 `<script src="…sidepanel.bundle.js">`로 로드한다.** TypeScript가 `dist/`로 직접 emit한 ESM(`dist/src/extension/sidepanel.js`)을 `<script type="module">`로 그대로 로드하던 이전 방식은 폐기한다.

## 배경

P3 모듈(`preact-setup + CalendarList`)에서 sidepanel entry에 Preact JSX(`preact`, `preact/jsx-runtime`)가 도입되면서, `tsc` 산출물에 다음과 같은 *bare specifier* 가 emit됐다.

```js
// dist/src/extension/sidepanel.js (이전 산출물)
import { jsx as _jsx } from "preact/jsx-runtime";
import { render } from 'preact';
```

Chrome MV3 sidepanel은 browser-native ES module loader로 `<script type="module">`를 해소한다. 이 loader는 *bare specifier*("`preact`")를 `node_modules`에서 자동 해결하지 못한다(Node.js ESM resolver와 동작이 다름). `sidepanel.html`에는 `<script type="importmap">`도 없었고, `manifest.json`에는 `web_accessible_resources`도 없었다. 결과적으로 sidepanel을 Chrome에서 열면 module loading이 다음 오류로 실패할 위험이 매우 높았다.

```
Uncaught TypeError: Failed to resolve module specifier "preact".
Relative references must start with either "/", "./", or "../".
```

`npm run build`와 `node --test`는 Node의 ESM resolver가 `node_modules`를 자동으로 보기 때문에 통과하지만, 그것이 Chrome 런타임 안전을 보장하지 못한다는 점이 P3 Preact 마이그레이션 당시 발견된 P0 이슈의 핵심이었다.

이 결정은 그 P0 fix의 사후 정리다 — *코드 변경은 이미 완료됐고*, 본 문서는 결정 자체와 거부된 대안을 보존한다.

## 결정

1. **sidepanel은 esbuild IIFE 번들로 로드한다.**
   - `package.json`의 `build` script chain에 `&& npm run bundle:sidepanel`를 추가.
   - `bundle:sidepanel` script: `esbuild src/extension/sidepanel.tsx --bundle --format=iife --platform=browser --target=chrome121 --outfile=dist/src/extension/sidepanel.bundle.js`.
   - `sidepanel.html`의 sidepanel 로드 라인은 `<script src="dist/src/extension/sidepanel.bundle.js"></script>`로 통일한다 (`type="module"` 없음 — IIFE는 module이 아니므로 부착 금지).
2. **content-script와 동일한 esbuild + IIFE 패턴을 따른다.**
   - 두 entry 모두 `--bundle --format=iife --platform=browser --target=chrome121`.
   - 외부 의존(`preact` 등)은 esbuild가 산출물 내부에 inline.
3. **background.js는 그대로 ESM module 유지.**
   - background service worker는 manifest `"type": "module"` 선언으로 ESM ok이며, 현재 bare specifier import가 없다(`src/core/*` 상대 경로만 사용).
   - background에 새로운 외부 npm dep가 들어오면 *그 시점에* 다시 결정한다 — 본 결정은 sidepanel + content-script만 범위로 둔다.
4. **tsc는 여전히 `dist/`로 ESM emit한다.**
   - `node --test`(Node ESM)와 background.js(MV3 ESM service worker)가 그 산출물을 그대로 import하기 때문에 tsc 출력 자체는 폐기하지 않는다.
   - sidepanel용 잔여물 `dist/src/extension/sidepanel.js`는 더 이상 HTML에서 참조되지 않지만, 별도 cleanup 비용 없이 두어도 무해.

## 근거

1. **content-script와 일관**: 기존 content-script는 *동일한 이유*(MV3 content script가 ES module을 거부)로 이미 esbuild IIFE 번들이다. sidepanel을 같은 패턴으로 맞추면 `package.json` script와 mental model이 1종으로 유지된다.
2. **가장 보수적·검증된 경로**: IIFE는 importmap이나 `web_accessible_resources` 같은 MV3에서 검증이 덜 된 mechanism에 의존하지 않는다. Chrome 121에서 즉시 동작한다.
3. **외부 dep 추가가 자동으로 안전해진다**: 다음 모듈에서 `<EventPreviewList>`, `<WarningList>` 등이 추가 preact subpath(`preact/hooks` 등)나 다른 npm dep를 import해도 bundler가 inline 처리하므로 같은 P0가 재발하지 않는다.
4. **번들 크기 영향 미미**: 48.7kb(preact + sidepanel 합산). MV3 확장에서는 network egress가 없고 local file system 로드라 무시 가능한 규모.

## 기각한 대안

### A. Import map (`<script type="importmap">`) + `web_accessible_resources`

기각한다.

- MV3 sidepanel에서 importmap이 `web_accessible_resources` 경로의 preact 모듈을 안정적으로 해소한다는 1차 검증이 없다.
- `node_modules/preact/dist/preact.module.js` 같은 deep path를 manifest에 등록하면 보안 표면이 넓어진다 — 향후 dep 추가 때마다 manifest를 손대야 한다.
- `dist/` 산출물의 bare specifier 자체를 *path*로 rewrite하는 추가 단계가 필요하다(esbuild든 다른 도구든). 그러면 결국 번들러를 도입하는 셈인데, 그럴 거면 단일 IIFE가 더 단순하다.

### B. sidepanel을 ESM 번들(`--format=esm`)로 묶기

기각한다.

- IIFE 대비 이점이 없다. sidepanel.html이 한 파일을 로드할 뿐이라 ESM의 `import`/`export`는 사용처가 없다.
- `type="module"`을 그대로 두려면 CSP에서 module-script 허용을 신경 써야 한다 — 추가 정책 비용.
- content-script와의 일관성도 깨진다(content-script는 무조건 IIFE).

### C. Preact를 철회하고 vanilla TypeScript + DOM API로 회귀

기각한다.

- 이미 채택된 Preact 마이그레이션 방향과 충돌. P3에서 `<CalendarList>` 1차 마이그레이션이 이미 완료됐고, 후속 모듈(`<EventPreviewList>`, `<WarningList>`, `<StatsTable>`)이 그 위에 쌓이는 구조다.
- 회귀 시 약점 #1(`escapeHtml` 수동 호출 누락 risk)이 부활한다.

### D. sidepanel만 별도 bundler(예: Vite, Rollup) 도입

기각한다.

- esbuild는 이미 content-script로 dependency tree에 들어와 있다. 추가 bundler를 도입하면 build pipeline에 두 도구가 공존하게 된다 — 본 repo의 contract-first 원칙(작고 검증 가능한 구현)과 맞지 않는다.

## 허용/금지 범위

허용:

- `bundle:sidepanel` script 안에서 esbuild 옵션 추가 변경(예: `--define`, `--minify`, target 상향). 단 IIFE format은 유지.
- 향후 sidepanel에 들어올 추가 npm dep(예: `clsx` 같은 utility) — bundler가 자동 inline.
- sidepanel.tsx에서 동적 `import()` 추가 시점에는 IIFE의 의미(`--format=iife`는 dynamic import도 같은 청크로 inline)를 한 번 더 검토할 것.

금지:

- sidepanel을 `<script type="module">`로 로드하지 않는다.
- `sidepanel.html`에 `<script type="importmap">`을 추가하지 않는다.
- `manifest.json`의 `web_accessible_resources`에 `node_modules/*` 경로를 등록하지 않는다.
- background service worker를 IIFE로 바꾸지 않는다(별도 결정 필요).
- `package.json`의 `bundle:sidepanel`/`bundle:content-script` script 두 개를 *서로 다른* target/format으로 분기시키지 않는다.

## 영향받는 다른 spec / decision

- `docs/specs/chrome-extension-boundary.md`: 빌드 산출물 경로 표기 1줄 추가(본 결정으로 동시 갱신).
- `docs/specs/privacy-and-local-only-boundary.md`: 영향 없음 — 번들링은 런타임 boundary와 무관, credential/네트워크 처리가 바뀌지 않는다.
- `docs/decisions/0002-implementation-go-no-go.md`: 영향 없음 — "browser extension manifest/permission 설계"는 이미 conditional go 상태이고 본 결정은 그 안에서 build pipeline 결정일 뿐.
- `docs/decisions/0003-sqlite-engine-boundary.md`: 영향 없음 — sql.js는 sidepanel에 wire-up되어 있지 않고, 향후 연결 시점에도 IIFE 번들에 inline 가능.
- TypeScript 타입(`src/core/contracts.ts`, `src/extension/message-protocol.ts`), warning enum(`EXTRACTION_WARNING_VALUES`, `NORMALIZATION_WARNING_VALUES`), fixture: **무영향**. 본 결정은 contract type이 아니라 build pipeline 변경.

## Acceptance criteria

- `package.json`의 `build` script가 `tsc -p tsconfig.json && npm run bundle:content-script && npm run bundle:sidepanel`로 chain된다.
- `npm run build` 후 `dist/src/extension/sidepanel.bundle.js`가 IIFE(`"use strict"; (() => { … })()`)로 시작한다.
- `dist/src/extension/sidepanel.bundle.js`에 `from "preact"`/`from "preact/jsx-runtime"` 같은 bare specifier가 0건이다(`grep` 검증).
- `sidepanel.html`이 `<script src="dist/src/extension/sidepanel.bundle.js"></script>`(no `type="module"`)로 로드한다.
- `npm test`가 200/200 PASS를 유지한다(번들링 변경이 contract 테스트에 회귀를 일으키지 않는다).

## 재검토 조건

다음이 발생하면 이 decision을 재검토한다.

- Chrome 또는 MV3가 native importmap을 정식 지원하면서 sidepanel 환경에서도 검증됐을 때 — 그 시점에 importmap + 외부 ESM 로드가 IIFE 대비 의미 있는 이득(예: 빌드 시간 단축, 디버깅성)을 보이면 재고.
- background service worker에 npm dep가 들어오면 background 번들링 결정을 추가로 작성한다(본 결정은 sidepanel + content-script 범위).
- sidepanel 번들 크기가 의미 있는 임계를 넘기면(예: 500kb+) code splitting 전략을 별도 결정으로.

## 결과

이번 결정으로 P3 P0 fix 당시 발견된 P1 spec drift가 해소된다. P3 P0 fix(이미 적용됨)의 결정 본체가 archeology에 보존되어, 이후 sidepanel 빌드 파이프라인을 손대는 사람이 "왜 IIFE인가, importmap은 왜 안 됐나"를 다시 탐색하지 않아도 된다.

Constraint: MV3 sidepanel의 native ES module loader는 bare specifier를 해소하지 못한다
Rejected: Import map + web_accessible_resources | MV3 sidepanel에서 검증 부재 + manifest 표면 확장
Rejected: ESM 번들(`--format=esm`) | IIFE 대비 이점 없음 + content-script와 일관성 깨짐
Rejected: Preact 철회 vanilla 회귀 | 채택된 Preact 마이그레이션 방향과 충돌
Rejected: 별도 bundler(Vite/Rollup) 도입 | build pipeline 도구 중복 + contract-first 원칙 위배
Confidence: high
Scope-risk: narrow
Directive: sidepanel을 `<script type="module">`로 로드하지 말 것; bundle:sidepanel과 bundle:content-script의 format/target을 분기시키지 말 것
Tested: build PASS, typecheck PASS, 200/200 tests PASS, bundle head IIFE 확인, bare specifier 0건
Not-tested: Chrome `chrome://extensions` Load unpacked manual smoke (자동 검증 환경 부재 — 수동 1회 수행 필요)

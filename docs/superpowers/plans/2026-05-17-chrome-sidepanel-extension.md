# Chrome SidePanel Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TimeTree 페이지 옆에 Chrome SidePanel로 열리는 extension을 만들어, 기간 선택 → 이벤트 분석 → ICS/JSON 내보내기 흐름을 개인 사용 수준으로 동작하게 한다.

**Architecture:** SidePanel 페이지(HTML+TS)가 UI 전체를 담당하고, content script는 `chrome.runtime.onMessage`로 수신한 요청을 `window.fetch`(인증 헤더 포함)로 TimeTree REST API에 전달한 뒤 결과를 반환한다. normalize/ICS 생성은 순수 함수이므로 SidePanel 컨텍스트에서 직접 실행한다. manifest V3 + background service worker가 툴바 아이콘 클릭으로 SidePanel을 연다.

**Tech Stack:** TypeScript ESM (기존), Chrome Extension Manifest V3, Chrome SidePanel API (Chrome 114+), 기존 core pipeline (normalize, ICS), 추가 npm 패키지: `@types/chrome`

---

## File Structure

| 파일 | 구분 | 역할 |
|------|------|------|
| `package.json` | 수정 | `@types/chrome` devDependency 추가 |
| `src/extension/message-protocol.ts` | 신규 | SidePanel ↔ content script 메시지 타입 정의 |
| `src/extension/background.ts` | 신규 | 툴바 클릭 시 SidePanel 열기 (service worker) |
| `src/extension/content-script.ts` | 수정 | fetch 인증 헤더 수정 + `chrome.runtime.onMessage` 핸들러 추가 |
| `manifest.json` | 신규 | Extension Manifest V3 |
| `sidepanel.html` | 신규 | SidePanel HTML 진입점 (프로젝트 루트) |
| `src/extension/sidepanel.ts` | 신규 | SidePanel UI 전체 로직 |

---

## Task 1: `@types/chrome` 설치 및 `message-protocol.ts` 작성

**Files:**
- Modify: `package.json`
- Create: `src/extension/message-protocol.ts`

- [ ] **Step 1: `@types/chrome` 설치**

```bash
npm install --save-dev @types/chrome
```

Expected: `package.json`의 `devDependencies`에 `"@types/chrome"` 추가됨.

- [ ] **Step 2: `message-protocol.ts` 작성**

```ts
// src/extension/message-protocol.ts
import type { RawTimeTreeCalendar, RawTimeTreeEvent } from '../core/contracts.js';

export type FetchCalendarsRequest = { type: 'FETCH_CALENDARS' };

export type FetchEventsRequest = {
  type: 'FETCH_EVENTS';
  calendarId: number;
};

export type ExtensionRequest = FetchCalendarsRequest | FetchEventsRequest;

export type FetchCalendarsResponse = {
  type: 'FETCH_CALENDARS';
  ok: true;
  calendars: RawTimeTreeCalendar[];
} | {
  type: 'FETCH_CALENDARS';
  ok: false;
  issues: string[];
};

export type FetchEventsResponse = {
  type: 'FETCH_EVENTS';
  ok: true;
  events: RawTimeTreeEvent[];
} | {
  type: 'FETCH_EVENTS';
  ok: false;
  issues: string[];
};

export type ExtensionResponse = FetchCalendarsResponse | FetchEventsResponse;
```

- [ ] **Step 3: typecheck 확인**

```bash
npm run typecheck
```

Expected: 오류 없음.

- [ ] **Step 4: commit**

```bash
git add package.json package-lock.json src/extension/message-protocol.ts
git commit -m "feat(extension): 메시지 프로토콜 타입과 chrome 타입을 추가한다"
```

---

## Task 2: `background.ts` 작성

**Files:**
- Create: `src/extension/background.ts`

- [ ] **Step 1: `background.ts` 작성**

```ts
// src/extension/background.ts
chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId === undefined) return;
  chrome.sidePanel.open({ windowId: tab.windowId });
});
```

- [ ] **Step 2: typecheck 확인**

```bash
npm run typecheck
```

Expected: 오류 없음.

- [ ] **Step 3: commit**

```bash
git add src/extension/background.ts
git commit -m "feat(extension): SidePanel을 여는 background service worker를 추가한다"
```

---

## Task 3: `content-script.ts` 수정

**Files:**
- Modify: `src/extension/content-script.ts`

현재 문제:
1. `credentials: 'same-origin'` → smoke에서 -401 확인. `credentials: 'include'` 필요.
2. `x-timetreea`, `x-csrf-token`, `content-type` 헤더 누락.
3. `chrome.runtime.onMessage` 핸들러 없음.

- [ ] **Step 1: `content-script.ts` 전체를 아래로 교체**

```ts
// src/extension/content-script.ts
import { listTimeTreeCalendars } from '../browser/timetree-calendars.js';
import { extractCalendarEvents } from '../browser/timetree-events-extractor.js';
import type { PageFetchJson } from '../browser/timetree-page-extractor.js';
import { installPassiveFetchObserver, type FetchLike } from '../browser/passive-fetch-observer.js';
import { summarizeObservedEventsPayload } from '../browser/observed-payload.js';
import type {
  ExtensionRequest,
  FetchCalendarsResponse,
  FetchEventsResponse,
} from './message-protocol.js';

export const TIMETREE_OBSERVER_MESSAGE_TYPE = 'TIMETREE_EXPORTER_OBSERVED_PAYLOAD';

export type ObserverMessageEvent = {
  origin: string;
  data: unknown;
};

export type TimeTreeObserverMessageHandlerOptions = {
  onObserved: (payload: unknown) => void;
  onIssue?: (issue: string) => void;
};

function buildPageFetchJson(): PageFetchJson {
  const csrfToken =
    document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? '';
  return async (path: string) => {
    const response = await window.fetch(path, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'x-timetreea': 'web/2.1.0/en',
        'x-csrf-token': csrfToken,
        'content-type': 'application/json',
      },
    });
    return response.json() as Promise<unknown>;
  };
}

chrome.runtime.onMessage.addListener(
  (request: ExtensionRequest, _sender, sendResponse) => {
    const fetchJson = buildPageFetchJson();

    if (request.type === 'FETCH_CALENDARS') {
      listTimeTreeCalendars({ fetchJson })
        .then((result): FetchCalendarsResponse => {
          if (result.ok) return { type: 'FETCH_CALENDARS', ok: true, calendars: result.calendars };
          return { type: 'FETCH_CALENDARS', ok: false, issues: result.issues };
        })
        .then(sendResponse);
      return true;
    }

    if (request.type === 'FETCH_EVENTS') {
      extractCalendarEvents({ calendarId: request.calendarId, since: 0, fetchJson })
        .then((result): FetchEventsResponse => {
          if (result.ok) return { type: 'FETCH_EVENTS', ok: true, events: result.events };
          return { type: 'FETCH_EVENTS', ok: false, issues: result.issues };
        })
        .then(sendResponse);
      return true;
    }

    return false;
  },
);

export function createTimeTreeObserverMessageHandler(
  options: TimeTreeObserverMessageHandlerOptions,
): (event: ObserverMessageEvent) => void {
  return (event) => {
    if (event.origin !== 'https://timetreeapp.com') return;
    if (!isRecord(event.data)) return;
    if (event.data.type !== TIMETREE_OBSERVER_MESSAGE_TYPE) return;

    const payload = event.data.payload;
    if (containsCredentialLikeKey(payload)) {
      options.onIssue?.('credential-like field is not allowed across the content-script boundary');
      return;
    }

    options.onObserved(payload);
  };
}

export function installInjectedTimeTreeObserver(target: Window = window): () => void {
  const fetchTarget = target as Window & { fetch: FetchLike };
  const mutableFetchTarget = fetchTarget as unknown as { fetch: FetchLike };
  const originalFetch = fetchTarget.fetch;
  const handle = installPassiveFetchObserver(originalFetch.bind(target), {
    onObserved: ({ endpoint, payload }) => {
      if (endpoint.kind !== 'events') return;
      const summary = summarizeObservedEventsPayload(payload);
      target.postMessage(
        { type: TIMETREE_OBSERVER_MESSAGE_TYPE, payload: { endpoint, summary } },
        'https://timetreeapp.com',
      );
    },
    onIssue: (issue) => {
      target.postMessage(
        { type: TIMETREE_OBSERVER_MESSAGE_TYPE, payload: { issue } },
        'https://timetreeapp.com',
      );
    },
  });
  mutableFetchTarget.fetch = handle.fetch;
  return () => {
    handle.uninstall();
    fetchTarget.fetch = originalFetch;
  };
}

const CREDENTIAL_LIKE_KEYS = new Set([
  'headers',
  'cookie',
  'authorization',
  'csrf',
  'token',
  'access_token',
]);

function containsCredentialLikeKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsCredentialLikeKey);
  if (!isRecord(value)) return false;
  for (const [key, nested] of Object.entries(value)) {
    if (CREDENTIAL_LIKE_KEYS.has(key.toLowerCase())) return true;
    if (containsCredentialLikeKey(nested)) return true;
  }
  return false;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return input !== null && typeof input === 'object' && !Array.isArray(input);
}
```

- [ ] **Step 2: 기존 테스트 확인**

```bash
npm test
```

Expected: 모든 테스트 통과. content-script boundary test가 있으면 그것도 통과해야 함.

- [ ] **Step 3: typecheck 확인**

```bash
npm run typecheck
```

Expected: 오류 없음.

- [ ] **Step 4: commit**

```bash
git add src/extension/content-script.ts
git commit -m "fix(extension): fetch 인증 헤더를 수정하고 메시지 핸들러를 추가한다"
```

---

## Task 4: `manifest.json` 작성

**Files:**
- Create: `manifest.json`

- [ ] **Step 1: `manifest.json` 작성 (프로젝트 루트)**

```json
{
  "manifest_version": 3,
  "name": "TimeTree Exporter",
  "version": "0.1.0",
  "description": "TimeTree 캘린더 이벤트를 ICS/JSON으로 내보냅니다",
  "permissions": [
    "sidePanel",
    "tabs"
  ],
  "host_permissions": [
    "https://timetreeapp.com/*"
  ],
  "content_scripts": [
    {
      "matches": ["https://timetreeapp.com/*"],
      "js": ["dist/src/extension/content-script.js"],
      "type": "module"
    }
  ],
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "action": {
    "default_title": "TimeTree Exporter 열기"
  },
  "background": {
    "service_worker": "dist/src/extension/background.js",
    "type": "module"
  }
}
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

Expected: `dist/src/extension/content-script.js`, `dist/src/extension/background.js` 생성됨.

- [ ] **Step 3: commit**

```bash
git add manifest.json
git commit -m "feat(extension): Manifest V3를 추가한다"
```

---

## Task 5: `sidepanel.html` 작성

**Files:**
- Create: `sidepanel.html` (프로젝트 루트)

- [ ] **Step 1: `sidepanel.html` 작성**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TimeTree Exporter</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; font-size: 14px; color: #111; background: #fff; padding: 16px; }
    h1 { font-size: 16px; font-weight: 600; margin-bottom: 16px; }
    h2 { font-size: 13px; font-weight: 600; margin-bottom: 8px; color: #444; }
    button { cursor: pointer; padding: 8px 14px; border-radius: 6px; border: none; font-size: 13px; }
    .btn-primary { background: #2563eb; color: #fff; }
    .btn-primary:disabled { background: #93c5fd; cursor: not-allowed; }
    .btn-secondary { background: #f3f4f6; color: #111; border: 1px solid #d1d5db; }
    .section { margin-bottom: 16px; }
    label { display: block; margin-bottom: 6px; font-size: 13px; }
    input[type="date"] { padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 13px; width: 100%; margin-top: 2px; }
    .calendar-item { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
    .calendar-item input[type="checkbox"] { width: 16px; height: 16px; }
    .stat-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #f3f4f6; }
    .warning-item { padding: 4px 8px; background: #fef3c7; border-radius: 4px; margin-bottom: 4px; font-size: 12px; }
    .event-item { padding: 4px 0; border-bottom: 1px solid #f3f4f6; font-size: 12px; }
    .event-item .title { font-weight: 500; }
    .event-item .date { color: #6b7280; font-size: 11px; }
    .radio-group { display: flex; gap: 12px; margin-bottom: 12px; }
    .radio-group label { display: flex; align-items: center; gap: 6px; margin: 0; }
    .error-box { background: #fef2f2; border: 1px solid #fca5a5; border-radius: 6px; padding: 12px; color: #dc2626; font-size: 13px; }
    .spinner { color: #6b7280; }
    [hidden] { display: none !important; }
  </style>
</head>
<body>
  <h1>TimeTree Exporter</h1>

  <div id="panel-not-timetree" hidden>
    <p style="color:#6b7280">TimeTree 페이지에서 열어주세요.<br><code>https://timetreeapp.com</code></p>
  </div>

  <div id="panel-main" hidden>

    <div id="state-idle" class="section">
      <button id="btn-load-calendars" class="btn-primary">캘린더 불러오기</button>
    </div>

    <div id="state-loading" class="section" hidden>
      <p class="spinner">불러오는 중…</p>
    </div>

    <div id="state-setup" class="section" hidden>
      <div class="section">
        <h2>캘린더 선택</h2>
        <div id="calendar-list"></div>
      </div>
      <div class="section">
        <h2>기간</h2>
        <label>시작일<input type="date" id="date-from"></label>
        <label style="margin-top:8px">종료일<input type="date" id="date-to"></label>
      </div>
      <button id="btn-analyze" class="btn-primary">분석</button>
    </div>

    <div id="state-results" hidden>
      <div class="section">
        <h2>분석 결과</h2>
        <div id="analysis-stats"></div>
      </div>
      <div id="warnings-section" class="section" hidden>
        <h2>경고</h2>
        <div id="warnings-list"></div>
      </div>
      <div class="section">
        <h2>이벤트 미리보기 (최대 20건)</h2>
        <div id="event-preview"></div>
      </div>
      <div class="section">
        <h2>내보내기 형식</h2>
        <div class="radio-group">
          <label><input type="radio" name="format" value="ics" checked> ICS</label>
          <label><input type="radio" name="format" value="json"> JSON</label>
        </div>
        <button id="btn-export" class="btn-primary">내보내기</button>
        <button id="btn-back" class="btn-secondary" style="margin-left:8px">다시 설정</button>
      </div>
    </div>

    <div id="state-error" class="section" hidden>
      <div class="error-box">
        <p id="error-message"></p>
        <button id="btn-retry" class="btn-secondary" style="margin-top:8px">다시 시도</button>
      </div>
    </div>

  </div>

  <script type="module" src="dist/src/extension/sidepanel.js"></script>
</body>
</html>
```

- [ ] **Step 2: commit**

```bash
git add sidepanel.html
git commit -m "feat(extension): SidePanel HTML 진입점을 추가한다"
```

---

## Task 6: `sidepanel.ts` 작성

**Files:**
- Create: `src/extension/sidepanel.ts`

- [ ] **Step 1: `sidepanel.ts` 작성**

```ts
// src/extension/sidepanel.ts
import { normalizeRawTimeTreeEvent } from '../core/normalize.js';
import { createIcsCalendar } from '../core/ics.js';
import type { RawTimeTreeCalendar, RawTimeTreeEvent } from '../core/contracts.js';
import type { NormalizedCalendarEvent } from '../core/normalize.js';
import type {
  ExtensionRequest,
  FetchCalendarsResponse,
  FetchEventsResponse,
} from './message-protocol.js';

// ── 메시지 전송 ──────────────────────────────────────────────────────────────

async function sendToContentScript<T>(request: ExtensionRequest): Promise<T> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.id) throw new Error('활성 탭을 찾을 수 없습니다');
  return chrome.tabs.sendMessage(tab.id, request) as Promise<T>;
}

async function isOnTimetree(): Promise<boolean> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return (tab.url ?? '').startsWith('https://timetreeapp.com');
}

// ── 상태 전환 ──────────────────────────────────────────────────────────────

type State = 'idle' | 'loading' | 'setup' | 'results' | 'error';

function showState(state: State): void {
  const panels: State[] = ['idle', 'loading', 'setup', 'results', 'error'];
  for (const s of panels) {
    document.getElementById(`state-${s}`)?.toggleAttribute('hidden', s !== state);
  }
}

function showError(message: string): void {
  const el = document.getElementById('error-message');
  if (el) el.textContent = message;
  showState('error');
}

// ── 날짜 유틸 ──────────────────────────────────────────────────────────────

function getDateRangeMs(): { fromMs: number; toMs: number } | null {
  const fromVal = (document.getElementById('date-from') as HTMLInputElement).value;
  const toVal = (document.getElementById('date-to') as HTMLInputElement).value;
  if (!fromVal || !toVal) return null;
  const fromMs = new Date(fromVal).getTime();
  const toMs = new Date(toVal).getTime() + 86_400_000 - 1; // 종료일 끝까지
  if (isNaN(fromMs) || isNaN(toMs) || fromMs > toMs) return null;
  return { fromMs, toMs };
}

function formatEventDate(event: NormalizedCalendarEvent): string {
  if (event.start.kind === 'date') return event.start.date;
  return new Date(event.start.epochMs).toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── 캘린더 UI ─────────────────────────────────────────────────────────────

let loadedCalendars: RawTimeTreeCalendar[] = [];

function renderCalendarList(calendars: RawTimeTreeCalendar[]): void {
  const container = document.getElementById('calendar-list')!;
  container.innerHTML = '';
  for (const cal of calendars) {
    const div = document.createElement('div');
    div.className = 'calendar-item';
    div.innerHTML = `
      <input type="checkbox" id="cal-${cal.id}" value="${cal.id}" checked>
      <label for="cal-${cal.id}">${escapeHtml(cal.name)}</label>
    `;
    container.appendChild(div);
  }
}

function getSelectedCalendarIds(): number[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>('#calendar-list input[type="checkbox"]:checked'),
  ).map((el) => Number(el.value));
}

// ── 분석 결과 UI ──────────────────────────────────────────────────────────

function renderResults(
  events: NormalizedCalendarEvent[],
  totalFetched: number,
): void {
  // 통계
  const statsEl = document.getElementById('analysis-stats')!;
  const warningCounts: Record<string, number> = {};
  for (const ev of events) {
    for (const w of ev.warnings) {
      warningCounts[w] = (warningCounts[w] ?? 0) + 1;
    }
  }
  statsEl.innerHTML = `
    <div class="stat-row"><span>전체 fetch</span><span>${totalFetched}건</span></div>
    <div class="stat-row"><span>기간 내 이벤트</span><span>${events.length}건</span></div>
    <div class="stat-row"><span>일반 이벤트</span><span>${events.filter((e) => !e.recurrence).length}건</span></div>
    <div class="stat-row"><span>반복 이벤트</span><span>${events.filter((e) => e.recurrence).length}건</span></div>
  `;

  // 경고
  const warningsSection = document.getElementById('warnings-section')!;
  const warningsList = document.getElementById('warnings-list')!;
  const warningEntries = Object.entries(warningCounts);
  if (warningEntries.length > 0) {
    warningsList.innerHTML = warningEntries
      .map(([w, n]) => `<div class="warning-item">${escapeHtml(w)}: ${n}건</div>`)
      .join('');
    warningsSection.removeAttribute('hidden');
  } else {
    warningsSection.setAttribute('hidden', '');
  }

  // 미리보기 (최대 20건)
  const preview = document.getElementById('event-preview')!;
  const sample = events.slice(0, 20);
  if (sample.length === 0) {
    preview.innerHTML = '<p style="color:#6b7280">이벤트가 없습니다.</p>';
  } else {
    preview.innerHTML = sample
      .map(
        (ev) => `
        <div class="event-item">
          <div class="title">${escapeHtml(ev.title)}</div>
          <div class="date">${formatEventDate(ev)} · ${escapeHtml(ev.calendarName)}</div>
        </div>`,
      )
      .join('');
  }

  showState('results');
}

// ── 내보내기 ──────────────────────────────────────────────────────────────

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getSelectedFormat(): 'ics' | 'json' {
  const checked = document.querySelector<HTMLInputElement>('input[name="format"]:checked');
  return (checked?.value ?? 'ics') as 'ics' | 'json';
}

// ── 메인 흐름 ─────────────────────────────────────────────────────────────

let lastNormalized: NormalizedCalendarEvent[] = [];
let lastTotalFetched = 0;

async function loadCalendars(): Promise<void> {
  showState('loading');
  try {
    const res = await sendToContentScript<FetchCalendarsResponse>({ type: 'FETCH_CALENDARS' });
    if (!res.ok) {
      showError(`캘린더 로드 실패: ${res.issues.join(', ')}`);
      return;
    }
    loadedCalendars = res.calendars;
    renderCalendarList(res.calendars);

    // 기본 날짜 범위: 오늘 기준 -1년 ~ +1년
    const now = new Date();
    const fromDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    const toDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    (document.getElementById('date-from') as HTMLInputElement).value = toIsoDate(fromDate);
    (document.getElementById('date-to') as HTMLInputElement).value = toIsoDate(toDate);

    showState('setup');
  } catch (err) {
    showError(`오류: ${errorMessage(err)}`);
  }
}

async function analyzeEvents(): Promise<void> {
  const calendarIds = getSelectedCalendarIds();
  if (calendarIds.length === 0) {
    showError('캘린더를 하나 이상 선택하세요');
    return;
  }
  const range = getDateRangeMs();
  if (!range) {
    showError('유효한 기간을 입력하세요');
    return;
  }

  showState('loading');

  const allRaw: RawTimeTreeEvent[] = [];
  for (const calendarId of calendarIds) {
    try {
      const res = await sendToContentScript<FetchEventsResponse>({
        type: 'FETCH_EVENTS',
        calendarId,
      });
      if (!res.ok) {
        showError(`이벤트 로드 실패 (calendar ${calendarId}): ${res.issues.join(', ')}`);
        return;
      }
      allRaw.push(...res.events);
    } catch (err) {
      showError(`오류: ${errorMessage(err)}`);
      return;
    }
  }

  lastTotalFetched = allRaw.length;

  // normalize + 날짜 필터
  const normalized: NormalizedCalendarEvent[] = [];
  const calendarMap = new Map(loadedCalendars.map((c) => [c.id, c]));
  for (const raw of allRaw) {
    const result = normalizeRawTimeTreeEvent(raw, { calendar: calendarMap.get(raw.calendarId) });
    if (!result.ok) continue;
    const ev = result.value;
    const startMs =
      ev.start.kind === 'date-time'
        ? ev.start.epochMs
        : new Date(ev.start.date + 'T00:00:00').getTime();
    if (startMs >= range.fromMs && startMs <= range.toMs) {
      normalized.push(ev);
    }
  }

  normalized.sort((a, b) => {
    const aMs = a.start.kind === 'date-time' ? a.start.epochMs : new Date(a.start.date).getTime();
    const bMs = b.start.kind === 'date-time' ? b.start.epochMs : new Date(b.start.date).getTime();
    return aMs - bMs;
  });

  lastNormalized = normalized;
  renderResults(normalized, lastTotalFetched);
}

function exportEvents(): void {
  if (lastNormalized.length === 0) {
    showError('내보낼 이벤트가 없습니다');
    return;
  }
  const format = getSelectedFormat();
  const now = new Date();
  const dateStr = toIsoDate(now);

  if (format === 'ics') {
    const ics = createIcsCalendar(lastNormalized, { now });
    downloadFile(ics, `timetree-export-${dateStr}.ics`, 'text/calendar;charset=utf-8');
  } else {
    const json = JSON.stringify(lastNormalized, null, 2);
    downloadFile(json, `timetree-export-${dateStr}.json`, 'application/json');
  }
}

// ── 이벤트 리스너 등록 ────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const onTimetree = await isOnTimetree();
  document.getElementById('panel-not-timetree')?.toggleAttribute('hidden', onTimetree);
  document.getElementById('panel-main')?.toggleAttribute('hidden', !onTimetree);
  if (!onTimetree) return;

  document.getElementById('btn-load-calendars')?.addEventListener('click', () => {
    loadCalendars();
  });

  document.getElementById('btn-analyze')?.addEventListener('click', () => {
    analyzeEvents();
  });

  document.getElementById('btn-export')?.addEventListener('click', () => {
    exportEvents();
  });

  document.getElementById('btn-back')?.addEventListener('click', () => {
    showState('setup');
  });

  document.getElementById('btn-retry')?.addEventListener('click', () => {
    showState('idle');
  });
});

// ── 유틸 ──────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
```

- [ ] **Step 2: typecheck 확인**

```bash
npm run typecheck
```

Expected: 오류 없음.

- [ ] **Step 3: 빌드 확인**

```bash
npm run build
```

Expected: `dist/src/extension/sidepanel.js` 생성됨.

- [ ] **Step 4: commit**

```bash
git add src/extension/sidepanel.ts
git commit -m "feat(extension): SidePanel UI 로직을 추가한다"
```

---

## Task 7: Extension 로드 및 동작 확인

빌드 결과물로 Chrome에서 unpacked extension을 로드하고 동작을 확인한다.

- [ ] **Step 1: 최종 빌드**

```bash
npm run build
```

Expected: 오류 없음, `dist/` 아래 모든 파일 생성.

- [ ] **Step 2: Chrome에 extension 로드**

1. Chrome 주소창에 `chrome://extensions` 입력
2. 우상단 "개발자 모드" 활성화
3. "압축해제된 확장 프로그램을 로드합니다" 클릭
4. **프로젝트 루트 폴더** (`/home/user/timetree-extractor`) 선택
5. "TimeTree Exporter" extension이 목록에 나타나야 함

Expected: 오류 없이 로드됨.

- [ ] **Step 3: TimeTree 페이지에서 동작 확인**

1. `https://timetreeapp.com` 으로 이동 (로그인 상태)
2. 툴바의 TimeTree Exporter 아이콘 클릭
3. SidePanel이 열리며 "캘린더 불러오기" 버튼이 보여야 함
4. 버튼 클릭 → 캘린더 목록과 날짜 범위가 표시되어야 함
5. "분석" 클릭 → 이벤트 수와 미리보기가 표시되어야 함
6. "내보내기 (ICS)" 클릭 → `.ics` 파일 다운로드되어야 함

- [ ] **Step 4: 최종 commit**

```bash
git add -A
git commit -m "feat(extension): Chrome SidePanel extension v0.1.0을 완성한다"
```

---

## Verification Checklist

- [ ] `npm test` — 전체 테스트 통과
- [ ] `npm run typecheck` — 타입 오류 없음
- [ ] `npm run build` — 빌드 성공
- [ ] `dist/src/extension/content-script.js` 존재
- [ ] `dist/src/extension/background.js` 존재
- [ ] `dist/src/extension/sidepanel.js` 존재
- [ ] `manifest.json`에 `sidePanel`, `tabs` 권한 있음
- [ ] content script에 `credentials: 'include'` + `x-timetreea` 헤더 있음
- [ ] SidePanel이 TimeTree 외 페이지에서 "TimeTree 페이지에서 열어주세요" 메시지 표시
- [ ] ICS 다운로드 파일이 Google Calendar에서 임포트 가능

## 알려진 제약

- 이벤트 fetch는 전체를 가져온 뒤 클라이언트 필터링 (서버 측 날짜 범위 필터 없음)
- `x-timetreea: web/2.1.0/en` 버전 문자열이 하드코딩됨 — TimeTree 업데이트 시 갱신 필요
- Chrome 114+ 필요 (SidePanel API)

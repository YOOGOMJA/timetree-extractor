import { render } from 'preact';
import { normalizeRawTimeTreeEvent } from '../core/normalize.js';
import { linkRecurringOverrides } from '../core/recurrence-link.js';
import type { RawTimeTreeCalendar, RawTimeTreeEvent, RawTimeTreeLabel } from '../core/contracts.js';
import type { NormalizedCalendarEvent } from '../core/normalize.js';
import type {
  ExtensionRequest,
  FetchCalendarsResponse,
  FetchEventsResponse,
  FetchLabelsResponse,
} from './message-protocol.js';
import { toIsoDate, errorMessage, isTimetreeUrl } from './sidepanel-utils.js';
import {
  parseDateRange,
  filterEventsByRange,
  decideExport,
} from './sidepanel-export-policy.js';
import { CalendarList } from './components/CalendarList.js';
import { describeWarning } from './warning-copy.js';
import { computeVirtualWindow } from './virtual-window.js';
import { aggregateByCalendar, aggregateByLabel, groupWarnings } from './dashboard-aggregate.js';
import { labelChipColors } from './label-color.js';
import type { ExportHistoryRecord } from './export-history.js';
import { loadHistory, recordExport, clearHistory } from './export-history-store.js';

async function sendToContentScript<T>(request: ExtensionRequest): Promise<T> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('활성 탭을 찾을 수 없습니다');
  const res = await chrome.tabs.sendMessage(tab.id, request) as T | undefined;
  if (res == null) throw new Error('content script에 연결할 수 없습니다. TimeTree 탭을 새로고침하세요');
  return res;
}

async function isOnTimetree(): Promise<boolean> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return isTimetreeUrl(tab?.url);
}

type State = 'idle' | 'loading' | 'setup' | 'results' | 'detail' | 'guide' | 'error';

// 자동 로드 가드(#67): currentState가 idle일 때만 자동 로드를 1회 시도한다.
let currentState: State = 'idle';
let autoLoadAttempted = false;

function showState(state: State): void {
  currentState = state;
  const panels: State[] = ['idle', 'loading', 'setup', 'results', 'detail', 'guide', 'error'];
  for (const s of panels) {
    document.getElementById(`state-${s}`)?.toggleAttribute('hidden', s !== state);
  }
  // idle 화면이 보일 때마다 최근 내보내기 기록을 갱신한다(#69). fire-and-forget.
  if (state === 'idle') void refreshRecentExports();
}

function showError(message: string): void {
  const el = document.getElementById('error-message');
  if (el) el.textContent = message;
  showState('error');
}

function getDateRangeMs(): { fromMs: number; toMs: number } | null {
  const fromVal = (document.getElementById('date-from') as HTMLInputElement).value;
  const toVal = (document.getElementById('date-to') as HTMLInputElement).value;
  return parseDateRange(fromVal, toVal);
}

function formatEventDate(event: NormalizedCalendarEvent): string {
  if (event.start.kind === 'date') return event.start.date;
  // 로케일은 사용자 환경에 위임(undefined) — 하드코딩 'ko-KR' 제거(#70 i18n).
  return new Date(event.start.epochMs).toLocaleString(undefined, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

let loadedCalendars: RawTimeTreeCalendar[] = [];
// 캘린더 선택은 이전엔 DOM(`input:checked`)을 source of truth로 사용했으나, Preact
// 마이그레이션 1단계로 module-level Set이 source of truth가 된다. 다음 모듈에서
// `<SidePanelApp>`으로 hoist 시 컴포넌트 state로 흡수될 예정.
let selectedCalendarIds: Set<number> = new Set();

function rerenderCalendarList(): void {
  const container = document.getElementById('calendar-list');
  if (!container) return;
  render(
    <CalendarList
      calendars={loadedCalendars}
      selected={selectedCalendarIds}
      onToggle={(id, next) => {
        if (next) selectedCalendarIds.add(id);
        else selectedCalendarIds.delete(id);
        rerenderCalendarList();
      }}
    />,
    container,
  );
}

function renderCalendarList(calendars: RawTimeTreeCalendar[]): void {
  // 기존 동작 보존: 캘린더 로드 직후 전부 checked. 이후 토글은 selectedCalendarIds로 추적.
  selectedCalendarIds = new Set(calendars.map((c) => c.id));
  rerenderCalendarList();
}

function getSelectedCalendarIds(): number[] {
  return Array.from(selectedCalendarIds);
}

const DETAIL_ROW_HEIGHT = 48;

function renderResults(
  events: NormalizedCalendarEvent[],
  totalFetched: number,
): void {
  // 충실도 hero: 내보낼 N / 전체 M / 제외 D(드롭+범위밖). no-silent-loss를 한눈에.
  const exportCount = events.length;
  const dropped = Math.max(0, totalFetched - exportCount);
  document.getElementById('fid-export')!.textContent = String(exportCount);
  const subEl = document.getElementById('fid-sub')!;
  subEl.textContent = '';
  subEl.append(`전체 ${totalFetched}건`);
  if (dropped > 0) {
    const span = document.createElement('span');
    span.className = 'dropped';
    span.textContent = `제외 ${dropped}건`;
    subEl.append(' · ', span);
  }
  const ratio = totalFetched > 0 ? Math.round((exportCount / totalFetched) * 100) : 100;
  (document.getElementById('fid-bar') as HTMLElement).style.width = `${ratio}%`;

  // 제외가 있으면 "왜·괜찮은지" 안심 카피(#78 P0-3). 마이그레이터의 불안을 행동가능 정보로.
  const fidNote = document.getElementById('fid-note')!;
  if (dropped > 0) {
    // dropped = 선택 기간 밖 + Google·Apple이 못 읽는 형식(비표준 반복 등) 양쪽을 합친 수.
    // 두 사유를 모두 정직하게 안내한다(codex 리뷰).
    fidNote.textContent = '제외에는 선택한 기간 밖 일정과, Google·Apple 캘린더가 안전하게 읽지 못하는 형식(예: 비표준 반복)이 포함됩니다. 후자는 아래 “발견된 이슈”에서 볼 수 있습니다.';
    fidNote.removeAttribute('hidden');
  } else {
    fidNote.setAttribute('hidden', '');
  }

  renderDashboardSections(events);
  document.getElementById('detail-count')!.textContent = `${exportCount}건`;

  showState('results');
}

// 대시보드 섹션: 캘린더별 집계 · 라벨 카테고리 칩 · 이슈 드릴다운(#75).
let dashboardEvents: NormalizedCalendarEvent[] = [];
const expandedIssues = new Set<string>();

function renderDashboardSections(events: NormalizedCalendarEvent[]): void {
  dashboardEvents = events;

  const calendars = aggregateByCalendar(events);
  const calSection = document.getElementById('cal-section')!;
  const calList = document.getElementById('cal-list')!;
  calSection.toggleAttribute('hidden', calendars.length === 0);
  render(
    <div>
      {calendars.map((c) => (
        <div class="cal-row" key={c.name}>
          <span class="cal-name">{c.name}</span>
          <span class="cal-count">{c.count}건</span>
        </div>
      ))}
    </div>,
    calList,
  );

  const labels = aggregateByLabel(events);
  const labelSection = document.getElementById('label-section')!;
  const labelChips = document.getElementById('label-chips')!;
  labelSection.toggleAttribute('hidden', labels.length === 0);
  render(
    <div class="chips">
      {labels.map((l) => {
        const { bg, fg } = labelChipColors(l.name);
        return (
          <span class="chip" key={l.name} style={`background:${bg};color:${fg}`}>
            {l.name} <span class="chip-count">{l.count}</span>
          </span>
        );
      })}
    </div>,
    labelChips,
  );

  renderIssues();
}

function renderIssues(): void {
  const groups = groupWarnings(dashboardEvents);
  const section = document.getElementById('warnings-section')!;
  const list = document.getElementById('warnings-list')!;
  section.toggleAttribute('hidden', groups.length === 0);
  render(
    <div>
      {groups.map((g) => {
        const { label, hint } = describeWarning(g.code);
        const open = expandedIssues.has(g.code);
        return (
          <div class="issue-row" key={g.code}>
            <button class="issue-toggle" aria-expanded={open} onClick={() => toggleIssue(g.code)}>
              <span class="i-label">{label}</span>
              <span class="i-right"><span class="i-count">{g.events.length}건</span><span>{open ? '▾' : '▸'}</span></span>
            </button>
            {open && (
              <div>
                {hint && <div class="issue-hint">{hint}</div>}
                <div class="issue-events">
                  {g.events.map((e, i) => (
                    <div class="ie" key={i}>{e.title || '(제목 없음)'} · {e.calendarName}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>,
    list,
  );
}

function toggleIssue(code: string): void {
  if (expandedIssues.has(code)) expandedIssues.delete(code);
  else expandedIssues.add(code);
  renderIssues();
}

// --- 상세 목록 (검색 + 가상화) ---
let detailFiltered: NormalizedCalendarEvent[] = [];

function matchesSearch(event: NormalizedCalendarEvent, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return event.title.toLowerCase().includes(q) || event.calendarName.toLowerCase().includes(q);
}

function renderDetailWindow(): void {
  const scroll = document.getElementById('detail-scroll');
  if (!scroll) return;
  if (detailFiltered.length === 0) {
    render(<p class="empty-note">{lastNormalized.length === 0 ? '이벤트가 없습니다.' : '검색 결과가 없습니다.'}</p>, scroll);
    return;
  }
  const win = computeVirtualWindow(scroll.scrollTop, scroll.clientHeight, DETAIL_ROW_HEIGHT, detailFiltered.length);
  const slice = detailFiltered.slice(win.start, win.end);
  render(
    <div style={`padding-top:${win.padTop}px;padding-bottom:${win.padBottom}px`}>
      {slice.map((event, i) => (
        <div class="event-item" style={`height:${DETAIL_ROW_HEIGHT}px`} key={win.start + i}>
          <div class="title">{event.title}</div>
          <div class="date">{formatEventDate(event)} · {event.calendarName}</div>
        </div>
      ))}
    </div>,
    scroll,
  );
}

function openDetail(): void {
  const query = (document.getElementById('event-search') as HTMLInputElement | null)?.value ?? '';
  detailFiltered = lastNormalized.filter((e) => matchesSearch(e, query));
  const head = document.getElementById('detail-count-head');
  if (head) {
    head.textContent = query
      ? `${detailFiltered.length}건 / 전체 ${lastNormalized.length}건`
      : `전체 ${lastNormalized.length}건`;
  }
  showState('detail');
  // detail-scroll은 showState로 막 보이게 됐으므로 clientHeight가 이제 유효하다.
  const scroll = document.getElementById('detail-scroll');
  if (scroll) scroll.scrollTop = 0;
  renderDetailWindow();
}

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

// --- 최근 내보내기 기록 (#69) ---
const historyDateFmt = new Intl.DateTimeFormat(undefined, {
  month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});

function renderRecentExports(records: ExportHistoryRecord[]): void {
  const section = document.getElementById('recent-section');
  const list = document.getElementById('recent-list');
  if (!section || !list) return;
  if (records.length === 0) {
    section.setAttribute('hidden', '');
    render(null, list);
    return;
  }
  section.removeAttribute('hidden');
  render(
    <div>
      {records.map((r, i) => (
        <div class="recent-item" key={i}>
          <div>{historyDateFmt.format(r.at)} · {r.format.toUpperCase()} · {r.exportCount}건</div>
          <div class="meta">캘린더 {r.calendarCount}개 · {r.fromDate} ~ {r.toDate}{r.warningCount > 0 ? ` · 경고 ${r.warningCount}` : ''}</div>
        </div>
      ))}
    </div>,
    list,
  );
}

// historySeq: idle 진입의 fire-and-forget refresh와 clear 후 refresh가 겹칠 때 오래된
// loadHistory 결과가 최신 렌더를 덮어쓰는 레이스를 막는다 — 최신 호출만 반영.
let historySeq = 0;

async function refreshRecentExports(): Promise<void> {
  const seq = ++historySeq;
  const records = await loadHistory();
  if (seq !== historySeq) return; // 더 최신 refresh가 진행 중 — stale 결과 폐기
  renderRecentExports(records);
}

let lastNormalized: NormalizedCalendarEvent[] = [];
let lastTotalFetched = 0;

// silentFallback(#67): 패널 진입 자동 로드에서 실패 시 에러 화면 대신 idle(수동 버튼)로
// 조용히 복귀한다 — 페이지 로딩 중 패널을 여는 흔한 케이스에서 겁주지 않기 위함.
async function loadCalendars(options: { silentFallback?: boolean } = {}): Promise<void> {
  showState('loading');
  try {
    const res = await sendToContentScript<FetchCalendarsResponse>({ type: 'FETCH_CALENDARS' });
    if (!res.ok) {
      if (options.silentFallback) {
        showState('idle');
        return;
      }
      showError(`캘린더 로드 실패: ${res.issues.join(', ')}`);
      return;
    }
    loadedCalendars = res.calendars;
    renderCalendarList(res.calendars);

    const now = new Date();
    const fromDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    const toDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    (document.getElementById('date-from') as HTMLInputElement).value = toIsoDate(fromDate);
    (document.getElementById('date-to') as HTMLInputElement).value = toIsoDate(toDate);

    showState('setup');
  } catch (err) {
    if (options.silentFallback) {
      showState('idle');
      return;
    }
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
  const labelMap = new Map<number, RawTimeTreeLabel[]>();
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

    // 라벨 fetch는 soft fallback: 실패해도 export를 막지 않고 해당 캘린더만 빈 라벨로 진행.
    try {
      const labelRes = await sendToContentScript<FetchLabelsResponse>({
        type: 'FETCH_LABELS',
        calendarId,
      });
      if (labelRes.ok) {
        labelMap.set(calendarId, labelRes.labels);
      } else {
        console.warn(`라벨 로드 실패 (calendar ${calendarId}); 빈 라벨로 진행`, labelRes.issues);
        labelMap.set(calendarId, []);
      }
    } catch (err) {
      console.warn(`라벨 로드 오류 (calendar ${calendarId}); 빈 라벨로 진행`, errorMessage(err));
      labelMap.set(calendarId, []);
    }
  }

  lastTotalFetched = allRaw.length;

  const normalizedAll: NormalizedCalendarEvent[] = [];
  const calendarMap = new Map(loadedCalendars.map((c) => [c.id, c]));
  for (const raw of allRaw) {
    if (raw.deactivatedAt != null) continue;
    const result = normalizeRawTimeTreeEvent(raw, {
      calendar: calendarMap.get(raw.calendarId),
      labels: labelMap.get(raw.calendarId) ?? [],
    });
    if (!result.ok) continue;
    normalizedAll.push(result.value);
  }

  const normalized = linkRecurringOverrides(filterEventsByRange(normalizedAll, range));
  normalized.sort((a, b) => {
    const aMs = a.start.kind === 'date-time' ? a.start.epochMs : new Date(`${a.start.date}T00:00:00`).getTime();
    const bMs = b.start.kind === 'date-time' ? b.start.epochMs : new Date(`${b.start.date}T00:00:00`).getTime();
    return aMs - bMs;
  });

  lastNormalized = normalized;
  renderResults(normalized, lastTotalFetched);
}

function openWarningModal(): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = document.getElementById('warning-modal') as HTMLDialogElement | null;
    const checkbox = document.getElementById('warning-consent') as HTMLInputElement | null;
    const confirmBtn = document.getElementById('btn-warning-confirm') as HTMLButtonElement | null;
    const cancelBtn = document.getElementById('btn-warning-cancel') as HTMLButtonElement | null;
    if (!dialog || !checkbox || !confirmBtn || !cancelBtn) {
      resolve(false);
      return;
    }

    checkbox.checked = false;
    confirmBtn.disabled = true;

    const onChange = () => {
      confirmBtn.disabled = !checkbox.checked;
    };
    const cleanup = () => {
      checkbox.removeEventListener('change', onChange);
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      dialog.removeEventListener('cancel', onCancel);
      dialog.close();
    };
    const onConfirm = () => {
      const consented = checkbox.checked;
      cleanup();
      resolve(consented);
    };
    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    checkbox.addEventListener('change', onChange);
    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    // <dialog>는 Esc로도 닫히며 이때 cancel 이벤트만 발생한다. 핸들러가 없으면
    // promise가 pending으로 남아 리스너가 누수되고 다음 export에서 중복 호출된다.
    dialog.addEventListener('cancel', onCancel);
    dialog.showModal();
  });
}

async function exportEvents(): Promise<void> {
  if (lastNormalized.length === 0) {
    showError('내보낼 이벤트가 없습니다');
    return;
  }

  // format을 export 시작 시점에 snapshot한다 — 이후 await(동의 모달·기록) 동안 사용자가
  // radio를 바꿔도 저장 파일·기록·가이드 분기가 일관되도록(codex 리뷰).
  const format = getSelectedFormat();
  const consent = await openWarningModal();

  const decision = decideExport({
    consent,
    events: lastNormalized,
    format,
    now: new Date(),
  });

  if (!decision.allowed) {
    if (decision.reason === 'no-consent') {
      return; // 사용자가 동의하지 않음 — 조용히 종료
    }
    showError('내보낼 이벤트가 없습니다');
    return;
  }

  downloadFile(decision.content, decision.filename, decision.mimeType);

  // 메타데이터만 기록(#69) — 이벤트 내용·캘린더 이름·토큰·raw 응답은 저장하지 않는다.
  const calendarCount = loadedCalendars.filter((c) => selectedCalendarIds.has(c.id)).length;
  const warningTotal = lastNormalized.reduce((sum, e) => sum + e.warnings.length, 0);
  await recordExport({
    at: Date.now(),
    calendarCount,
    fromDate: (document.getElementById('date-from') as HTMLInputElement | null)?.value ?? '',
    toDate: (document.getElementById('date-to') as HTMLInputElement | null)?.value ?? '',
    format,
    exportCount: lastNormalized.length,
    warningCount: warningTotal,
    filename: decision.filename,
  });

  // 마이그레이션 마지막 1마일(#78): ICS는 캘린더 앱에 가져와야 잡이 끝난다 → 가져오기 가이드.
  // JSON은 캘린더 import 대상이 아니므로 대시보드에 머문다.
  if (format === 'ics') {
    document.getElementById('guide-file')!.textContent = decision.filename;
    showState('guide');
  }
}

// 활성 탭 기준으로 TimeTree 여부를 재평가해 패널을 토글한다(#67). panel-main 내부의
// state-* 는 건드리지 않으므로, TimeTree를 떠났다 돌아와도 진행 상태가 보존된다.
// TimeTree이고 아직 아무것도 안 한 상태(idle)면 캘린더를 1회 자동 로드한다 —
// 패널을 연 것 자체가 사용자 액션이므로 background polling이 아니다.
//
// refreshSeq: onActivated/onUpdated/초기 호출이 겹칠 때 오래된 tabs.query 결과가
// 늦게 resolve되어 최신 패널 상태를 덮어쓰는 레이스를 막는다 — 최신 호출만 DOM에 반영.
let refreshSeq = 0;

async function refreshPanelForActiveTab(): Promise<void> {
  const seq = ++refreshSeq;
  let onTimetree = false;
  try {
    onTimetree = await isOnTimetree();
  } catch {
    // 탭 정보를 가져올 수 없는 경우 TimeTree 외 페이지로 간주
  }
  if (seq !== refreshSeq) return; // 더 최신 refresh가 진행 중 — stale 결과 폐기
  document.getElementById('panel-not-timetree')?.toggleAttribute('hidden', onTimetree);
  document.getElementById('panel-main')?.toggleAttribute('hidden', !onTimetree);

  if (onTimetree && currentState === 'idle' && !autoLoadAttempted) {
    autoLoadAttempted = true;
    await loadCalendars({ silentFallback: true });
    // url-change 이벤트는 content script 주입 전에 올 수 있다. 그때 silent 실패하면
    // 가드를 되돌려 이후 status==='complete' 이벤트에서 재시도하게 한다.
    // (시도는 탭 이벤트당 최대 1회이므로 루프 없음.)
    if (currentState === 'idle') autoLoadAttempted = false;
  }
}

// 기존 TimeTree 탭이 있으면 포커스, 없으면 새 탭으로 연다(#67). 이동이 완료되면
// onUpdated/onActivated 리스너가 패널을 자동 전환한다.
async function openTimetreeTab(): Promise<void> {
  try {
    const existing = await chrome.tabs.query({ url: 'https://timetreeapp.com/*' });
    const tab = existing[0];
    if (tab?.id != null) {
      await chrome.tabs.update(tab.id, { active: true });
      if (tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true });
      return;
    }
    await chrome.tabs.create({ url: 'https://timetreeapp.com/calendars' });
  } catch {
    // 탭 제어 실패 시 조용히 무시 — 사용자가 직접 이동하면 리스너가 처리한다.
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // 버튼 리스너는 TimeTree 여부와 무관하게 항상 연결한다 — 이전 구조는 비-TimeTree에서
  // early return해 패널이 세션 내내 죽는 버그가 있었다(#67).
  document.getElementById('btn-open-timetree')?.addEventListener('click', () => {
    openTimetreeTab();
  });

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
    lastNormalized = [];
    lastTotalFetched = 0;
    showState('setup');
  });

  document.getElementById('btn-detail')?.addEventListener('click', () => {
    openDetail();
  });

  document.getElementById('btn-detail-back')?.addEventListener('click', () => {
    showState('results');
  });

  document.getElementById('btn-guide-back')?.addEventListener('click', () => {
    showState('results');
  });

  document.getElementById('btn-guide-home')?.addEventListener('click', () => {
    lastNormalized = [];
    lastTotalFetched = 0;
    showState('idle');
  });

  document.getElementById('event-search')?.addEventListener('input', () => {
    openDetail();
  });

  document.getElementById('detail-scroll')?.addEventListener('scroll', () => {
    renderDetailWindow();
  });

  document.getElementById('btn-retry')?.addEventListener('click', () => {
    lastNormalized = [];
    lastTotalFetched = 0;
    showState('idle');
  });

  document.getElementById('btn-clear-history')?.addEventListener('click', async () => {
    await clearHistory();
    refreshRecentExports();
  });

  void refreshRecentExports(); // 기본 idle 화면에 최근 기록 1회 렌더

  chrome.tabs.onActivated.addListener(() => {
    refreshPanelForActiveTab();
  });
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    if (changeInfo.url != null || changeInfo.status === 'complete') {
      refreshPanelForActiveTab();
    }
  });

  refreshPanelForActiveTab();
});


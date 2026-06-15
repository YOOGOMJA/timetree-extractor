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
  filterEventsByRange,
  decideExport,
  resolveRangeMode,
} from './sidepanel-export-policy.js';
import { CalendarList } from './components/CalendarList.js';
import { describeWarning } from './warning-copy.js';
import { describeFetchFailure, classifyFetchIssues } from './fetch-failure-copy.js';
import { computeVirtualWindow } from './virtual-window.js';
import { aggregateByCalendar, aggregateByLabel, groupWarnings, aggregateContentSignals } from './dashboard-aggregate.js';
import { formatEventMeta } from './event-meta.js';
import { classifyNormalizeFailure, summarizeFidelity, partialFailureMessage, type FidelityCounts, type FidelityKey } from './fidelity.js';
import { countSharedCalendars } from './calendar-meta.js';
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

// 오류 화면에서 "다시 시도"가 실행할 동작(#113 J4). idle 리셋 대신 컨텍스트 보존 재시도.
let retryAction: (() => void) | null = null;

function showError(message: string): void {
  const el = document.getElementById('error-message');
  if (el) el.textContent = message;
  // 일반 오류는 재로그인 버튼 숨김.
  document.getElementById('btn-relogin')?.setAttribute('hidden', '');
  showState('error');
}

// fetch 실패 전용 오류 화면(#113): auth(로그인 만료)면 전용 카피 + 재로그인 버튼.
// onRetry는 컨텍스트(선택 캘린더·기간)를 보존한 재시도 — idle 리셋이 아니다.
function showFetchError(kind: ReturnType<typeof classifyFetchIssues>, issues: string[], onRetry: () => void): void {
  retryAction = onRetry;
  const el = document.getElementById('error-message');
  if (el) el.textContent = describeFetchFailure(kind, issues).title;
  document.getElementById('btn-relogin')?.toggleAttribute('hidden', kind !== 'auth');
  showState('error');
}

// 로딩 화면 진행 텍스트(#111). stage=무엇을 기다리는지, progress=얼마나.
function setLoadingProgress(stage: string, progress = ''): void {
  const s = document.getElementById('load-stage');
  const p = document.getElementById('load-progress');
  if (s) s.textContent = stage;
  if (p) p.textContent = progress;
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
  // 공유 캘린더 1급화(#111): '공유 N개 포함' 요약. 핵심 가치(가족 일정)를 화면에 드러냄.
  const sharedCount = countSharedCalendars(calendars);
  const summary = document.getElementById('share-summary');
  if (summary) {
    summary.innerHTML = sharedCount > 0 ? `<b>공유 ${sharedCount}개</b> 포함 — 가족·그룹 일정도 함께 내보냅니다` : '';
    summary.toggleAttribute('hidden', sharedCount === 0);
  }
}

function getSelectedCalendarIds(): number[] {
  return Array.from(selectedCalendarIds);
}

const DETAIL_ROW_HEIGHT = 48;

function renderResults(
  events: NormalizedCalendarEvent[],
  counts: Omit<FidelityCounts, 'totalFetched'> & { totalFetched: number },
): void {
  // 충실도 회계(#114): 제외를 한 숫자로 합치지 않고 기간밖/형식/처리실패로 분해.
  // normalize 실패(형식·처리)를 명시 카운트해 silent-loss를 없앤다.
  const { totalFetched, exported } = counts;
  const { segments, accountedFor } = summarizeFidelity(counts);
  if (!accountedFor) console.warn('fidelity: 합계 불일치(silent-loss 가능)', counts);
  document.getElementById('fid-export')!.textContent = String(exported);

  // ledger 시각화(#111 F5): 빨강 단색 바 → 중립 트랙 + 사유별 세그먼트 + 4줄 회계.
  const longLabel: Record<FidelityKey, string> = {
    exported: '포함 — 내보낼 일정', rangeExcluded: '기간 밖 — 의도된 제외',
    unsupported: '형식 미지원 — 못 옮김', failed: '처리 실패 — 확인 필요', deactivated: '삭제된 일정 — 제외',
  };
  const bar = document.getElementById('fid-bar')!;
  const tally = document.getElementById('fid-tally')!;
  bar.textContent = '';
  tally.textContent = '';
  for (const seg of segments) {
    const pct = totalFetched > 0 ? (seg.count / totalFetched) * 100 : 0;
    const i = document.createElement('i');
    i.className = `seg-${seg.key}`;
    i.style.width = `${pct}%`;
    bar.append(i);

    const ln = document.createElement('div');
    ln.className = 'tally-ln';
    const mk = document.createElement('span');
    mk.className = `mk seg-${seg.key}`;
    const lb = document.createElement('span');
    lb.className = 'lb';
    lb.textContent = longLabel[seg.key];
    const vl = document.createElement('span');
    vl.className = 'vl';
    vl.textContent = String(seg.count);
    ln.append(mk, lb, vl);
    tally.append(ln);
  }

  // 못 옮긴(형식·처리 실패) 건이 있으면 행동가능 안심 카피(#78·#114).
  const lost = counts.unsupported + counts.failed;
  const fidNote = document.getElementById('fid-note')!;
  if (lost > 0) {
    fidNote.textContent = `못 옮긴 ${lost}건(형식 미지원·처리 실패)은 아래 “발견된 이슈”에서 확인하세요. 기간 밖 제외는 의도된 필터입니다.`;
    fidNote.removeAttribute('hidden');
  } else if (counts.rangeExcluded > 0) {
    fidNote.textContent = '제외는 모두 선택한 기간 밖 일정입니다(형식·처리 손실 없음).';
    fidNote.removeAttribute('hidden');
  } else {
    fidNote.setAttribute('hidden', '');
  }

  renderDashboardSections(events);
  document.getElementById('detail-count')!.textContent = `${exported}건`;

  showState('results');
}

// 대시보드 섹션: 캘린더별 집계 · 라벨 카테고리 칩 · 이슈 드릴다운(#75).
let dashboardEvents: NormalizedCalendarEvent[] = [];
const expandedIssues = new Set<string>();

function renderDashboardSections(events: NormalizedCalendarEvent[]): void {
  dashboardEvents = events;

  // 참가자/첨부 *있는 일정 건수* 신호 (#83). 내용은 안 싣고 개수만.
  const signals = aggregateContentSignals(events);
  const signalEl = document.getElementById('content-signals')!;
  const signalParts: string[] = [];
  if (signals.participants > 0) signalParts.push(`참가자 있는 일정 ${signals.participants}건`);
  if (signals.attachments > 0) signalParts.push(`첨부 있는 일정 ${signals.attachments}건`);
  signalEl.textContent = signalParts.length > 0 ? `${signalParts.join(' · ')} (내용 제외, 개수만)` : '';
  signalEl.toggleAttribute('hidden', signalParts.length === 0);

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
          <div class="date">{formatEventDate(event)} · {event.calendarName}{formatEventMeta(event) ? ` · ${formatEventMeta(event)}` : ''}</div>
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
        // 재방문(#115): 클릭하면 그때 기간으로 setup을 연다. 캘린더는 데이터 최소화로
        // 개수만 저장돼(ids 없음) 복원 불가 — 기간만 프리필하고 캘린더는 다시 고른다.
        <div
          class="recent-item recent-reuse"
          key={i}
          role="button"
          tabIndex={0}
          title="이 기간으로 다시 시작"
          onClick={() => { void reuseExport(r); }}
          onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void reuseExport(r); } }}
        >
          <div>{historyDateFmt.format(r.at)} · {r.format.toUpperCase()} · {r.exportCount}건</div>
          <div class="meta">캘린더 {r.calendarCount}개 · {r.fromDate || '전체'} ~ {r.toDate || '전체'}{r.warningCount > 0 ? ` · 경고 ${r.warningCount}` : ''}</div>
        </div>
      ))}
    </div>,
    list,
  );
}

// 최근 내보내기 재사용(#115): 캘린더가 없으면 로드 후 setup으로, 그때 기간을 복원.
async function reuseExport(record: ExportHistoryRecord): Promise<void> {
  if (loadedCalendars.length === 0) {
    await loadCalendars(); // 성공 시 setup으로 전환 + 기본 프리필
  } else {
    showState('setup');
  }
  applyRangeToSetup(record.fromDate, record.toDate);
}

// 기록의 기간을 setup 입력에 적용. 둘 다 비었으면(전체 기간) 체크 ON, 아니면 날짜 복원.
function applyRangeToSetup(fromDate: string, toDate: string): void {
  const all = document.getElementById('range-all') as HTMLInputElement | null;
  const from = document.getElementById('date-from') as HTMLInputElement | null;
  const to = document.getElementById('date-to') as HTMLInputElement | null;
  const isFull = !fromDate && !toDate;
  if (all) all.checked = isFull;
  if (from) { from.disabled = isFull; if (!isFull) from.value = fromDate; }
  if (to) { to.disabled = isFull; if (!isFull) to.value = toDate; }
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
  setLoadingProgress('캘린더 목록 불러오는 중…');
  try {
    const res = await sendToContentScript<FetchCalendarsResponse>({ type: 'FETCH_CALENDARS' });
    if (!res.ok) {
      if (options.silentFallback) {
        showState('idle');
        return;
      }
      console.warn('캘린더 로드 실패:', res.issues.join(', '));
      showFetchError(classifyFetchIssues(res.issues), res.issues, () => { void loadCalendars(); });
      return;
    }
    loadedCalendars = res.calendars;
    renderCalendarList(res.calendars);

    const now = new Date();
    const fromDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    const toDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    (document.getElementById('date-from') as HTMLInputElement).value = toIsoDate(fromDate);
    (document.getElementById('date-to') as HTMLInputElement).value = toIsoDate(toDate);

    // 전체 기간이 기본(#84) — 체크 ON + 날짜 입력 비활성으로 동기화.
    const rangeAll = document.getElementById('range-all') as HTMLInputElement | null;
    if (rangeAll) rangeAll.checked = true;
    (document.getElementById('date-from') as HTMLInputElement).disabled = true;
    (document.getElementById('date-to') as HTMLInputElement).disabled = true;

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
  const fullMode = (document.getElementById('range-all') as HTMLInputElement | null)?.checked ?? true;
  const fromVal = (document.getElementById('date-from') as HTMLInputElement | null)?.value ?? '';
  const toVal = (document.getElementById('date-to') as HTMLInputElement | null)?.value ?? '';
  const rangeMode = resolveRangeMode(fullMode, fromVal, toVal);
  if (rangeMode.kind === 'invalid') {
    showError('유효한 기간을 입력하세요');
    return;
  }

  showState('loading');
  setLoadingProgress('일정 수집·분석 중', `캘린더 ${calendarIds.length}개 준비 중…`);

  const allRaw: RawTimeTreeEvent[] = [];
  const labelMap = new Map<number, RawTimeTreeLabel[]>();
  // 캘린더별 부분 실패를 수집해 성공분으로 계속한다(#112). 이벤트 fetch만 hard-fail이던
  // 비대칭(라벨은 이미 soft-fallback)을 해소 — no-silent-loss 정신과 정합.
  const failedCalendars: { calendarId: number; kind: ReturnType<typeof classifyFetchIssues> }[] = [];
  let calIndex = 0;
  for (const calendarId of calendarIds) {
    calIndex += 1;
    // 진행감(#111): 다중 캘린더 전량 fetch는 오래 걸려 '멈춘 듯' 보일 수 있다.
    setLoadingProgress('일정 수집·분석 중', `캘린더 ${calendarIds.length}개 중 ${calIndex}개 · ${allRaw.length}건 수집됨`);
    try {
      const res = await sendToContentScript<FetchEventsResponse>({
        type: 'FETCH_EVENTS',
        calendarId,
      });
      if (!res.ok) {
        console.warn(`이벤트 로드 실패 calendar ${calendarId}:`, res.issues.join(', '));
        failedCalendars.push({ calendarId, kind: classifyFetchIssues(res.issues) });
        continue;
      }
      allRaw.push(...res.events);
    } catch (err) {
      console.warn(`이벤트 로드 오류(transient) calendar ${calendarId}:`, errorMessage(err));
      failedCalendars.push({ calendarId, kind: 'transient' });
      continue;
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

  // 전부 실패면 보여줄 게 없으니 오류 화면. 우선순위 auth > contract > transient.
  if (allRaw.length === 0 && failedCalendars.length > 0) {
    const kinds = failedCalendars.map((f) => f.kind);
    const kind = kinds.includes('auth') ? 'auth' : kinds.includes('contract') ? 'contract' : 'transient';
    showFetchError(kind, [], () => { void analyzeEvents(); }); // 컨텍스트 보존 재시도(#113)
    return;
  }

  lastTotalFetched = allRaw.length;

  // no-silent-loss 회계(#114): 모든 수집분을 분류해 센다. 특히 normalize 실패는
  // 과거에 어느 집계에도 안 잡혔다(silent loss) — 형식 미지원/처리 실패로 명시 카운트.
  const normalizedAll: NormalizedCalendarEvent[] = [];
  const calendarMap = new Map(loadedCalendars.map((c) => [c.id, c]));
  let deactivated = 0, unsupported = 0, failed = 0;
  for (const raw of allRaw) {
    if (raw.deactivatedAt != null) { deactivated += 1; continue; }
    const result = normalizeRawTimeTreeEvent(raw, {
      calendar: calendarMap.get(raw.calendarId),
      labels: labelMap.get(raw.calendarId) ?? [],
    });
    if (!result.ok) {
      if (classifyNormalizeFailure(result.issues) === 'unsupported') unsupported += 1;
      else failed += 1;
      continue;
    }
    normalizedAll.push(result.value);
  }

  const ranged = rangeMode.kind === 'range'
    ? filterEventsByRange(normalizedAll, rangeMode.range)
    : normalizedAll;
  const rangeExcluded = normalizedAll.length - ranged.length;
  const normalized = linkRecurringOverrides(ranged);
  normalized.sort((a, b) => {
    const aMs = a.start.kind === 'date-time' ? a.start.epochMs : new Date(`${a.start.date}T00:00:00`).getTime();
    const bMs = b.start.kind === 'date-time' ? b.start.epochMs : new Date(`${b.start.date}T00:00:00`).getTime();
    return aMs - bMs;
  });

  // 부분 실패 배너(#112): 일부 캘린더만 실패했을 때 성공분과 함께 투명 표기.
  const banner = document.getElementById('partial-banner')!;
  const bannerMsg = partialFailureMessage(failedCalendars.length, calendarIds.length);
  banner.textContent = bannerMsg;
  banner.toggleAttribute('hidden', bannerMsg === '');

  lastNormalized = normalized;
  renderResults(normalized, {
    totalFetched: lastTotalFetched,
    exported: normalized.length,
    rangeExcluded,
    unsupported,
    failed,
    deactivated,
  });
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
    fromDate: (document.getElementById('range-all') as HTMLInputElement | null)?.checked
      ? ''
      : (document.getElementById('date-from') as HTMLInputElement | null)?.value ?? '',
    toDate: (document.getElementById('range-all') as HTMLInputElement | null)?.checked
      ? ''
      : (document.getElementById('date-to') as HTMLInputElement | null)?.value ?? '',
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

  document.getElementById('range-all')?.addEventListener('change', (e) => {
    const on = (e.target as HTMLInputElement).checked;
    for (const id of ['date-from', 'date-to']) {
      (document.getElementById(id) as HTMLInputElement | null)?.toggleAttribute('disabled', on);
    }
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
    // 컨텍스트 보존 재시도(#113 J4): 마지막 실패한 동작을 그대로 다시. 없으면 idle.
    if (retryAction) {
      const action = retryAction;
      retryAction = null;
      action();
      return;
    }
    lastNormalized = [];
    lastTotalFetched = 0;
    showState('idle');
  });

  document.getElementById('btn-relogin')?.addEventListener('click', () => {
    openTimetreeTab(); // TimeTree 탭으로 보내 재로그인(#113 J3). 이후 "다시 시도"로 이어감.
  });

  // 파괴적 동작은 한 번 더 눌러 확인(#104). 3초 안에 다시 누르면 실제 삭제.
  let clearArmed = false;
  let clearTimer: ReturnType<typeof setTimeout> | undefined;
  document.getElementById('btn-clear-history')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    if (!clearArmed) {
      clearArmed = true;
      btn.textContent = '한 번 더 누르면 삭제';
      clearTimer = setTimeout(() => { clearArmed = false; btn.textContent = '기록 지우기'; }, 3000);
      return;
    }
    clearTimeout(clearTimer);
    clearArmed = false;
    btn.textContent = '기록 지우기';
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


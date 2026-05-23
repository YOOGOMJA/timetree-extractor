import { normalizeRawTimeTreeEvent } from '../core/normalize.js';
import { createIcsCalendar } from '../core/ics.js';
import type { RawTimeTreeCalendar, RawTimeTreeEvent, RawTimeTreeLabel } from '../core/contracts.js';
import type { NormalizedCalendarEvent } from '../core/normalize.js';
import type {
  ExtensionRequest,
  FetchCalendarsResponse,
  FetchEventsResponse,
  FetchLabelsResponse,
} from './message-protocol.js';
import { escapeHtml, toIsoDate, errorMessage } from './sidepanel-utils.js';
import { parseDateRange, filterEventsByRange } from './sidepanel-export-policy.js';

async function sendToContentScript<T>(request: ExtensionRequest): Promise<T> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('활성 탭을 찾을 수 없습니다');
  const res = await chrome.tabs.sendMessage(tab.id, request) as T | undefined;
  if (res == null) throw new Error('content script에 연결할 수 없습니다. TimeTree 탭을 새로고침하세요');
  return res;
}

async function isOnTimetree(): Promise<boolean> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return (tab?.url ?? '').startsWith('https://timetreeapp.com');
}

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

function getDateRangeMs(): { fromMs: number; toMs: number } | null {
  const fromVal = (document.getElementById('date-from') as HTMLInputElement).value;
  const toVal = (document.getElementById('date-to') as HTMLInputElement).value;
  return parseDateRange(fromVal, toVal);
}

function formatEventDate(event: NormalizedCalendarEvent): string {
  if (event.start.kind === 'date') return event.start.date;
  return new Date(event.start.epochMs).toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

let loadedCalendars: RawTimeTreeCalendar[] = [];

function renderCalendarList(calendars: RawTimeTreeCalendar[]): void {
  const container = document.getElementById('calendar-list')!;
  container.innerHTML = '';
  for (const cal of calendars) {
    const div = document.createElement('div');
    div.className = 'calendar-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `cal-${cal.id}`;
    checkbox.value = String(cal.id);
    checkbox.checked = true;

    const label = document.createElement('label');
    label.htmlFor = `cal-${cal.id}`;
    label.textContent = cal.name;

    div.appendChild(checkbox);
    div.appendChild(label);
    container.appendChild(div);
  }
}

function getSelectedCalendarIds(): number[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>('#calendar-list input[type="checkbox"]:checked'),
  ).map((el) => Number(el.value));
}

function renderResults(
  events: NormalizedCalendarEvent[],
  totalFetched: number,
): void {
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
          <div class="date">${escapeHtml(formatEventDate(ev))} · ${escapeHtml(ev.calendarName)}</div>
        </div>`,
      )
      .join('');
  }

  showState('results');
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

  const normalized = filterEventsByRange(normalizedAll, range);
  normalized.sort((a, b) => {
    const aMs = a.start.kind === 'date-time' ? a.start.epochMs : new Date(`${a.start.date}T00:00:00`).getTime();
    const bMs = b.start.kind === 'date-time' ? b.start.epochMs : new Date(`${b.start.date}T00:00:00`).getTime();
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

document.addEventListener('DOMContentLoaded', async () => {
  let onTimetree = false;
  try {
    onTimetree = await isOnTimetree();
  } catch {
    // 탭 정보를 가져올 수 없는 경우 TimeTree 외 페이지로 간주
  }
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
    lastNormalized = [];
    lastTotalFetched = 0;
    showState('setup');
  });

  document.getElementById('btn-retry')?.addEventListener('click', () => {
    lastNormalized = [];
    lastTotalFetched = 0;
    showState('idle');
  });
});


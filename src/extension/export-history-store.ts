// chrome.storage.local glue for 내보내기 기록 (#69). 로컬 전용 — 외부 전송 없음.
// pure 로직(prepend/cap)은 export-history.ts. 손상/부재 시 빈 배열로 안전 복구한다.
import { prependRecord, type ExportHistoryRecord } from './export-history.js';

const HISTORY_KEY = 'timetree-export-history';

function isRecord(value: unknown): value is ExportHistoryRecord {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.at === 'number' &&
    Array.isArray(r.calendars) &&
    typeof r.fromDate === 'string' &&
    typeof r.toDate === 'string' &&
    (r.format === 'ics' || r.format === 'json') &&
    typeof r.exportCount === 'number' &&
    typeof r.warningCount === 'number' &&
    typeof r.filename === 'string'
  );
}

export async function loadHistory(): Promise<ExportHistoryRecord[]> {
  try {
    const stored = await chrome.storage.local.get(HISTORY_KEY);
    const raw = stored[HISTORY_KEY];
    if (!Array.isArray(raw)) return [];
    return raw.filter(isRecord);
  } catch {
    return [];
  }
}

export async function recordExport(record: ExportHistoryRecord): Promise<void> {
  try {
    const existing = await loadHistory();
    await chrome.storage.local.set({ [HISTORY_KEY]: prependRecord(existing, record) });
  } catch {
    // 기록 실패는 export 자체에 영향 없음 — 조용히 무시.
  }
}

export async function clearHistory(): Promise<void> {
  try {
    await chrome.storage.local.remove(HISTORY_KEY);
  } catch {
    // noop
  }
}

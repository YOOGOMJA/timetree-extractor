// 내보내기 기록(메타데이터만). 이벤트 내용·토큰·raw 응답은 저장하지 않는다 (#69, privacy 스펙).
// 저장 I/O는 export-history-store.ts(chrome.storage glue)가 담당하고, 여기엔 pure 로직만 둔다.

export type ExportHistoryRecord = {
  at: number; // epoch ms
  calendarCount: number; // 선택 캘린더 수 (이름은 저장하지 않음 — 데이터 최소화)
  fromDate: string; // YYYY-MM-DD
  toDate: string;
  format: 'ics' | 'json';
  exportCount: number;
  warningCount: number;
  filename: string;
};

export const HISTORY_MAX = 20;

// 새 record를 맨 앞에 추가하고 상한 초과분을 절단한다. 입력은 비변형(새 배열 반환).
export function prependRecord(
  records: ExportHistoryRecord[],
  record: ExportHistoryRecord,
  max = HISTORY_MAX,
): ExportHistoryRecord[] {
  return [record, ...records].slice(0, max);
}

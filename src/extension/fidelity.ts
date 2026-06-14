// 충실도 회계(#114). 수집한 모든 일정이 "어느 칸엔가" 잡히는지 분해한다.
// 기존엔 dropped = total - exported 한 숫자로 합쳐, normalize 실패 건이 어느
// 집계에도 안 잡히는 silent-loss 사각지대가 있었다 — 이를 명시 카운트한다. pure.

export type FidelityCounts = {
  totalFetched: number;
  deactivated: number;   // 삭제된(deactivated) 일정
  unsupported: number;   // 형식 미지원(비표준 반복 등) — normalize 실패 중 recurrence 사유
  failed: number;        // 처리 실패 — 그 외 normalize 실패
  rangeExcluded: number; // 선택한 기간 밖
  exported: number;      // 최종 내보내기
};

export type FidelityKey = 'exported' | 'rangeExcluded' | 'unsupported' | 'failed' | 'deactivated';
export type FidelitySegment = { key: FidelityKey; label: string; count: number };

const LABELS: Record<FidelityKey, string> = {
  exported: '포함 — 내보낼 일정',
  rangeExcluded: '기간 밖 — 의도된 제외',
  unsupported: '형식 미지원 — 못 옮김',
  failed: '처리 실패 — 확인 필요',
  deactivated: '삭제된 일정 — 제외',
};

// normalize 실패 사유를 분류: recurrence 관련이면 형식 미지원, 그 외 처리 실패.
export function classifyNormalizeFailure(issues: string[]): 'unsupported' | 'failed' {
  return issues.some((issue) => /recurrence/i.test(issue)) ? 'unsupported' : 'failed';
}

const ORDER: FidelityKey[] = ['exported', 'rangeExcluded', 'unsupported', 'failed', 'deactivated'];

// 0이 아닌 칸만 라벨과 함께. accountedFor = 모든 수집분이 빠짐없이 분류됐는지(no-silent-loss invariant).
export function summarizeFidelity(c: FidelityCounts): { segments: FidelitySegment[]; accountedFor: boolean } {
  const segments = ORDER.map((key) => ({ key, label: LABELS[key], count: c[key] })).filter((s) => s.count > 0);
  const sum = c.exported + c.rangeExcluded + c.unsupported + c.failed + c.deactivated;
  return { segments, accountedFor: sum === c.totalFetched };
}

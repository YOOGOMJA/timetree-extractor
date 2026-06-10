// 고정행 리스트 가상화의 윈도 계산 (#68). 큰 이벤트 목록(수백 건)을 전부 DOM에 그리지
// 않고, 보이는 범위 + overscan만 렌더하기 위한 pure 함수. DOM 글루는 컴포넌트가 담당.

export type VirtualWindow = {
  start: number; // 렌더 시작 인덱스(포함)
  end: number; // 렌더 끝 인덱스(미포함)
  padTop: number; // 위 spacer 높이(px)
  padBottom: number; // 아래 spacer 높이(px)
};

export function computeVirtualWindow(
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  count: number,
  overscan = 4,
): VirtualWindow {
  if (count <= 0 || rowHeight <= 0) {
    return { start: 0, end: 0, padTop: 0, padBottom: 0 };
  }
  const firstVisible = Math.floor(Math.max(0, scrollTop) / rowHeight);
  const visibleRows = Math.ceil(viewportHeight / rowHeight);
  const start = Math.max(0, firstVisible - overscan);
  const end = Math.min(count, firstVisible + visibleRows + overscan);
  return {
    start,
    end,
    padTop: start * rowHeight,
    padBottom: (count - end) * rowHeight,
  };
}

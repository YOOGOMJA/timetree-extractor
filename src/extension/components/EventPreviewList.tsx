import type { VNode } from 'preact';
import type { NormalizedCalendarEvent } from '../../core/normalize.js';

export type EventPreviewListProps = {
  /**
   * 표시할 정규화 이벤트 배열. 호출 측에서 이미 `slice(0, 20)` 등 상한을 적용해 전달한다.
   * 컴포넌트는 자체적으로 자르지 않는다 — 책임 분리.
   */
  events: NormalizedCalendarEvent[];
  /**
   * 이벤트 1건의 표시용 날짜 문자열을 만드는 함수. props 주입 방식을 채택한 이유:
   * - testability: 컴포넌트를 jsdom 없이 호출자 측 stub으로 검증 가능.
   * - sidepanel.tsx 내부의 `formatEventDate`는 module-private 헬퍼라 export 하면 surface 확장.
   */
  formatDate: (event: NormalizedCalendarEvent) => string;
};

/**
 * 이벤트 미리보기 리스트.
 *
 * - 0건이면 placeholder 문구만 렌더. (현재 inline style `color:#6b7280`는 토큰화 라운드 책임이므로 유지)
 * - DOM: 기존 `renderResults` 내 event-preview 영역의 `.event-item > .title + .date` 패턴 1:1 유지.
 * - escape: Preact가 자식 텍스트를 자동 escape 하므로 `escapeHtml` 수동 호출 불필요.
 * - Preact는 React 식/HTML 식 attribute 모두 받지만, `<CalendarList>` 와 동일하게 `class` 채택.
 */
export function EventPreviewList({ events, formatDate }: EventPreviewListProps): VNode {
  if (events.length === 0) {
    // inline style은 토큰화 라운드에서 var(--color-fg-muted)로 치환 예정.
    return <p style="color:#6b7280">이벤트가 없습니다.</p>;
  }
  return (
    <div>
      {events.map((event, idx) => (
        // key: NormalizedCalendarEvent에 안정적인 id 필드가 보장되지 않으므로 인덱스 fallback.
        // 호출자가 slice(0, 20) 후 sort된 결과를 전달하므로 같은 입력에 대해 순서 결정적.
        <div class="event-item" key={idx}>
          <div class="title">{event.title}</div>
          <div class="date">
            {formatDate(event)} · {event.calendarName}
          </div>
        </div>
      ))}
    </div>
  );
}

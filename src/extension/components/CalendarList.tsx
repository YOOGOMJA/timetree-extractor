import type { VNode } from 'preact';
import type { RawTimeTreeCalendar } from '../../core/contracts.js';
import { calendarBadge } from '../calendar-meta.js';

export type CalendarListProps = {
  calendars: RawTimeTreeCalendar[];
  selected: ReadonlySet<number>;
  onToggle: (id: number, next: boolean) => void;
};

/**
 * 캘린더 선택 리스트.
 *
 * - DOM: 기존 `renderCalendarList` 가 만들던 `.calendar-item > input[type=checkbox] + label` 구조 1:1 유지.
 * - 접근성: `<label htmlFor={cal-${id}}>` 로 checkbox와 명시적으로 연결.
 * - escape: Preact가 자식 텍스트를 자동 escape 하므로 `escapeHtml` 수동 호출 불필요.
 * - Preact는 React 식 `className`/`htmlFor` 와 HTML 식 `class`/`for` 를 모두 받지만,
 *   기존 vanilla CSS selector(`.calendar-item`)와 정합성을 위해 `class` 를 쓴다.
 */
export function CalendarList({ calendars, selected, onToggle }: CalendarListProps): VNode {
  return (
    <div>
      {calendars.map((cal) => {
        const inputId = `cal-${cal.id}`;
        const badge = calendarBadge(cal.purpose);
        return (
          <div class="calendar-item" key={cal.id}>
            <input
              type="checkbox"
              id={inputId}
              value={String(cal.id)}
              checked={selected.has(cal.id)}
              onChange={(event) => {
                const target = event.currentTarget as HTMLInputElement;
                onToggle(cal.id, target.checked);
              }}
            />
            <label for={inputId}>{cal.name}</label>
            <span class={badge.shared ? 'cal-badge cal-badge-share' : 'cal-badge cal-badge-self'}>{badge.label}</span>
          </div>
        );
      })}
    </div>
  );
}

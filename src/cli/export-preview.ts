import { createIcsCalendar } from '../core/ics.js';
import {
  normalizeRawTimeTreeEvent,
  type NormalizationContext,
  type NormalizedCalendarEvent,
} from '../core/normalize.js';
import { linkRecurringOverrides } from '../core/recurrence-link.js';

export type ExportPreviewSummary = {
  eventCount: number;
  normalizedCount: number;
  icsLineCount: number;
  veventCount: number;
  hasDtStart: boolean;
  hasDtEnd: boolean;
  hasRRule: boolean;
  warningCounts: Record<string, number>;
};

export type CreateExportPreviewInput = {
  rawEvents: unknown[];
  context?: NormalizationContext;
  now?: Date;
};

export function createExportPreview(input: CreateExportPreviewInput): ExportPreviewSummary {
  const normalized: NormalizedCalendarEvent[] = [];
  const warningCounts: Record<string, number> = {};

  for (const raw of input.rawEvents) {
    const result = normalizeRawTimeTreeEvent(raw, input.context);
    if (!result.ok) continue;
    normalized.push(result.value);
  }

  const linked = linkRecurringOverrides(normalized);
  for (const event of linked) {
    for (const warning of event.warnings) {
      warningCounts[warning] = (warningCounts[warning] ?? 0) + 1;
    }
  }

  const ics = createIcsCalendar(linked, input.now ? { now: input.now } : {});
  const lines = ics.split('\r\n').filter((line) => line.length > 0);

  return {
    eventCount: input.rawEvents.length,
    normalizedCount: normalized.length,
    icsLineCount: lines.length,
    veventCount: lines.filter((line) => line === 'BEGIN:VEVENT').length,
    hasDtStart: lines.some((line) => line.startsWith('DTSTART')),
    hasDtEnd: lines.some((line) => line.startsWith('DTEND')),
    hasRRule: lines.some((line) => line.startsWith('RRULE:')),
    warningCounts,
  };
}

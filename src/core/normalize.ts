import { validateRawTimeTreeEvent, type RawTimeTreeCalendar, type RawTimeTreeEvent, type RawTimeTreeLabel } from './contracts.js';

export const NORMALIZATION_WARNING_VALUES = [
  'timezone-missing',
  'recurrence-unsupported',
  'attachment-omitted',
  'comment-omitted',
  'participant-omitted',
  'label-color-approximation',
  'title-empty',
] as const;

export type NormalizationWarning = (typeof NORMALIZATION_WARNING_VALUES)[number];

export type NormalizedDateTime =
  | { kind: 'date'; date: string }
  | { kind: 'date-time'; epochMs: number; timezone: string };

export type NormalizedRecurrence = {
  rrule?: string[];
  rdate?: string[];
  exrule?: string[];
  exdate?: string[];
};

export type NormalizedCalendarEvent = {
  uid: string;
  calendarName: string;
  title: string;
  description?: string;
  location?: string;
  url?: string;
  start: NormalizedDateTime;
  end: NormalizedDateTime;
  recurrence?: NormalizedRecurrence;
  labels?: string[];
  source: {
    provider: 'timetree';
    eventId: string;
    calendarId: number;
    originalUrl?: string;
  };
  warnings: NormalizationWarning[];
};

export type NormalizationContext = {
  calendar?: RawTimeTreeCalendar;
  labels?: RawTimeTreeLabel[];
};

export type NormalizationResult =
  | { ok: true; value: NormalizedCalendarEvent; issues: [] }
  | { ok: false; value: undefined; issues: string[] };

export function normalizeRawTimeTreeEvent(rawEvent: unknown, context: NormalizationContext = {}): NormalizationResult {
  const validation = validateRawTimeTreeEvent(rawEvent);
  if (!validation.ok) {
    return { ok: false, value: undefined, issues: validation.issues };
  }

  const event = validation.value;
  const collected = collectWarnings(event);
  const labels = normalizeLabels(event, context.labels ?? []);
  const recurrenceResult = normalizeRecurrences(event.recurrences);
  const warnings = unique([...collected, ...recurrenceResult.warnings]);
  const recurrence = recurrenceResult.recurrence;

  const value: NormalizedCalendarEvent = {
    uid: `timetree:${event.calendarId}:${event.id}`,
    calendarName: context.calendar?.name ?? String(event.calendarId),
    title: normalizeTitle(event.title, warnings),
    start: normalizeStart(event),
    end: normalizeEnd(event),
    source: {
      provider: 'timetree',
      eventId: event.id,
      calendarId: event.calendarId,
    },
    warnings,
  };

  if (event.note) value.description = event.note;
  if (event.location) value.location = event.location;
  if (event.url) value.url = event.url;
  if (labels.length > 0) value.labels = labels;
  if (recurrence) value.recurrence = recurrence;

  return { ok: true, value, issues: [] };
}

function normalizeStart(event: RawTimeTreeEvent): NormalizedDateTime {
  if (event.allDay) return { kind: 'date', date: toUtcDate(event.startAt) };
  return { kind: 'date-time', epochMs: event.startAt, timezone: event.startTimezone ?? '' };
}

function normalizeEnd(event: RawTimeTreeEvent): NormalizedDateTime {
  if (event.allDay) return { kind: 'date', date: toUtcDate(event.endAt) };
  return { kind: 'date-time', epochMs: event.endAt, timezone: event.endTimezone ?? '' };
}

function normalizeTitle(title: string, warnings: NormalizationWarning[]): string {
  if (title.trim() !== '') return title;
  warnings.push('title-empty');
  return '(untitled TimeTree event)';
}

function collectWarnings(event: RawTimeTreeEvent): NormalizationWarning[] {
  const warnings: NormalizationWarning[] = [];
  if (!event.allDay && (!event.startTimezone || !event.endTimezone)) {
    warnings.push('timezone-missing');
  }
  if (Array.isArray(event.attendees) && event.attendees.length > 0) {
    warnings.push('participant-omitted');
  }
  if (event.attachment) {
    warnings.push('attachment-omitted');
  }
  if (Array.isArray(event.files) && event.files.length > 0) {
    warnings.push('attachment-omitted');
  }
  return unique(warnings);
}

function normalizeLabels(event: RawTimeTreeEvent, labels: RawTimeTreeLabel[]): string[] {
  if (event.labelId === undefined || event.labelId === null) return [];
  const label = labels.find((label) => label.id === event.labelId);
  return label?.name ? [label.name] : [];
}

function normalizeRecurrences(recurrences: string[]): {
  recurrence: NormalizedRecurrence | undefined;
  warnings: NormalizationWarning[];
} {
  if (recurrences.length === 0) return { recurrence: undefined, warnings: [] };

  const recurrence: NormalizedRecurrence = {};
  const warnings: NormalizationWarning[] = [];
  for (const rule of recurrences) {
    if (rule.startsWith('RRULE:')) {
      push(recurrence, 'rrule', rule);
      if (!isSupportedRRule(rule)) warnings.push('recurrence-unsupported');
    } else if (rule.startsWith('RDATE')) {
      push(recurrence, 'rdate', rule);
    } else if (rule.startsWith('EXRULE:')) {
      push(recurrence, 'exrule', rule);
      warnings.push('recurrence-unsupported');
    } else if (rule.startsWith('EXDATE')) {
      push(recurrence, 'exdate', rule);
    } else {
      push(recurrence, 'rrule', rule);
      warnings.push('recurrence-unsupported');
    }
  }

  return { recurrence, warnings: unique(warnings) };
}

function isSupportedRRule(rule: string): boolean {
  if (rule.startsWith('RRULE:FREQ=DAILY')) return true;
  if (rule.startsWith('RRULE:FREQ=WEEKLY') && /(?:^|;)BYDAY=/.test(rule.slice('RRULE:'.length))) return true;
  if (rule.startsWith('RRULE:FREQ=MONTHLY')) return true;
  return false;
}

function push(target: NormalizedRecurrence, key: keyof NormalizedRecurrence, value: string): void {
  target[key] ??= [];
  target[key].push(value);
}

function toUtcDate(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

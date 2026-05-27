import { validateRawTimeTreeEvent, type RawTimeTreeCalendar, type RawTimeTreeEvent, type RawTimeTreeLabel } from './contracts.js';

export const NORMALIZATION_WARNING_VALUES = [
  'timezone-missing',
  'timezone-not-iana',
  'recurrence-unsupported',
  'attachment-omitted',
  'participant-omitted',
  'title-empty',
  'reminder-unsupported',
  'url-invalid',
] as const;

export type NormalizationWarning = (typeof NORMALIZATION_WARNING_VALUES)[number];

export type NormalizedReminder = {
  /** 이벤트 시작 시각 기준 음수 분 (e.g., -30 = 30분 전). */
  minutesBefore: number;
};

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
  reminders?: NormalizedReminder[];
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
  const recurrence = recurrenceResult.recurrence;
  const titleWarnings: NormalizationWarning[] = [];
  const title = normalizeTitle(event.title, titleWarnings);
  const urlResult = normalizeUrl(event.url);
  const fieldWarnings: NormalizationWarning[] = [];
  if (urlResult.warning) fieldWarnings.push(urlResult.warning);
  const warnings = unique([...collected, ...recurrenceResult.warnings, ...titleWarnings, ...fieldWarnings]);

  const value: NormalizedCalendarEvent = {
    uid: `timetree:${event.calendarId}:${sanitizeUidId(event.id)}`,
    calendarName: context.calendar?.name ?? String(event.calendarId),
    title,
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
  if (urlResult.value) value.url = urlResult.value;
  if (labels.length > 0) value.labels = labels;
  if (recurrence) value.recurrence = recurrence;

  return { ok: true, value, issues: [] };
}

function normalizeStart(event: RawTimeTreeEvent): NormalizedDateTime {
  if (event.allDay) return { kind: 'date', date: toUtcDate(event.startAt) };
  return { kind: 'date-time', epochMs: event.startAt, timezone: event.startTimezone as string };
}

function normalizeEnd(event: RawTimeTreeEvent): NormalizedDateTime {
  if (event.allDay) return { kind: 'date', date: toUtcDate(event.endAt) };
  return { kind: 'date-time', epochMs: event.endAt, timezone: event.endTimezone as string };
}

function normalizeTitle(title: string, warnings: NormalizationWarning[]): string {
  if (title.trim() !== '') return title;
  warnings.push('title-empty');
  return '(untitled TimeTree event)';
}

// 제어문자(CR/LF 포함)는 ICS line 구조를 깨고, parse 실패하는 URL은 standards
// client에서 거부될 수 있으므로 drop + warning으로 surface한다.
// UID를 ASCII printable subset(U+0020..U+007E)으로 정규화한다. 비-ASCII char는
// UTF-8 byte sequence를 percent-encoding한다. 같은 raw event는 같은 결과를
//내므로 Google file import의 UID-based dedup이 동작한다.
// 정책 출처: docs/specs/ics-emit-cross-cutting-checks.md §5.
function sanitizeUidId(id: string): string {
  const bytes = new TextEncoder().encode(id);
  let result = '';
  for (const byte of bytes) {
    // ASCII printable 보존. '%' 자체도 보존 — 이미 percent-encode된 입력이
    // 재import 시에도 동일 UID를 내야 idempotent.
    if (byte >= 0x20 && byte <= 0x7e) {
      result += String.fromCharCode(byte);
    } else {
      result += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    }
  }
  return result;
}

function normalizeUrl(url: string | null | undefined): { value?: string; warning?: 'url-invalid' } {
  if (url == null || url === '') return {};
  if (/[\u0000-\u001F\u007F]/.test(url)) return { warning: 'url-invalid' };
  try {
    new URL(url);
    return { value: url };
  } catch {
    return { warning: 'url-invalid' };
  }
}

function collectWarnings(event: RawTimeTreeEvent): NormalizationWarning[] {
  const warnings: NormalizationWarning[] = [];
  if (!event.allDay && (!event.startTimezone || !event.endTimezone)) {
    warnings.push('timezone-missing');
  }
  if (!event.allDay) {
    for (const tz of [event.startTimezone, event.endTimezone]) {
      if (tz && !isValidIanaTimezone(tz)) warnings.push('timezone-not-iana');
    }
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
  if (rule.startsWith('RRULE:FREQ=WEEKLY')) return true;
  if (rule.startsWith('RRULE:FREQ=MONTHLY')) return true;
  return false;
}

function push(target: NormalizedRecurrence, key: keyof NormalizedRecurrence, value: string): void {
  target[key] ??= [];
  target[key].push(value);
}

// TimeTree all-day timestamps are UTC-midnight epochs. Deriving the date from
// UTC components (not local components) keeps the emitted VALUE=DATE boundary
// timezone-stable, so an export run on a non-UTC machine cannot shift the date
// by a day (which previously collapsed DTEND onto DTSTART).
function toUtcDate(epochMs: number): string {
  const d = new Date(epochMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// A timezone name is a valid IANA zone iff Intl can build a formatter for it.
// Non-IANA names (e.g. `KST`, Windows `"Korea Standard Time"`) throw RangeError.
// But ECMA-402 ALSO accepts offset identifiers (`+09:00`, `GMT+9`), which are not
// IANA zone names and which Google import does not reliably honor — reject those
// explicitly so the warning fires on the path it is meant to catch. `UTC` is valid.
// `Intl` is standard ECMAScript, so this stays core-pure.
function isValidIanaTimezone(timezone: string): boolean {
  if (/^[+-]\d{2}:?\d{2}$/.test(timezone)) return false;
  if (/^(?:UTC|GMT)[+-]/i.test(timezone)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

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
  const recurrenceResult = normalizeRecurrences(event.recurrences);
  if (!recurrenceResult.ok) {
    return {
      ok: false,
      value: undefined,
      issues: recurrenceResult.unsupportedRules.map(
        (rule) => `unsupported recurrence rule (event ${event.id}): ${rule}`,
      ),
    };
  }
  const recurrence = recurrenceResult.recurrence;
  const collected = collectWarnings(event);
  const labels = normalizeLabels(event, context.labels ?? []);
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
  return { kind: 'date-time', epochMs: event.startAt, timezone: resolveTimezone(event.startTimezone) };
}

function normalizeEnd(event: RawTimeTreeEvent): NormalizedDateTime {
  if (event.allDay) return { kind: 'date', date: toUtcDate(event.endAt) };
  return { kind: 'date-time', epochMs: event.endAt, timezone: resolveTimezone(event.endTimezone) };
}

// non-IANA timezone string은 Google import가 신뢰성 있게 처리하지 못하므로
// UTC로 fallback한다 (epochMs는 그대로). 'timezone-not-iana' warning은
// collectWarnings에서 이미 push되어 사용자에게 fallback이 일어났음을 surface한다.
// 정책 출처: google-calendar-import-field-compat.md §"TZID — valid IANA name 필수".
function resolveTimezone(timezone: string | null | undefined): string {
  if (timezone != null && isValidIanaTimezone(timezone)) return timezone;
  return 'UTC';
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

type RecurrenceResult =
  | { ok: true; recurrence: NormalizedRecurrence | undefined; warnings: NormalizationWarning[] }
  | { ok: false; unsupportedRules: string[]; warnings: NormalizationWarning[] };

function normalizeRecurrences(recurrences: string[]): RecurrenceResult {
  if (recurrences.length === 0) return { ok: true, recurrence: undefined, warnings: [] };

  const recurrence: NormalizedRecurrence = {};
  const warnings: NormalizationWarning[] = [];
  const unsupported: string[] = [];
  for (const rule of recurrences) {
    if (rule.startsWith('RRULE:')) {
      if (isSupportedRRule(rule)) {
        push(recurrence, 'rrule', rule);
      } else {
        unsupported.push(rule);
        warnings.push('recurrence-unsupported');
      }
    } else if (rule.startsWith('RDATE')) {
      push(recurrence, 'rdate', rule);
    } else if (rule.startsWith('EXRULE:')) {
      // EXRULE은 v1-export-policy.md 'EXRULE 유지' 정책에 따라 emit 유지.
      // Apple/Outlook은 honor하고 Google은 무시. warning은 surface만.
      push(recurrence, 'exrule', rule);
      warnings.push('recurrence-unsupported');
    } else if (rule.startsWith('EXDATE')) {
      push(recurrence, 'exdate', rule);
    } else {
      // 알 수 없는 rule prefix는 silent emit하지 않는다 (Google import 거부 또는
      // 잘못된 동작의 silent data loss 방지).
      unsupported.push(rule);
      warnings.push('recurrence-unsupported');
    }
  }

  if (unsupported.length > 0) {
    return { ok: false, unsupportedRules: unsupported, warnings: unique(warnings) };
  }
  const hasAnyRule = Object.keys(recurrence).length > 0;
  return { ok: true, recurrence: hasAnyRule ? recurrence : undefined, warnings: unique(warnings) };
}

// v1 허용 recurrence subset (ics-normalization-contract.md "Initial recurrence subset"):
// - FREQ=DAILY: 단순 패턴 통과.
// - FREQ=WEEKLY: BYDAY 동반 필수 — spec이 'WEEKLY with BYDAY'로 명시.
// - FREQ=MONTHLY: BYSETPOS 조합 제외(예: 'last Monday') — Google import 안정성 보장.
// - 그 외 FREQ(YEARLY 등): 미지원 → event-level fail.
function isSupportedRRule(rule: string): boolean {
  if (rule.startsWith('RRULE:FREQ=DAILY')) return true;
  if (rule.startsWith('RRULE:FREQ=WEEKLY')) {
    return /(?:^|;)BYDAY=/i.test(rule);
  }
  if (rule.startsWith('RRULE:FREQ=MONTHLY')) {
    if (/(?:^|;)BYSETPOS=/i.test(rule)) return false;
    return true;
  }
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

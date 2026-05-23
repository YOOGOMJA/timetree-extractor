import { type NormalizedCalendarEvent, type NormalizedDateTime, type NormalizedRecurrence } from './normalize.js';

export type CreateIcsCalendarOptions = {
  prodId?: string;
  now?: Date;
};

const DEFAULT_PROD_ID = '-//timetree-exporter//NONSGML v1//EN';

export function createIcsCalendar(events: NormalizedCalendarEvent[], options: CreateIcsCalendarOptions = {}): string {
  const timestamp = formatUtcDateTime(options.now ?? new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${escapeText(options.prodId ?? DEFAULT_PROD_ID)}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  const tzidMap = collectTzids(events);
  for (const [tzid, ref] of tzidMap) {
    lines.push(...createVtimezoneLines(tzid, ref));
  }

  for (const event of events) {
    lines.push(...createIcsEventLines(event, timestamp));
  }

  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

// Stable fallback reference instant (mid-January 2025) used only when a TZID is
// observed solely via a recurrence parameter and the calendar has no datetime
// event in that zone to anchor the offset.
const FALLBACK_REFERENCE_MS = Date.UTC(2025, 0, 15);

function collectTzids(events: NormalizedCalendarEvent[]): Map<string, number> {
  const tzids = new Map<string, number>();
  const recordTzid = (tzid: string, referenceMs: number | undefined): void => {
    if (tzids.has(tzid)) return;
    tzids.set(tzid, referenceMs ?? FALLBACK_REFERENCE_MS);
  };
  for (const event of events) {
    const eventReference =
      event.start.kind === 'date-time'
        ? event.start.epochMs
        : event.end.kind === 'date-time'
          ? event.end.epochMs
          : undefined;
    if (event.start.kind === 'date-time') recordTzid(event.start.timezone, event.start.epochMs);
    if (event.end.kind === 'date-time') recordTzid(event.end.timezone, event.end.epochMs);
    if (event.recurrence) {
      for (const line of recurrenceLines(event.recurrence)) {
        const match = /TZID=("[^"]+"|[^;:]+)/i.exec(line);
        if (match) recordTzid(match[1].replace(/^"|"$/g, ''), eventReference);
      }
    }
  }
  return tzids;
}

function recurrenceLines(recurrence: NormalizedRecurrence): string[] {
  return [
    ...(recurrence.rrule ?? []),
    ...(recurrence.rdate ?? []),
    ...(recurrence.exrule ?? []),
    ...(recurrence.exdate ?? []),
  ];
}

// v1: STANDARD-only — we emit a single STANDARD subcomponent per TZID with the
// offset derived from the first observed event time in that zone. This keeps
// single-phase exports correct (e.g. an all-January America/New_York calendar
// gets -0500, an all-July calendar gets -0400). It still cannot model an export
// that spans a DST transition for the same TZID: such a calendar will report
// the offset from the first event and be off by an hour for events on the
// other side of the transition. Modeling DAYLIGHT + RRULE-based transitions is
// deferred (see issue #5).
function createVtimezoneLines(tzid: string, referenceMs: number): string[] {
  const offset = resolveTimezoneOffset(tzid, referenceMs);
  const tzname = resolveTimezoneShortName(tzid, offset);
  const lines = [
    'BEGIN:VTIMEZONE',
    `TZID:${tzid}`,
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    `TZOFFSETFROM:${offset}`,
    `TZOFFSETTO:${offset}`,
  ];
  if (tzname) lines.push(`TZNAME:${tzname}`);
  lines.push('END:STANDARD', 'END:VTIMEZONE');
  return lines;
}

function resolveTimezoneOffset(tzid: string, referenceMs: number): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: tzid, timeZoneName: 'longOffset' });
    const part = formatter.formatToParts(new Date(referenceMs)).find((p) => p.type === 'timeZoneName');
    return parseLongOffset(part?.value);
  } catch {
    return '+0000';
  }
}

function parseLongOffset(longOffset: string | undefined): string {
  if (!longOffset) return '+0000';
  // "GMT" alone (UTC) or "GMT+09:00" / "GMT-05:30".
  if (longOffset === 'GMT' || longOffset === 'UTC') return '+0000';
  const match = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(longOffset);
  if (!match) return '+0000';
  const sign = match[1];
  const hours = match[2].padStart(2, '0');
  const minutes = (match[3] ?? '00').padStart(2, '0');
  return `${sign}${hours}${minutes}`;
}

// Common IANA → RFC 5545 TZNAME mapping. Intl's `short` formatter returns
// GMT-style offsets for many zones (e.g. "GMT+9" for Asia/Seoul) which is not a
// useful TZNAME, so we map a small set of well-known zones explicitly and fall
// back to Intl / offset only when no entry matches.
const STATIC_TZ_SHORT_NAMES: Record<string, string> = {
  UTC: 'UTC',
  'Etc/UTC': 'UTC',
  'Asia/Seoul': 'KST',
  'Asia/Tokyo': 'JST',
};

function resolveTimezoneShortName(tzid: string, offset: string): string | undefined {
  const mapped = STATIC_TZ_SHORT_NAMES[tzid];
  if (mapped) return mapped;
  try {
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: tzid, timeZoneName: 'short' });
    const part = formatter.formatToParts(new Date()).find((p) => p.type === 'timeZoneName');
    const value = part?.value;
    if (!value) return undefined;
    // Fall back when the short name is just another offset rendering (e.g. "GMT+9").
    if (/^GMT([+-]\d|$)/.test(value) || /^UTC([+-]\d|$)/.test(value)) {
      return value === 'GMT' || value === 'UTC' ? value : offset;
    }
    return value;
  } catch {
    return undefined;
  }
}

function createIcsEventLines(event: NormalizedCalendarEvent, timestamp: string): string[] {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${escapeText(event.uid)}`,
    `DTSTAMP:${timestamp}`,
    `SUMMARY:${escapeText(event.title)}`,
    formatDateTimeLine('DTSTART', event.start),
    formatDateTimeLine('DTEND', event.end),
  ];

  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.url) lines.push(`URL:${event.url}`);
  if (event.labels && event.labels.length > 0) lines.push(`CATEGORIES:${event.labels.map(escapeText).join(',')}`);
  if (event.recurrence) lines.push(...formatRecurrenceLines(event.recurrence));

  lines.push('END:VEVENT');
  return lines;
}

function formatDateTimeLine(name: 'DTSTART' | 'DTEND', value: NormalizedDateTime): string {
  if (value.kind === 'date') return `${name};VALUE=DATE:${value.date.replaceAll('-', '')}`;
  return `${name};TZID=${value.timezone}:${formatZonedDateTime(value.epochMs, value.timezone)}`;
}

function formatRecurrenceLines(recurrence: NormalizedRecurrence): string[] {
  return [
    ...(recurrence.rrule ?? []).map((line) => formatRuleLine('RRULE', line)),
    ...(recurrence.rdate ?? []).map((line) => formatRuleLine('RDATE', line)),
    ...(recurrence.exrule ?? []).map((line) => formatRuleLine('EXRULE', line)),
    ...(recurrence.exdate ?? []).map((line) => formatRuleLine('EXDATE', line)),
  ];
}

function formatRuleLine(name: string, line: string): string {
  if (line.startsWith(`${name}:`) || line.startsWith(`${name};`)) return line;
  return `${name}:${line}`;
}

function formatUtcDateTime(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function formatZonedDateTime(epochMs: number, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(epochMs)).map((part) => [part.type, part.value]));
  return `${parts.year}${parts.month}${parts.day}T${parts.hour}${parts.minute}${parts.second}`;
}

function escapeText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,');
}

function foldLine(line: string): string {
  const bytes = textEncoder.encode(line);
  if (bytes.byteLength <= 75) return line;

  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < bytes.byteLength) {
    const isFirst = chunks.length === 0;
    const budget = isFirst ? 75 : 74;
    let end = Math.min(cursor + budget, bytes.byteLength);
    while (end > cursor && isUtf8ContinuationByte(bytes[end])) end -= 1;
    chunks.push(textDecoder.decode(bytes.subarray(cursor, end)));
    cursor = end;
  }
  return chunks.join('\r\n ');
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: false });

function isUtf8ContinuationByte(byte: number | undefined): boolean {
  return byte !== undefined && (byte & 0b1100_0000) === 0b1000_0000;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

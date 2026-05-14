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

  for (const event of events) {
    lines.push(...createIcsEventLines(event, timestamp));
  }

  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
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
  if (event.url) lines.push(`URL:${escapeText(event.url)}`);
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
  return line.startsWith(`${name}:`) ? line : `${name}:${line}`;
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
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let remaining = line;
  while (remaining.length > 75) {
    chunks.push(remaining.slice(0, 75));
    remaining = remaining.slice(75);
  }
  chunks.push(remaining);
  return chunks.join('\r\n ');
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

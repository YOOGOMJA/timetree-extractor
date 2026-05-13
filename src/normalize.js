import { validateRawTimeTreeEvent } from './contracts.js';

const NORMALIZATION_WARNING_VALUES = new Set([
  'timezone-missing',
  'recurrence-unsupported',
  'attachment-omitted',
  'comment-omitted',
  'participant-omitted',
  'label-color-approximation',
  'title-empty',
]);

export function normalizeRawTimeTreeEvent(rawEvent, context) {
  const validation = validateRawTimeTreeEvent(rawEvent);
  if (!validation.ok) {
    return { ok: false, issues: validation.issues };
  }

  const event = validation.value;
  const warnings = collectWarnings(event);
  const labels = normalizeLabels(event, context?.labels ?? []);
  const recurrence = normalizeRecurrences(event.recurrences, warnings);

  const value = {
    uid: `timetree:${event.calendarId}:${event.id}`,
    calendarName: context?.calendar?.name ?? String(event.calendarId),
    title: normalizeTitle(event.title, warnings),
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

  if (event.allDay) {
    value.start = { kind: 'date', date: toUtcDate(event.startAt) };
    value.end = { kind: 'date', date: toUtcDate(event.endAt) };
  } else {
    value.start = {
      kind: 'date-time',
      epochMs: event.startAt,
      timezone: event.startTimezone,
    };
    value.end = {
      kind: 'date-time',
      epochMs: event.endAt,
      timezone: event.endTimezone,
    };
  }

  return { ok: true, value, issues: [] };
}

export { NORMALIZATION_WARNING_VALUES };

function normalizeTitle(title, warnings) {
  if (title.trim() !== '') return title;
  warnings.push('title-empty');
  return '(untitled TimeTree event)';
}

function collectWarnings(event) {
  const warnings = [];
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

function normalizeLabels(event, labels) {
  if (event.labelId === undefined || event.labelId === null) return [];
  const label = labels.find((label) => label.id === event.labelId);
  return label?.name ? [label.name] : [];
}

function normalizeRecurrences(recurrences, warnings) {
  if (!recurrences || recurrences.length === 0) return undefined;

  const recurrence = {};
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

  warnings.splice(0, warnings.length, ...unique(warnings));
  return recurrence;
}

function isSupportedRRule(rule) {
  if (rule.startsWith('RRULE:FREQ=DAILY')) return true;
  if (rule.startsWith('RRULE:FREQ=WEEKLY') && /(?:^|;)BYDAY=/.test(rule.slice('RRULE:'.length))) return true;
  if (rule.startsWith('RRULE:FREQ=MONTHLY')) return true;
  return false;
}

function push(target, key, value) {
  target[key] ??= [];
  target[key].push(value);
}

function toUtcDate(epochMs) {
  return new Date(epochMs).toISOString().slice(0, 10);
}

function unique(values) {
  return [...new Set(values)];
}

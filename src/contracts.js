const EXTRACTION_WARNING_VALUES = new Set([
  'internal-api-surface',
  'missing-timezone',
  'missing-end-timezone',
  'inferred-field',
  'unsupported-attachment',
  'unsupported-comment',
  'shared-calendar-personal-data',
  'recurrence-not-normalized',
]);

export function validateRawTimeTreeCalendar(input) {
  const issues = [];
  const value = isRecord(input) ? { ...input } : {};

  requireNumber(value, 'id', issues);
  requireString(value, 'aliasCode', issues);
  requireString(value, 'name', issues);
  optionalNumber(value, 'updatedAt', issues);
  optionalNumber(value, 'createdAt', issues);

  return result(value, issues);
}

export function validateRawTimeTreeLabel(input) {
  const issues = [];
  const value = isRecord(input) ? { ...input } : {};

  requireNumber(value, 'id', issues);
  requireNumber(value, 'calendarId', issues);
  requireString(value, 'name', issues);
  optionalNumber(value, 'color', issues);
  optionalNumber(value, 'defaultColor', issues);
  optionalNumber(value, 'order', issues);

  return result(value, issues);
}

export function validateRawTimeTreeEvent(input) {
  const issues = [];
  const value = isRecord(input) ? { ...input } : {};

  requireString(value, 'id', issues);
  requireNumber(value, 'calendarId', issues);
  requireString(value, 'title', issues, { allowEmpty: true });
  requireBoolean(value, 'allDay', issues);
  requireNumber(value, 'startAt', issues);
  requireNumber(value, 'endAt', issues);
  optionalNumber(value, 'labelId', issues, { allowNull: true });
  optionalString(value, 'location', issues, { allowNull: true });
  optionalString(value, 'url', issues, { allowNull: true });
  optionalString(value, 'note', issues, { allowNull: true });
  optionalString(value, 'recurringUuid', issues, { allowNull: true });
  optionalNumber(value, 'updatedAt', issues);
  optionalNumber(value, 'createdAt', issues);
  optionalNumber(value, 'deactivatedAt', issues, { allowNull: true });

  if (!Array.isArray(value.recurrences)) {
    issues.push('recurrences must be an array of strings');
  } else {
    value.recurrences.forEach((recurrence, index) => {
      if (typeof recurrence !== 'string') {
        issues.push(`recurrences[${index}] must be a string`);
      }
    });
  }

  if (value.extractionWarnings === undefined) {
    value.extractionWarnings = [];
  }
  if (!Array.isArray(value.extractionWarnings)) {
    issues.push('extractionWarnings must be an array');
  } else {
    value.extractionWarnings.forEach((warning, index) => {
      if (typeof warning !== 'string') {
        issues.push(`extractionWarnings[${index}] must be a string`);
      } else if (!EXTRACTION_WARNING_VALUES.has(warning)) {
        issues.push(`extractionWarnings[${index}] has unsupported value: ${warning}`);
      }
    });
  }

  if (value.allDay === false) {
    requireString(value, 'startTimezone', issues);
    requireString(value, 'endTimezone', issues);
  } else {
    optionalString(value, 'startTimezone', issues, { allowNull: true });
    optionalString(value, 'endTimezone', issues, { allowNull: true });
  }

  if (typeof value.startAt === 'number' && typeof value.endAt === 'number' && value.endAt < value.startAt) {
    issues.push('endAt must be greater than or equal to startAt');
  }

  return result(value, issues);
}

export { EXTRACTION_WARNING_VALUES };

function result(value, issues) {
  return issues.length === 0
    ? { ok: true, value, issues: [] }
    : { ok: false, value: undefined, issues };
}

function isRecord(input) {
  return input !== null && typeof input === 'object' && !Array.isArray(input);
}

function requireString(value, field, issues, options = {}) {
  if (typeof value[field] !== 'string') {
    issues.push(`${field} must be a string`);
    return;
  }
  if (!options.allowEmpty && value[field].trim() === '') {
    issues.push(`${field} must not be empty`);
  }
}

function optionalString(value, field, issues, options = {}) {
  if (value[field] === undefined) return;
  if (value[field] === null && options.allowNull) return;
  if (typeof value[field] !== 'string') {
    issues.push(`${field} must be a string`);
  }
}

function requireNumber(value, field, issues) {
  if (typeof value[field] !== 'number' || !Number.isFinite(value[field])) {
    issues.push(`${field} must be a finite number`);
  }
}

function optionalNumber(value, field, issues, options = {}) {
  if (value[field] === undefined) return;
  if (value[field] === null && options.allowNull) return;
  if (typeof value[field] !== 'number' || !Number.isFinite(value[field])) {
    issues.push(`${field} must be a finite number`);
  }
}

function requireBoolean(value, field, issues) {
  if (typeof value[field] !== 'boolean') {
    issues.push(`${field} must be a boolean`);
  }
}

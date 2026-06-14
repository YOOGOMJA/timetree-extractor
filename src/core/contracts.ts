export const EXTRACTION_WARNING_VALUES = [
  'internal-api-surface',
  'missing-timezone',
  'missing-end-timezone',
  'inferred-field',
  'unsupported-attachment',
  'unsupported-comment',
  'shared-calendar-personal-data',
  'recurrence-not-normalized',
] as const;

const extractionWarningSet = new Set<string>(EXTRACTION_WARNING_VALUES);

export type ExtractionWarning = (typeof EXTRACTION_WARNING_VALUES)[number];

export type RawTimeTreeCalendar = {
  id: number;
  aliasCode: string;
  name: string;
  // 캘린더 용도. 'private'/'memo'=개인, 그 외('family' 등)=공유(#111). 비개인 메타.
  purpose?: string | null;
  updatedAt?: number;
  createdAt?: number;
};

export type RawTimeTreeLabel = {
  id: number;
  calendarId: number;
  name: string;
  color?: number;
  defaultColor?: number;
  order?: number;
};

export type RawTimeTreeEvent = {
  id: string;
  calendarId: number;
  title: string;
  allDay: boolean;
  startAt: number;
  startTimezone: string | null;
  endAt: number;
  endTimezone: string | null;
  labelId?: number | null;
  location?: string | null;
  url?: string | null;
  note?: string | null;
  recurrences: string[];
  recurringUuid?: string | null;
  // 수정된 반복 instance의 *원래* occurrence 시각(epoch ms). RECURRENCE-ID 산출에 필요(#14).
  // 일반 이벤트엔 없으므로 optional+nullable.
  recurStartAt?: number | null;
  recurEndAt?: number | null;
  alerts?: unknown[];
  // 참가자/첨부의 *내용*(이름·ID·바이너리)은 message boundary를 넘기지 않는다(privacy boundary).
  // 추출 시점에 개수만 산출해 싣는다(#81). cache 경로의 blob처럼 셀 수 없으면 absent.
  participantCount?: number;
  attachmentCount?: number;
  updatedAt?: number;
  createdAt?: number;
  deactivatedAt?: number | null;
  extractionWarnings: ExtractionWarning[];
};

export type ValidationResult<T> =
  | { ok: true; value: T; issues: [] }
  | { ok: false; value: undefined; issues: string[] };

export function validateRawTimeTreeCalendar(input: unknown): ValidationResult<RawTimeTreeCalendar> {
  const issues: string[] = [];
  const value = isRecord(input) ? { ...input } : {};

  requireNumber(value, 'id', issues);
  requireString(value, 'aliasCode', issues);
  requireString(value, 'name', issues);
  optionalString(value, 'purpose', issues, { allowNull: true });
  optionalNumber(value, 'updatedAt', issues);
  optionalNumber(value, 'createdAt', issues);

  return result(value as RawTimeTreeCalendar, issues);
}

export function validateRawTimeTreeLabel(input: unknown): ValidationResult<RawTimeTreeLabel> {
  const issues: string[] = [];
  const value = isRecord(input) ? { ...input } : {};

  requireNumber(value, 'id', issues);
  requireNumber(value, 'calendarId', issues);
  requireString(value, 'name', issues);
  optionalNumber(value, 'color', issues);
  optionalNumber(value, 'defaultColor', issues);
  optionalNumber(value, 'order', issues);

  return result(value as RawTimeTreeLabel, issues);
}

export function validateRawTimeTreeEvent(input: unknown): ValidationResult<RawTimeTreeEvent> {
  const issues: string[] = [];
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
  optionalNumber(value, 'recurStartAt', issues, { allowNull: true });
  optionalNumber(value, 'recurEndAt', issues, { allowNull: true });
  optionalNumber(value, 'updatedAt', issues);
  optionalNumber(value, 'createdAt', issues);
  optionalNumber(value, 'deactivatedAt', issues, { allowNull: true });
  optionalNumber(value, 'participantCount', issues);
  optionalNumber(value, 'attachmentCount', issues);

  if (!Array.isArray(value.recurrences)) {
    issues.push('recurrences must be an array of strings');
  } else {
    value.recurrences.forEach((recurrence, index) => {
      if (typeof recurrence !== 'string') {
        issues.push(`recurrences[${index}] must be a string`);
      }
    });
  }

  value.extractionWarnings ??= [];
  if (!Array.isArray(value.extractionWarnings)) {
    issues.push('extractionWarnings must be an array');
  } else {
    value.extractionWarnings.forEach((warning, index) => {
      if (typeof warning !== 'string') {
        issues.push(`extractionWarnings[${index}] must be a string`);
      } else if (!extractionWarningSet.has(warning)) {
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

  return result(value as RawTimeTreeEvent, issues);
}

function result<T>(value: T, issues: string[]): ValidationResult<T> {
  return issues.length === 0
    ? { ok: true, value, issues: [] }
    : { ok: false, value: undefined, issues };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return input !== null && typeof input === 'object' && !Array.isArray(input);
}

function requireString(value: Record<string, unknown>, field: string, issues: string[], options: { allowEmpty?: boolean } = {}): void {
  if (typeof value[field] !== 'string') {
    issues.push(`${field} must be a string`);
    return;
  }
  if (!options.allowEmpty && value[field].trim() === '') {
    issues.push(`${field} must not be empty`);
  }
}

function optionalString(value: Record<string, unknown>, field: string, issues: string[], options: { allowNull?: boolean } = {}): void {
  if (value[field] === undefined) return;
  if (value[field] === null && options.allowNull) return;
  if (typeof value[field] !== 'string') {
    issues.push(`${field} must be a string`);
  }
}

function requireNumber(value: Record<string, unknown>, field: string, issues: string[]): void {
  if (typeof value[field] !== 'number' || !Number.isFinite(value[field])) {
    issues.push(`${field} must be a finite number`);
  }
}

function optionalNumber(value: Record<string, unknown>, field: string, issues: string[], options: { allowNull?: boolean } = {}): void {
  if (value[field] === undefined) return;
  if (value[field] === null && options.allowNull) return;
  if (typeof value[field] !== 'number' || !Number.isFinite(value[field])) {
    issues.push(`${field} must be a finite number`);
  }
}

function requireBoolean(value: Record<string, unknown>, field: string, issues: string[]): void {
  if (typeof value[field] !== 'boolean') {
    issues.push(`${field} must be a boolean`);
  }
}

import { validateRawTimeTreeLabel, type RawTimeTreeLabel } from '../core/contracts.js';
import { type PageFetchJson } from './timetree-page-extractor.js';

export type ListTimeTreeLabelsInput = {
  calendarId: number;
  fetchJson: PageFetchJson;
};

export type ListTimeTreeLabelsResult =
  | { ok: true; labels: RawTimeTreeLabel[]; issues: [] }
  | { ok: false; labels?: undefined; issues: string[] };

export async function listTimeTreeLabels(input: ListTimeTreeLabelsInput): Promise<ListTimeTreeLabelsResult> {
  const payload = await input.fetchJson(`/api/v1/calendar/${input.calendarId}/labels`);
  if (!isRecord(payload) || !Array.isArray(payload.labels)) {
    return { ok: false, issues: ['labels must be an array under `labels` key'] };
  }

  const labels: RawTimeTreeLabel[] = [];
  const issues: string[] = [];
  payload.labels.forEach((apiLabel, index) => {
    if (!isRecord(apiLabel)) {
      issues.push(`labels[${index}] must be an object`);
      return;
    }
    const mapped = mapApiLabelToRawLabel(apiLabel);
    const validation = validateRawTimeTreeLabel(mapped);
    if (!validation.ok) {
      issues.push(...validation.issues.map((issue) => `labels[${index}].${issue}`));
      return;
    }
    labels.push(validation.value);
  });

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, labels, issues: [] };
}

export function mapApiLabelToRawLabel(apiLabel: Record<string, unknown>): RawTimeTreeLabel {
  return {
    id: numberValue(apiLabel.id),
    calendarId: numberValue(apiLabel.calendar_id),
    name: stringValue(apiLabel.name),
    color: optionalNumber(apiLabel.color),
    defaultColor: optionalNumber(apiLabel.default_color),
    order: optionalNumber(apiLabel.order),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  return numberValue(value);
}

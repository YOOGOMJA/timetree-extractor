import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listTimeTreeLabels, mapApiLabelToRawLabel } from '../../src/browser/timetree-labels.js';

test('maps snake_case API label to RawTimeTreeLabel', () => {
  const raw = mapApiLabelToRawLabel({
    id: 7,
    calendar_id: 42,
    name: 'Work',
    color: 16711680,
    default_color: 16711680,
    order: 1,
  });
  assert.equal(raw.id, 7);
  assert.equal(raw.calendarId, 42);
  assert.equal(raw.name, 'Work');
  assert.equal(raw.color, 16711680);
  assert.equal(raw.defaultColor, 16711680);
  assert.equal(raw.order, 1);
});

test('lists labels via injected fetch for given calendarId', async () => {
  const requested: string[] = [];
  const result = await listTimeTreeLabels({
    calendarId: 42,
    fetchJson: async (path) => {
      requested.push(path);
      return {
        labels: [
          { id: 1, calendar_id: 42, name: 'Work', color: 1, default_color: 1, order: 0 },
          { id: 2, calendar_id: 42, name: 'Personal', color: 2, default_color: 2, order: 1 },
        ],
      };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(requested[0], '/api/v1/calendar/42/labels');
  if (result.ok) {
    assert.equal(result.labels.length, 2);
    assert.equal(result.labels[0].name, 'Work');
    assert.equal(result.labels[1].name, 'Personal');
    assert.equal(result.labels[0].calendarId, 42);
  }
});

test('reports invalid labels payload shape (non-array)', async () => {
  const result = await listTimeTreeLabels({
    calendarId: 42,
    fetchJson: async () => ({ unexpected: [] }),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.issues.join('\n'), /labels must be an array/);
  }
});

test('reports per-label validation failures with index prefix', async () => {
  const result = await listTimeTreeLabels({
    calendarId: 42,
    fetchJson: async () => ({
      // name is missing/non-string → mapper coerces to '', validator rejects empty
      labels: [{ id: 1, calendar_id: 42, name: 123 }],
    }),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.issues.join('\n'), /labels\[0\]\.name/);
  }
});

test('reports per-label validation failures for non-numeric id with index prefix', async () => {
  const result = await listTimeTreeLabels({
    calendarId: 42,
    fetchJson: async () => ({
      labels: [{ id: 'not-a-number', calendar_id: 42, name: 'Work' }],
    }),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.issues.join('\n'), /labels\[0\]\.id must be a finite number/);
  }
});

test('reports non-object entry inside labels array', async () => {
  const result = await listTimeTreeLabels({
    calendarId: 42,
    fetchJson: async () => ({ labels: ['not-an-object'] }),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.issues.join('\n'), /labels\[0\] must be an object/);
  }
});

test('treats null optional fields as missing (does not produce NaN)', () => {
  const raw = mapApiLabelToRawLabel({
    id: 7,
    calendar_id: 42,
    name: 'Work',
    color: null,
    default_color: null,
    order: null,
  });
  assert.equal(raw.color, undefined);
  assert.equal(raw.defaultColor, undefined);
  assert.equal(raw.order, undefined);
});

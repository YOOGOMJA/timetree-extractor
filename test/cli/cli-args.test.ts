import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseCliArgs } from '../../src/cli/index.js';

test('parses preview command without options', () => {
  const result = parseCliArgs(['preview']);

  assert.equal(result.ok, true);
  assert.equal(result.command, 'preview');
});

test('parses export command with explicit output path', () => {
  const result = parseCliArgs(['export', '--output', './calendar.ics']);

  assert.equal(result.ok, true);
  assert.equal(result.command, 'export');
  assert.equal(result.output, './calendar.ics');
  assert.equal(result.overwrite, false);
  assert.equal(result.createParentDirectory, false);
});

test('parses export command with overwrite and create-parent-directory flags', () => {
  const result = parseCliArgs([
    'export',
    '--output',
    './out/calendar.ics',
    '--overwrite',
    '--create-parent-directory',
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.command, 'export');
  assert.equal(result.output, './out/calendar.ics');
  assert.equal(result.overwrite, true);
  assert.equal(result.createParentDirectory, true);
});

test('rejects export command without --output', () => {
  const result = parseCliArgs(['export']);

  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /--output/);
});

test('rejects unknown command', () => {
  const result = parseCliArgs(['ship-it']);

  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /unknown command/i);
});

test('rejects empty argv', () => {
  const result = parseCliArgs([]);

  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /command/);
});

test('rejects --output without a value', () => {
  const result = parseCliArgs(['export', '--output']);

  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /--output/);
});

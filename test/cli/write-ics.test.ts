import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { writeIcsFile } from '../../src/cli/write-ics.js';

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'timetree-exporter-write-ics-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('writes ICS bytes to the explicit output path', async () => {
  await withTempDir(async (dir) => {
    const output = path.join(dir, 'calendar.ics');

    const result = await writeIcsFile({ ics: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n', output });

    assert.equal(result.ok, true);
    assert.equal(result.path, output);
    const contents = await readFile(output, 'utf8');
    assert.equal(contents, 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n');
  });
});

test('refuses to overwrite an existing file by default', async () => {
  await withTempDir(async (dir) => {
    const output = path.join(dir, 'calendar.ics');
    await writeFile(output, 'existing');

    const result = await writeIcsFile({ ics: 'new content', output });

    assert.equal(result.ok, false);
    assert.match(result.issues.join('\n'), /exists/);
    const contents = await readFile(output, 'utf8');
    assert.equal(contents, 'existing');
  });
});

test('overwrites an existing file when overwrite is true', async () => {
  await withTempDir(async (dir) => {
    const output = path.join(dir, 'calendar.ics');
    await writeFile(output, 'existing');

    const result = await writeIcsFile({ ics: 'new content', output, overwrite: true });

    assert.equal(result.ok, true);
    const contents = await readFile(output, 'utf8');
    assert.equal(contents, 'new content');
  });
});

test('refuses to create parent directory by default', async () => {
  await withTempDir(async (dir) => {
    const output = path.join(dir, 'nested', 'deep', 'calendar.ics');

    const result = await writeIcsFile({ ics: 'x', output });

    assert.equal(result.ok, false);
    assert.match(result.issues.join('\n'), /(parent|directory|ENOENT)/i);
  });
});

test('creates parent directory when createParentDirectory is true', async () => {
  await withTempDir(async (dir) => {
    const output = path.join(dir, 'nested', 'deep', 'calendar.ics');

    const result = await writeIcsFile({ ics: 'x', output, createParentDirectory: true });

    assert.equal(result.ok, true);
    const contents = await readFile(output, 'utf8');
    assert.equal(contents, 'x');
  });
});

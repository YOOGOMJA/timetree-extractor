import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type WriteIcsFileInput = {
  ics: string;
  output: string;
  overwrite?: boolean;
  createParentDirectory?: boolean;
};

export type WriteIcsFileResult =
  | { ok: true; path: string; issues: [] }
  | { ok: false; path?: string; issues: string[] };

export async function writeIcsFile(input: WriteIcsFileInput): Promise<WriteIcsFileResult> {
  if (input.createParentDirectory) {
    await mkdir(path.dirname(input.output), { recursive: true });
  }

  const flag = input.overwrite ? 'w' : 'wx';
  try {
    await writeFile(input.output, input.ics, { flag });
    return { ok: true, path: input.output, issues: [] };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') {
      return { ok: false, issues: [`output path already exists: ${input.output}`] };
    }
    if (code === 'ENOENT') {
      return { ok: false, issues: [`parent directory does not exist: ${path.dirname(input.output)}`] };
    }
    return { ok: false, issues: [`failed to write ICS file: ${errorMessage(error)}`] };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

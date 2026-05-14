export type ParsedCliArgs =
  | { ok: true; command: 'preview'; issues: [] }
  | {
      ok: true;
      command: 'export';
      output: string;
      overwrite: boolean;
      createParentDirectory: boolean;
      issues: [];
    }
  | { ok: false; issues: string[] };

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  if (argv.length === 0) return { ok: false, issues: ['command is required'] };

  const [command, ...rest] = argv;
  if (command === 'preview') {
    if (rest.length > 0) return { ok: false, issues: [`unknown flag: ${rest[0]}`] };
    return { ok: true, command: 'preview', issues: [] };
  }

  if (command === 'export') return parseExportArgs(rest);

  return { ok: false, issues: [`unknown command: ${command}`] };
}

function parseExportArgs(args: string[]): ParsedCliArgs {
  let output: string | undefined;
  let overwrite = false;
  let createParentDirectory = false;

  for (let cursor = 0; cursor < args.length; cursor += 1) {
    const arg = args[cursor];
    if (arg === '--output') {
      const value = args[cursor + 1];
      if (value === undefined || value.startsWith('--')) {
        return { ok: false, issues: ['--output requires a path'] };
      }
      output = value;
      cursor += 1;
      continue;
    }
    if (arg === '--overwrite') {
      overwrite = true;
      continue;
    }
    if (arg === '--create-parent-directory') {
      createParentDirectory = true;
      continue;
    }
    return { ok: false, issues: [`unknown flag: ${arg}`] };
  }

  if (output === undefined) {
    return { ok: false, issues: ['export command requires --output <path>'] };
  }

  return { ok: true, command: 'export', output, overwrite, createParentDirectory, issues: [] };
}

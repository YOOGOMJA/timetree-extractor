export type SqliteCacheBlock = {
  offset: number;
  data: Uint8Array | ArrayBuffer;
  path?: string;
};

export type ReconstructSqliteCacheBytesInput = {
  fileSize: number;
  blocks: SqliteCacheBlock[];
  path?: string;
};

export type ReconstructSqliteCacheBytesResult =
  | { ok: true; bytes: Uint8Array; issues: [] }
  | { ok: false; bytes?: undefined; issues: string[] };

export function reconstructSqliteCacheBytes(input: ReconstructSqliteCacheBytesInput): ReconstructSqliteCacheBytesResult {
  const issues: string[] = [];

  if (!Number.isInteger(input.fileSize) || input.fileSize < 0) {
    issues.push('fileSize must be a non-negative integer');
  }

  if (!Array.isArray(input.blocks)) {
    issues.push('blocks must be an array');
  }

  if (issues.length > 0) return { ok: false, issues };

  const bytes = new Uint8Array(input.fileSize);
  const blocks = input.path === undefined
    ? input.blocks
    : input.blocks.filter((block) => block.path === input.path);

  for (const [index, block] of blocks.entries()) {
    if (!Number.isInteger(block.offset)) {
      issues.push(`blocks[${index}].offset must be an integer`);
      continue;
    }

    const blockBytes = toUint8Array(block.data);
    const actualOffset = block.offset < 0 ? input.fileSize + block.offset : block.offset;

    if (actualOffset < 0 || actualOffset > input.fileSize) {
      issues.push(`blocks[${index}] starts outside file boundary`);
      continue;
    }

    if (actualOffset + blockBytes.byteLength > input.fileSize) {
      issues.push(`blocks[${index}] exceeds file boundary`);
      continue;
    }

    bytes.set(blockBytes, actualOffset);
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, bytes, issues: [] };
}

function toUint8Array(data: Uint8Array | ArrayBuffer): Uint8Array {
  if (data instanceof Uint8Array) return data;
  return new Uint8Array(data);
}

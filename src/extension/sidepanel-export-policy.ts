export function parseDateRange(
  fromStr: string,
  toStr: string,
): { fromMs: number; toMs: number } | null {
  if (!fromStr || !toStr) return null;
  const fromMs = new Date(`${fromStr}T00:00:00`).getTime();
  const toMs = new Date(`${toStr}T00:00:00`).getTime() + 86_400_000 - 1;
  if (isNaN(fromMs) || isNaN(toMs) || fromMs > toMs) return null;
  return { fromMs, toMs };
}

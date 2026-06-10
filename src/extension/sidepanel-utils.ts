export function escapeHtml(str: string): string {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// TimeTree 웹 origin 판별 (#67). startsWith 비교는 `timetreeapp.com.evil.com` 같은
// 서브도메인 위장을 통과시키므로 URL 파싱으로 host를 정확히 비교한다.
export function isTimetreeUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'timetreeapp.com';
  } catch {
    return false;
  }
}

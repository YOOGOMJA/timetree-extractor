export type TimeTreeEndpointMatch =
  | { ok: true; kind: 'events'; calendarId: number }
  | { ok: true; kind: 'labels'; calendarId: number }
  | { ok: true; kind: 'calendars' }
  | { ok: false; issues: string[] };

export type MatchTimeTreeEndpointInput = {
  method?: string;
  url: string | URL;
  baseUrl?: string;
};

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const TOKEN_LIKE_QUERY_KEYS = new Set([
  'token',
  'access_token',
  'auth',
  'authorization',
  'csrf',
  'csrf_token',
  'api_key',
]);

export function matchTimeTreeEndpoint(input: MatchTimeTreeEndpointInput): TimeTreeEndpointMatch {
  const method = (input.method ?? 'GET').toUpperCase();
  if (MUTATION_METHODS.has(method)) {
    return { ok: false, issues: [`mutation method is not observable: ${method}`] };
  }
  if (method !== 'GET') {
    return { ok: false, issues: [`unsupported method: ${method}`] };
  }

  const url = parseUrl(input.url, input.baseUrl);
  if (!url) return { ok: false, issues: ['url must be a valid TimeTree URL or path'] };
  if (url.hostname !== 'timetreeapp.com') return { ok: false, issues: ['url must be on timetreeapp.com'] };

  const tokenLikeKey = findTokenLikeQueryKey(url);
  if (tokenLikeKey) return { ok: false, issues: [`token-like query key is not allowed: ${tokenLikeKey}`] };

  if (url.pathname === '/api/v2/calendars') return { ok: true, kind: 'calendars' };

  const eventMatch = url.pathname.match(/^\/api\/v1\/calendar\/(\d+)\/events$/);
  if (eventMatch) return { ok: true, kind: 'events', calendarId: Number(eventMatch[1]) };

  const labelMatch = url.pathname.match(/^\/api\/v1\/calendar\/(\d+)\/labels$/);
  if (labelMatch) return { ok: true, kind: 'labels', calendarId: Number(labelMatch[1]) };

  return { ok: false, issues: [`unsupported TimeTree endpoint: ${url.pathname}`] };
}

function parseUrl(url: string | URL, baseUrl = 'https://timetreeapp.com'): URL | null {
  if (url instanceof URL) return url;
  try {
    return new URL(url, baseUrl);
  } catch {
    return null;
  }
}

function findTokenLikeQueryKey(url: URL): string | null {
  for (const key of url.searchParams.keys()) {
    if (TOKEN_LIKE_QUERY_KEYS.has(key.toLowerCase())) return key;
  }
  return null;
}

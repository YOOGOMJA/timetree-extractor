import { matchTimeTreeEndpoint, type TimeTreeEndpointMatch } from './timetree-endpoints.js';

export type ResponseLike = {
  clone(): { json(): Promise<unknown> };
};

export type FetchLike = (input: RequestInfo | URL | string, init?: RequestInit) => Promise<ResponseLike>;

export type ObservedFetchPayload = {
  endpoint: Extract<TimeTreeEndpointMatch, { ok: true }>;
  payload: unknown;
};

export type PassiveFetchObserverOptions = {
  onObserved: (payload: ObservedFetchPayload) => void;
  onIssue?: (issue: string) => void;
  target?: { fetch: FetchLike };
};

export type PassiveFetchObserverHandle = {
  fetch: FetchLike;
  uninstall: () => void;
};

export function installPassiveFetchObserver(originalFetch: FetchLike, options: PassiveFetchObserverOptions): PassiveFetchObserverHandle {
  const observedFetch: FetchLike = async (input, init) => {
    const response = await originalFetch(input, init);
    const endpoint = matchTimeTreeEndpoint({ method: readMethod(input, init), url: readUrl(input) });

    if (endpoint.ok) {
      response.clone().json()
        .then((payload) => options.onObserved({ endpoint, payload }))
        .catch((error: unknown) => options.onIssue?.(`failed to parse observed response: ${errorMessage(error)}`));
      await Promise.resolve();
    }

    return response;
  };

  if (options.target) options.target.fetch = observedFetch;

  return {
    fetch: observedFetch,
    uninstall: () => {
      if (options.target) options.target.fetch = originalFetch;
    },
  };
}

function readUrl(input: RequestInfo | URL | string): string | URL {
  if (typeof input === 'string' || input instanceof URL) return input;
  return input.url;
}

function readMethod(input: RequestInfo | URL | string, init?: RequestInit): string {
  if (init?.method) return init.method;
  if (typeof input === 'object' && !(input instanceof URL) && 'method' in input && typeof input.method === 'string') {
    return input.method;
  }
  return 'GET';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

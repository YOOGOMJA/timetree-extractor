import { installPassiveFetchObserver, type FetchLike } from '../browser/passive-fetch-observer.js';
import { summarizeObservedEventsPayload } from '../browser/observed-payload.js';
import { TIMETREE_OBSERVER_MESSAGE_TYPE } from './content-script.js';

export function installInjectedTimeTreeObserver(target: Window = window): () => void {
  const fetchTarget = target as Window & { fetch: FetchLike };
  const mutableFetchTarget = fetchTarget as unknown as { fetch: FetchLike };
  const originalFetch = fetchTarget.fetch;
  const handle = installPassiveFetchObserver(originalFetch.bind(target), {
    onObserved: ({ endpoint, payload }) => {
      if (endpoint.kind !== 'events') return;
      const summary = summarizeObservedEventsPayload(payload);
      target.postMessage({ type: TIMETREE_OBSERVER_MESSAGE_TYPE, payload: { endpoint, summary } }, 'https://timetreeapp.com');
    },
    onIssue: (issue) => {
      target.postMessage({ type: TIMETREE_OBSERVER_MESSAGE_TYPE, payload: { issue } }, 'https://timetreeapp.com');
    },
  });
  mutableFetchTarget.fetch = handle.fetch;

  return () => {
    handle.uninstall();
    fetchTarget.fetch = originalFetch;
  };
}

export const DEFAULT_FETCH_TIMEOUT_MS = 8000;

/**
 * fetch() with a default deadline so hung upstreams don't pin serverless
 * functions until the platform cap. A caller-provided signal wins.
 */
export async function fetchWithTimeout(
  url,
  options = {},
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
) {
  if (options.signal) {
    return fetch(url, options);
  }
  return fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
}

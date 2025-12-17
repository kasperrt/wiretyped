/**
 * Error raised when a request is intentionally aborted (e.g., via AbortController).
 */
export class AbortError extends Error {
  /** AbortError error-name */
  name = 'AbortError';
}

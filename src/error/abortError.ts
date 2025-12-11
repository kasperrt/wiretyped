import { isErrorType } from './isErrorType.js';

/**
 * Error raised when a request is intentionally aborted (e.g., via AbortController).
 */
export class AbortError extends Error {
  /** AbortError error-name */
  name = 'AbortError';
}

/**
 * Type guard for {@link AbortError}.
 */
export function isAbortError(error: unknown): error is AbortError {
  return isErrorType(AbortError, error);
}

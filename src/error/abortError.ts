import { isErrorType } from './isErrorType.js';

/**
 * Error raised when a request is intentionally aborted (e.g., via AbortController).
 */
export class AbortError extends Error {
  /** AbortError error-name */
  static name = 'AbortError';
}

/**
 * Type guard for {@link AbortError}.
 */
export function isAbortError<Caught>(error: Caught): error is Caught & AbortError {
  return isErrorType(AbortError, error);
}

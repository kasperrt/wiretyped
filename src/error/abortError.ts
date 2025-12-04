import { isErrorType } from './isErrorType';

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
  if (isErrorType(AbortError, error)) {
    return true;
  }

  return false;
}

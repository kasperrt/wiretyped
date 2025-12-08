import { isErrorType } from './isErrorType.js';

/**
 * Error raised when a request exceeds the configured timeout threshold.
 */
export class TimeoutError extends Error {
  /** TimeoutError error-name */
  name = 'TimeoutError';
}

/**
 * Type guard for {@link TimeoutError}.
 */
export function isTimeoutError(error: unknown): error is TimeoutError {
  if (isErrorType(TimeoutError, error)) {
    return true;
  }

  return false;
}

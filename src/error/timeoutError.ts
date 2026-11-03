import { isErrorType } from './isErrorType.js';

/**
 * Error raised when a request exceeds the configured timeout threshold.
 */
export class TimeoutError extends Error {
  /** TimeoutError error-name */
  static name = 'TimeoutError';
}

/**
 * Type guard for {@link TimeoutError}.
 */
export function isTimeoutError<Caught>(error: Caught): error is Caught & TimeoutError {
  return isErrorType(TimeoutError, error);
}

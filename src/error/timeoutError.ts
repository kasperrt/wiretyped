/**
 * Error raised when a request exceeds the configured timeout threshold.
 */
export class TimeoutError extends Error {
  /** TimeoutError error-name */
  static name = 'TimeoutError';
}

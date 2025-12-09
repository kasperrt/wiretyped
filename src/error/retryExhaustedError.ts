import { isErrorType } from './isErrorType.js';
import { unwrapErrorType } from './unwrapErrorType.js';

/**
 * Error representing a a retry attempts exhausted.
 */
export class RetryExhaustedError extends Error {
  /** RetryExhaustedError error-name */
  name = 'RetryExhaustedError';
  /** Internal attempts tried before retry was exhausted */
  #attempts: number;

  /** Creates a new instance of a RetryExhaustedError with accompanying retries attempted */
  constructor(message: string, attempts: number, opts?: ErrorOptions) {
    super(message, opts);
    this.#attempts = attempts;
  }

  /** Attempts tried before retry was suppressed */
  get attempts() {
    return this.#attempts;
  }
}

/**
 * Extract an {@link RetryExhaustedError} from an unknown error value, following nested causes.
 */
export function getRetryExhaustedError(error: unknown): null | RetryExhaustedError {
  return unwrapErrorType(RetryExhaustedError, error);
}

/**
 * Type guard for {@link RetryExhaustedError}.
 */
export function isRetryExhaustedError(error: unknown, shallow?: boolean): error is RetryExhaustedError {
  return isErrorType(RetryExhaustedError, error, shallow);
}

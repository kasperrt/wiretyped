import { isErrorType } from './isErrorType.js';
import { unwrapErrorType } from './unwrapErrorType.js';

/**
 * Error representing a retry attempt suppressed and exited from retrying further.
 */
export class RetrySuppressedError extends Error {
  /** RetrySuppressedError error-name */
  name = 'RetrySuppressedError';
  /** Internal attempts tried before retry was suppressed */
  #attempts: number;

  /** Creates a new instance of a RetrySuppressedError with accompanying retries attempted */
  constructor(message: string, attempts: number, opts?: ErrorOptions) {
    super(message, opts);
    this.#attempts = attempts;
  }

  /** Attempts tried before retry was suppressed */
  get attempts(): number {
    return this.#attempts;
  }
}

/**
 * Extract an {@link RetrySuppressedError} from an unknown error value, following nested causes.
 */
export function getRetrySuppressedError(error: unknown): null | RetrySuppressedError {
  return unwrapErrorType(RetrySuppressedError, error);
}

/**
 * Type guard for {@link RetrySuppressedError}.
 */
export function isRetrySuppressedError(error: unknown, shallow?: boolean): error is RetrySuppressedError {
  return isErrorType(RetrySuppressedError, error, shallow);
}

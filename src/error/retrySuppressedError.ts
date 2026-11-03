import { isErrorType } from './isErrorType.js';
import { unwrapErrorType } from './unwrapErrorType.js';

/**
 * Error representing a retry attempt suppressed and exited from retrying further.
 */
export class RetrySuppressedError extends Error {
  /** RetrySuppressedError error-name */
  static name = 'RetrySuppressedError';
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
 * Extract a {@link RetrySuppressedError} from a thrown value, following nested causes.
 */
export function getRetrySuppressedError<Caught>(error: Caught): null | RetrySuppressedError {
  return unwrapErrorType(RetrySuppressedError, error);
}

/**
 * Type guard for {@link RetrySuppressedError}.
 */
export function isRetrySuppressedError<Caught>(error: Caught): error is Caught & RetrySuppressedError {
  return isErrorType(RetrySuppressedError, error);
}

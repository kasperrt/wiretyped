import { isErrorType } from './isErrorType.js';
import { unwrapErrorType } from './unwrapErrorType.js';

/**
 * Error representing a error constructing URL.
 */
export class ConstructURLError extends Error {
  /** ConstructURLError error-name */
  static name = 'ConstructURLError';
  /** Internal URL for what it looked like */
  #url: string;

  /** Creates a new instance of a ConstructURLError with accompanying URL input */
  constructor(message: string, url: string, opts?: ErrorOptions) {
    super(message, opts);
    this.#url = url;
  }

  /** Attempts tried before retry was suppressed */
  get url(): string {
    return this.#url;
  }
}

/**
 * Extract an {@link ConstructURLError} from an unknown error value, following nested causes.
 */
export function getConstructURLError(error: unknown): null | ConstructURLError {
  return unwrapErrorType(ConstructURLError, error);
}

/**
 * Type guard for {@link ConstructURLError}.
 */
export function isConstructURLError(error: unknown): error is ConstructURLError {
  return isErrorType(ConstructURLError, error);
}

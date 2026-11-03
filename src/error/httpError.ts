import type { FetchResponse } from '../types/request.js';
import { isErrorType } from './isErrorType.js';
import { unwrapErrorType } from './unwrapErrorType.js';

/**
 * Error representing an HTTP response with a non-2xx status code.
 */
export class HTTPError extends Error {
  /** HTTPError error-name */
  static name = 'HTTPError';

  /** Response causing the HTTPError */
  #response: FetchResponse;

  /** Creates a new instance of a HTTPError with defaulting message + response to wrap */
  constructor(response: FetchResponse, message: string = `HTTP Error: ${response.status}`, opts?: ErrorOptions) {
    super(message, opts);
    this.#response = response;
  }

  /**
   * Response causing the HTTPError.
   * Returns a clone when the runtime provides one, so callers can read the body
   * without consuming the original response.
   */
  get response(): FetchResponse {
    return this.#response.clone?.() ?? this.#response;
  }
}

/**
 * Extract an {@link HTTPError} from a thrown value, following nested causes.
 */
export function getHttpError<Caught>(error: Caught): null | HTTPError {
  return unwrapErrorType(HTTPError, error);
}

/**
 * Type guard for {@link HTTPError}.
 */
export function isHttpError<Caught>(error: Caught): error is Caught & HTTPError {
  return isErrorType(HTTPError, error);
}

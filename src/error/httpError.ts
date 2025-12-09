import type { FetchResponse } from '../types/request.js';
import { isErrorType } from './isErrorType.js';
import { unwrapErrorType } from './unwrapErrorType.js';

/**
 * Error representing an HTTP response with a non-2xx status code.
 */
export class HTTPError extends Error {
  /** HTTPError error-name */
  name = 'HTTPError';

  /** Response causing the HTTPError */
  #response: FetchResponse;

  /** Creates a new instance of a HTTPError with defaulting message + response to wrap */
  constructor(response: Response, message: string = `HTTP Error: ${response.status}`, opts?: ErrorOptions) {
    super(message, opts);
    this.#response = response as FetchResponse;
  }

  /**
   * Response causing the HTTPError
   */
  get response(): FetchResponse {
    // We'd rather not error in case something has happened to response and it doesn't have clone
    if (typeof this.#response.clone !== 'function') {
      return this.#response;
    }

    return this.#response.clone() as FetchResponse;
  }
}

/**
 * Extract an {@link HTTPError} from an unknown error value, following nested causes.
 */
export function getHttpError(error: unknown): null | HTTPError {
  return unwrapErrorType(HTTPError, error);
}

/**
 * Type guard for {@link HTTPError}.
 */
export function isHttpError(error: unknown, shallow?: boolean): error is HTTPError {
  return isErrorType(HTTPError, error, shallow);
}

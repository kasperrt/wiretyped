import type { FetchResponse } from '../types/request';
import { isErrorType } from './isErrorType';
import { unwrapErrorType } from './unwrapErrorType';

/**
 * Error representing an HTTP response with a non-2xx status code.
 */
export class HTTPError extends Error {
  /**
   * HTTPError error-name
   */
  name = 'HTTPError';

  /**
   * Response causing the HTTPError
   */
  public response: FetchResponse;

  /**
   * Creates a new instance of a HTTPError with defaulting message + response to wrap
   */
  constructor(response: Response, message: string = `HTTP Error: ${response.status}`, opts?: ErrorOptions) {
    super(message, opts);
    this.response = response as FetchResponse;
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

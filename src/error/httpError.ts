import type { FetchResponse } from '../fetch/types';
import { isErrorType } from './isErrorType';
import { unwrapErrorType } from './unwrapErrorType';

/**
 * Error representing an HTTP response with a non-2xx status code.
 */
export class HTTPError extends Error {
  name = 'HTTPError';
  public response: FetchResponse;

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

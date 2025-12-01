import type { FetchResponse } from '../fetch/types';
import { isErrorType } from './isErrorType';
import { unwrapErrorType } from './unwrapErrorType';

export class HTTPError extends Error {
  name = 'HTTPError';
  public response: FetchResponse;

  constructor(response: Response, message: string = `HTTP Error: ${response.status}`, opts?: ErrorOptions) {
    super(message, opts);
    this.response = response as FetchResponse;
  }
}

export function getHttpError(error: unknown): null | HTTPError {
  return unwrapErrorType(HTTPError, error);
}

export function isHttpError(error: unknown, shallow?: boolean): error is HTTPError {
  return isErrorType(HTTPError, error, shallow);
}

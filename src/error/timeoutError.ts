import { isErrorType } from './isErrorType';

export class TimeoutError extends Error {
  name = 'TimeoutError';
}

export function isTimeoutError(error: unknown): error is TimeoutError {
  if (isErrorType(TimeoutError, error)) {
    return true;
  }

  return false;
}

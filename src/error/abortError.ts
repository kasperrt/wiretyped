import { isErrorType } from './isErrorType';

export class AbortError extends Error {
  name = 'AbortError';
}

export function isAbortError(error: unknown): error is AbortError {
  if (isErrorType(AbortError, error)) {
    return true;
  }

  return false;
}

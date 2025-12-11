import { unwrapErrorType } from './unwrapErrorType';

/**
 * Generic type guard to check if an unknown error matches a specific error class.
 * Traverses nested `cause` chains unless `shallow` is true.
 */
export function isErrorType<T extends Error>(
  // biome-ignore lint/suspicious/noExplicitAny: errorClass needs to handle any type of class handling, hence the any class-type
  errorClass: new (...args: any[]) => T,
  err: unknown,
  shallow = false,
): err is T {
  if (shallow) {
    return err instanceof errorClass;
  }
  return Boolean(unwrapErrorType(errorClass, err));
}

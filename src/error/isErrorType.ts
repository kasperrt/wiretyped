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
  if (err instanceof errorClass) {
    return true;
  }

  if (!(err instanceof Error)) {
    return false;
  }

  if (shallow) {
    return false;
  }

  if (err?.cause instanceof Error) {
    return isErrorType(errorClass, err.cause);
  }

  if (err?.name && errorClass?.name && err?.name === errorClass?.name) {
    return true;
  }

  if (err?.message && errorClass?.name && err?.message.startsWith(errorClass?.name)) {
    return true;
  }

  return false;
}

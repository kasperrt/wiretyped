export function unwrapErrorType<T extends Error>(
  // biome-ignore lint/suspicious/noExplicitAny: errorClass needs to handle any type of class handling, hence the any class-type
  errorClass: new (...args: any[]) => T,
  err: unknown,
): T | null {
  if (err instanceof errorClass) {
    return err;
  }

  if (!(err instanceof Error)) {
    return null;
  }

  if (err?.cause) {
    return unwrapErrorType(errorClass, err.cause as Error);
  }

  if (err?.name && errorClass?.name && err?.name === errorClass?.name) {
    return err as T;
  }

  if (err?.message && errorClass?.name && err?.message.startsWith(errorClass?.name)) {
    return err as T;
  }

  return null;
}

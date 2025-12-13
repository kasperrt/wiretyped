/**
 * Extract a specific error type from an unknown error value, following nested causes.
 */
export function unwrapErrorType<T extends Error>(
  // biome-ignore lint/suspicious/noExplicitAny: errorClass needs to handle any type of class handling, hence the any class-type
  errorClass: new (...args: any[]) => T,
  err: unknown,
): T | null {
  if (!err || typeof err !== 'object') return null;
  let current = err as Error;
  while (current) {
    if (
      current instanceof errorClass ||
      current.name === errorClass?.name ||
      (errorClass?.name && current?.message?.startsWith(errorClass?.name))
    ) {
      return current as T;
    }
    current = current.cause as Error;
  }

  return null;
}

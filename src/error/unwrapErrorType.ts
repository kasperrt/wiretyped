/** Constructor for an `Error` subclass. Parameter types are erased so every subclass constructor is accepted. */
export type ErrorConstructor<T extends Error> = new (...args: never[]) => T;

/**
 * Extract a specific error type from a thrown value, following nested `Error` causes.
 * Name and message checks cover errors that crossed a realm boundary or were rebuilt from a message.
 */
export function unwrapErrorType<T extends Error, Caught>(errorClass: ErrorConstructor<T>, err: Caught): T | null {
  for (let current = err as Error; current instanceof Error; current = current.cause as Error) {
    if (
      current instanceof errorClass ||
      current.name === errorClass.name ||
      (errorClass.name && current.message.startsWith(errorClass.name))
    ) {
      return current as T;
    }
  }

  return null;
}

/** Constructor for an `Error` subclass. Parameter types are erased so every subclass constructor is accepted. */
export type ErrorConstructor<T extends Error> = new (...args: never[]) => T;

/**
 * Extract a specific error type from a thrown value, following nested `Error` causes.
 * Name and message checks cover errors that crossed a realm boundary or were rebuilt from a message.
 */
export function unwrapErrorType<T extends Error, Caught>(errorClass: ErrorConstructor<T>, err: Caught): T | null;
// The implementation stays wide. A name or message match is not an `instanceof`, so it is not `T`.
export function unwrapErrorType(errorClass: new (...args: never[]) => object, err: unknown): unknown {
  for (let current: unknown = err; current instanceof Error; current = current.cause) {
    if (
      current instanceof errorClass ||
      current.name === errorClass.name ||
      (errorClass.name && current.message.startsWith(errorClass.name))
    ) {
      return current;
    }
  }

  return null;
}

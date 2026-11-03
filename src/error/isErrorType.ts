import { type ErrorConstructor, unwrapErrorType } from './unwrapErrorType.js';

/**
 * Generic type guard to check if a thrown value matches a specific error class.
 * Traverses nested `cause` chains.
 */
export function isErrorType<T extends Error, Caught>(errorClass: ErrorConstructor<T>, err: Caught): err is Caught & T {
  return !!unwrapErrorType(errorClass, err);
}

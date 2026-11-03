import type { StandardSchemaV1 } from '@standard-schema/spec';
import { isErrorType } from './isErrorType.js';
import { unwrapErrorType } from './unwrapErrorType.js';

/**
 * Error representing a validation error when validating with @standard-schema
 */
export class ValidationError extends Error {
  /** ValidationError error-name */
  static name = 'ValidationError';
  /** Schema validation issues */
  issues: StandardSchemaV1.Issue[];

  /** Creates a new instance of the ValidationError that extends Error, with accompanying Issues */
  constructor(message: string, issues: StandardSchemaV1.Issue[], opts?: ErrorOptions) {
    super(`${message}; issues: ${JSON.stringify(issues)}`, opts);

    this.issues = issues;
  }
}

/**
 * Type guard for {@link ValidationError}.
 */
export function isValidationError<Caught>(error: Caught): error is Caught & ValidationError {
  return isErrorType(ValidationError, error);
}

/**
 * Extract a {@link ValidationError} from a thrown value, following nested causes.
 */
export function getValidationError<Caught>(error: Caught): null | ValidationError {
  return unwrapErrorType(ValidationError, error);
}

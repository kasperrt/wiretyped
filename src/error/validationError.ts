import type { StandardSchemaV1 } from '@standard-schema/spec';
import { isErrorType } from './isErrorType';
import { unwrapErrorType } from './unwrapErrorType';

/**
 * Error representing a validation error when validating with @standard-schema
 */
export class ValidationError extends Error {
  name = 'ValidationError';
  issues: StandardSchemaV1.Issue[];

  constructor(message: string, issues: StandardSchemaV1.Issue[], opts?: ErrorOptions) {
    super(`${message}; issues: ${JSON.stringify(issues)}`, opts);

    this.issues = issues;
  }
}

/**
 * Type guard for {@link ValidationError}.
 */
export function isValidationError(error: unknown): error is ValidationError {
  if (isErrorType(ValidationError, error)) {
    return true;
  }

  return false;
}

/**
 * Extract an {@link ValidationError} from an unknown error value, following nested causes.
 */
export function getValidationError(error: unknown): null | ValidationError {
  return unwrapErrorType(ValidationError, error);
}

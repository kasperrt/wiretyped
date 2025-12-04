import type { StandardSchemaV1 } from '@standard-schema/spec';
import { ValidationError } from '../error/validationError';
import { type SafeWrapAsync, safeWrap, safeWrapAsync } from './wrap';

/**
 * Validates an input value against a StandardSchemaV1 schema and wraps the result
 * in a tuple-style `[error, value]` response.
 *
 * Behavior:
 * - Calls `schema['~standard'].validate(input)` which may be sync or async.
 * - If the validation returns a Promise, it is awaited and any thrown error is wrapped in
 *   a `ValidationError` with message `"error validating async data"` and returned as `[ValidationError, null]`.
 * - If the validation result contains `issues`, a `ValidationError` with message
 *   `"error validating data"` and the collected issues is returned as `[ValidationError, null]`.
 * - On successful validation without issues, returns `[null, result.value]`.
 *
 * @template T extends StandardSchemaV1
 * @param {StandardSchemaV1.InferInput<T>} input - The value to validate.
 * @param {T} schema - The StandardSchemaV1 schema used for validation.
 * @returns {Promise<SafeWrapAsync<StandardSchemaV1.InferOutput<T>>>}
 *   A promise resolving to `[ValidationError | null, StandardSchemaV1.InferOutput<T> | null]`.
 */
export async function validator<T extends StandardSchemaV1>(
  input: StandardSchemaV1.InferInput<T>,
  schema: T,
): SafeWrapAsync<Error, StandardSchemaV1.InferOutput<T>> {
  type ValidationResult = StandardSchemaV1.Result<StandardSchemaV1.InferOutput<T>>;

  let [err, result] = safeWrap<Error, ValidationResult | Promise<ValidationResult>>(() =>
    schema['~standard'].validate(input),
  );

  if (err) {
    return [new ValidationError('error validating on validation start', [], { cause: err }), null];
  }

  if (result instanceof Promise) {
    const [errAsync, resultAsync] = await safeWrapAsync(() => Promise.resolve(result));
    if (errAsync) {
      return [new ValidationError('error validating async data', [], { cause: errAsync }), null];
    }

    result = resultAsync;
  }

  if (!result) {
    return [new ValidationError('error validating data empty resulting validation', []), null];
  }

  if (typeof result !== 'object') {
    return [new ValidationError('error validation result of wrong type', []), null];
  }

  if ('issues' in result && result.issues) {
    return [new ValidationError('error validating data', [...result.issues]), null];
  }

  return [null, result.value];
}

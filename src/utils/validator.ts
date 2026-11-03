import type { StandardSchemaV1 } from '@standard-schema/spec';
import { ValidationError } from '../error/validationError.js';
import { type SafeWrapAsync, safeWrap, safeWrapAsync } from './wrap.js';

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
 * @template Schema - Standard Schema whose output type is returned on success.
 * @param input - The value to validate. The schema decides whether it is accepted.
 * @param schema - The Standard Schema used for validation.
 * @returns A promise resolving to `[error, value]` where `value` is the schema output.
 */
export async function validator<Schema extends StandardSchemaV1, Input>(
  input: Input,
  schema: Schema,
): SafeWrapAsync<Error, StandardSchemaV1.InferOutput<Schema>> {
  let [err, result] = safeWrap(() => schema['~standard'].validate(input));

  if (err) {
    return [new ValidationError('error validating on validation start', [], { cause: err }), null];
  }

  if (result instanceof Promise) {
    [err, result] = await safeWrapAsync(() => Promise.resolve(result));
    if (err) {
      return [new ValidationError('error validating async data', [], { cause: err }), null];
    }
  }

  if (typeof result !== 'object' || !result) {
    return [new ValidationError('error validation failed with empty results', []), null];
  }

  if ('issues' in result && result.issues) {
    return [new ValidationError('error validating data', [...result.issues]), null];
  }

  return [null, result.value];
}

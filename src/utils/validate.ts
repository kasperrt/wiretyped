import type { StandardSchemaV1 } from '@standard-schema/spec';
import { ValidationError } from '../error/validationError';
import { type SafeWrapAsync, safeWrapAsync } from './wrap';

export async function validate<T extends StandardSchemaV1>(
  input: StandardSchemaV1.InferInput<T>,
  schema: T,
): SafeWrapAsync<StandardSchemaV1.InferOutput<T>> {
  let result = schema['~standard'].validate(input);
  if (result instanceof Promise) {
    const [err, res] = await safeWrapAsync(() => Promise.resolve(result));
    if (err) {
      return [new ValidationError('error validating async data', [], { cause: err }), null];
    }

    result = res;
  }

  if (result.issues) {
    return [new ValidationError('error validating data', [...result.issues]), null];
  }

  return [null, result.value];
}

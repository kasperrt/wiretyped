import { describe, expect, it } from 'vitest';
import { isErrorType } from './isErrorType.js';
import { unwrapErrorType } from './unwrapErrorType.js';
import { ValidationError } from './validationError.js';

describe('isErrorType', () => {
  it('expect shallow to correctly return true', () => {
    const err = new ValidationError('error-validating', []);

    expect(isErrorType(ValidationError, err)).toEqual(true);
  });

  it('expect non ValidationError to return false', () => {
    const err = new Error('error');

    expect(isErrorType(ValidationError, err)).toEqual(false);
  });

  it('expect non ValidationError to return false', () => {
    const validationErr = new ValidationError('error-validating', []);
    const err = new Error('error', { cause: validationErr });

    expect(unwrapErrorType(ValidationError, err)).toStrictEqual(validationErr);
  });
});

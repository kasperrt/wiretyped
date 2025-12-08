import { getValidationError, isValidationError, ValidationError } from './validationError.js';

describe('isErrorType', () => {
  it('expect shallow to correctly return true', () => {
    const err = new ValidationError('error-validating', []);

    expect(isValidationError(err)).toEqual(true);
  });

  it('expect non ValidationError to return false', () => {
    const err = new Error('error');

    expect(isValidationError(err)).toEqual(false);
  });

  it('expect non ValidationError to return false', () => {
    const validationErr = new ValidationError('error-validating', []);
    const err = new Error('error', { cause: validationErr });

    expect(getValidationError(err)).toStrictEqual(validationErr);
  });
});

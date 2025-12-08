import { describe, expect, it } from 'vitest';
import { isErrorType } from './isErrorType.js';

class CustomError extends Error {}

class CustomOtherError extends Error {}

class DifferentError extends Error {}

class TargetError extends Error {}

class OtherError extends Error {}

class NonRecoverableError extends Error {
  constructor(message: string, key: string, options?: ErrorOptions) {
    super(`${NonRecoverableError.name}: ${key} - ${message}`, options);
    Object.setPrototypeOf(this, NonRecoverableError.prototype);
  }
}

describe('isErrorType', () => {
  it('non-error correctly returns false', () => {
    const nonErr = { foo: 'bar' };

    expect(isErrorType(CustomError, nonErr)).toEqual(false);
  });

  it('expect shallow to correctly return true', () => {
    const err = new CustomError('test');

    expect(isErrorType(CustomError, err)).toEqual(true);
  });

  it('expect two layers deep to correctly return true', () => {
    const err = new CustomError('test');
    const wrapped1 = new Error('err1', { cause: err });

    expect(isErrorType(CustomError, wrapped1)).toEqual(true);
  });

  it('expect 7 layers deep to correctly return true', () => {
    const err = new CustomError('test');
    const wrapped1 = new Error('err1', { cause: err });
    const wrapped2 = new Error('err2', { cause: wrapped1 });
    const wrapped3 = new Error('err3', { cause: wrapped2 });
    const wrapped4 = new Error('err4', { cause: wrapped3 });
    const wrapped5 = new Error('err5', { cause: wrapped4 });
    const wrapped6 = new Error('err6', { cause: wrapped5 });
    const wrapped7 = new Error('err7', { cause: wrapped6 });

    expect(isErrorType(CustomError, wrapped7)).toEqual(true);
  });

  it('expect 7 layers deep but shallow check to correctly return false', () => {
    const err = new CustomError('test');
    const wrapped1 = new Error('err1', { cause: err });
    const wrapped2 = new Error('err2', { cause: wrapped1 });
    const wrapped3 = new Error('err3', { cause: wrapped2 });
    const wrapped4 = new Error('err4', { cause: wrapped3 });
    const wrapped5 = new Error('err5', { cause: wrapped4 });
    const wrapped6 = new Error('err6', { cause: wrapped5 });
    const wrapped7 = new Error('err7', { cause: wrapped6 });

    expect(isErrorType(CustomError, wrapped7, true)).toEqual(false);
  });

  it('expect 4 layers deep to correctly return true, even though self wraps another', () => {
    const original = new Error('first');
    const err = new CustomError('test', { cause: original });
    const wrapped1 = new Error('err1', { cause: err });
    const wrapped2 = new Error('err2', { cause: wrapped1 });
    const wrapped3 = new Error('err3', { cause: wrapped2 });
    const wrapped4 = new Error('err4', { cause: wrapped3 });

    expect(isErrorType(CustomError, wrapped4)).toEqual(true);
  });

  it('expect 4 layers deep to correctly return true, even though self wraps another', () => {
    const original = new Error('first');
    const err = new CustomError('test', { cause: original });
    const wrapped1 = new Error('err1', { cause: err });
    const wrapped2 = new CustomOtherError('err2', { cause: wrapped1 });
    const wrapped3 = new Error('err3', { cause: wrapped2 });
    const wrapped4 = new Error('err4', { cause: wrapped3 });

    expect(isErrorType(CustomError, wrapped4)).toEqual(true);
  });

  it('expect false on normal error', () => {
    const err = new Error('err');

    expect(isErrorType(CustomError, err)).toEqual(false);
  });

  it('expect false on wrapped different error', () => {
    const err = new Error('err');
    const err2 = new DifferentError('err2', { cause: err });

    expect(isErrorType(CustomError, err2)).toEqual(false);
  });

  it('expect false on wrapped different error', () => {
    const err = new DifferentError('err');
    const err1 = new Error('err1', { cause: err });
    const err2 = new DifferentError('err2', { cause: err1 });

    expect(isErrorType(CustomError, err2)).toEqual(false);
  });

  it('expect somewhat same named error to return false', () => {
    const original = new Error('first');
    const err = new Error('test', { cause: original });
    const wrapped1 = new Error('err1', { cause: err });
    const wrapped2 = new CustomOtherError('err2', { cause: wrapped1 });
    const wrapped3 = new Error('err3', { cause: wrapped2 });
    const wrapped4 = new Error('err4', { cause: wrapped3 });

    expect(isErrorType(CustomError, wrapped4)).toEqual(false);
  });

  it('expect string turned message to keep type when special error-named casted error', () => {
    const original = new NonRecoverableError('message', 'key');
    const messageWrapped = new Error(original.message);

    expect(isErrorType(NonRecoverableError, messageWrapped)).toEqual(true);
  });

  it('expect wrapped, message -> string-based re-wrapped to lose context as context disappears', () => {
    const original = new NonRecoverableError('message', 'key');
    const wrapped = new Error('wrapped', { cause: original });
    const messageWrapped = new Error(wrapped.message);

    expect(isErrorType(NonRecoverableError, messageWrapped)).toEqual(false);
  });

  it('returns true when error name matches errorClass name even if not instanceof', () => {
    const err = new OtherError('boom');

    expect(err).not.toBeInstanceOf(TargetError);
    Object.defineProperty(err, 'name', { value: TargetError.name });

    expect(err.cause).toBeUndefined();

    const result = isErrorType(TargetError, err);
    expect(result).toBe(true);
  });
});

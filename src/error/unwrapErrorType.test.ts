import { describe, expect, it } from 'vitest';
import { unwrapErrorType } from './unwrapErrorType';

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

describe('unwrapErrorType', () => {
  it('non-error correctly returns false', () => {
    const nonErr = { foo: 'bar' };

    expect(unwrapErrorType(CustomError, nonErr)).toEqual(null);
  });

  it('unwrap simplest layer', () => {
    const err = new NonRecoverableError('non-recoverable-test', 'this-key');
    const unwrapped = unwrapErrorType(NonRecoverableError, err);

    expect(unwrapped?.message).toEqual(err.message);
    expect(unwrapped?.name).toEqual(err.name);
  });

  it('unwrap simplest layer', () => {
    const err = new NonRecoverableError('non-recoverable-test', 'this-key');
    const wrapped = new Error('not-same-error', { cause: err });
    const unwrapped = unwrapErrorType(NonRecoverableError, wrapped);

    expect(unwrapped?.message).toEqual(err.message);
    expect(unwrapped?.name).toEqual(err.name);
  });

  it('unwrap 7 layers', () => {
    const err = new NonRecoverableError('non-recoverable-test', 'this-key');
    const wrapped1 = new Error('err1', { cause: err });
    const wrapped2 = new Error('err2', { cause: wrapped1 });
    const wrapped3 = new Error('err3', { cause: wrapped2 });
    const wrapped4 = new Error('err4', { cause: wrapped3 });
    const wrapped5 = new Error('err5', { cause: wrapped4 });
    const wrapped6 = new Error('err6', { cause: wrapped5 });
    const wrapped7 = new Error('err7', { cause: wrapped6 });

    const unwrapped = unwrapErrorType(NonRecoverableError, wrapped7);

    expect(unwrapped?.message).toEqual(err.message);
    expect(unwrapped?.name).toEqual(err.name);
  });

  it('expect 4 layers deep to correctly return true, even though self wraps another', () => {
    const original = new Error('first');
    const err = new CustomError('test', { cause: original });
    const wrapped1 = new Error('err1', { cause: err });
    const wrapped2 = new Error('err2', { cause: wrapped1 });
    const wrapped3 = new Error('err3', { cause: wrapped2 });
    const wrapped4 = new Error('err4', { cause: wrapped3 });

    const unwrapped = unwrapErrorType(CustomError, wrapped4);

    expect(unwrapped?.message).toEqual(err.message);
    expect(unwrapped?.name).toEqual(err.name);
  });

  it('expect 4 layers deep to correctly return true, even though self wraps another', () => {
    const original = new Error('first');
    const err = new CustomError('test', { cause: original });
    const wrapped1 = new Error('err1', { cause: err });
    const wrapped2 = new CustomOtherError('err2', { cause: wrapped1 });
    const wrapped3 = new Error('err3', { cause: wrapped2 });
    const wrapped4 = new Error('err4', { cause: wrapped3 });

    const unwrapped = unwrapErrorType(CustomError, wrapped4);

    expect(unwrapped?.message).toEqual(err.message);
    expect(unwrapped?.name).toEqual(err.name);
  });

  it('expect false on normal error', () => {
    const err = new Error('err');

    const unwrapped = unwrapErrorType(NonRecoverableError, err);

    expect(unwrapped).toEqual(null);
    expect(unwrapped?.message).not.toEqual(err.message);
    expect(unwrapped?.name).not.toEqual(err.name);
  });

  it('expect false on wrapped different error', () => {
    const err = new Error('err');
    const err2 = new DifferentError('err2', { cause: err });

    const unwrapped = unwrapErrorType(CustomError, err2);

    expect(unwrapped).toEqual(null);
    expect(unwrapped?.message).not.toEqual(err.message);
    expect(unwrapped?.name).not.toEqual(err.name);
  });

  it('expect false on wrapped different error', () => {
    const err = new DifferentError('err');
    const err1 = new Error('err1', { cause: err });
    const err2 = new DifferentError('err2', { cause: err1 });

    const unwrapped = unwrapErrorType(CustomError, err2);

    expect(unwrapped).toEqual(null);
    expect(unwrapped?.message).not.toEqual(err.message);
    expect(unwrapped?.name).not.toEqual(err.name);
  });

  it('expect somewhat same named error to return false', () => {
    const original = new Error('first');
    const err = new Error('test', { cause: original });
    const wrapped1 = new Error('err1', { cause: err });
    const wrapped2 = new CustomOtherError('err2', { cause: wrapped1 });
    const wrapped3 = new Error('err3', { cause: wrapped2 });
    const wrapped4 = new Error('err4', { cause: wrapped3 });

    const unwrapped = unwrapErrorType(CustomError, wrapped4);

    expect(unwrapped).toEqual(null);
    expect(unwrapped?.message).not.toEqual(err.message);
    expect(unwrapped?.name).not.toEqual(err.name);
  });

  it('expect string turned message to keep type when special error-named casted error', () => {
    const err = new NonRecoverableError('message', 'key');
    const messageWrapped = new Error(err.message);

    const unwrapped = unwrapErrorType(NonRecoverableError, messageWrapped);

    expect(unwrapped?.message).toEqual(err.message);
    expect(unwrapped?.name).toEqual(err.name);
  });

  it('expect wrapped, message -> string-based re-wrapped to lose context as context disappears', () => {
    const err = new NonRecoverableError('message', 'key');
    const wrapped = new Error('wrapped', { cause: err });
    const messageWrapped = new Error(wrapped.message);

    const unwrapped = unwrapErrorType(NonRecoverableError, messageWrapped);

    expect(unwrapped).toEqual(null);
    expect(unwrapped?.message).not.toEqual(err.message);
    expect(unwrapped?.name).not.toEqual(err.name);
  });

  it('returns error when name matches errorClass name even if not instanceof', () => {
    const err = new OtherError('boom');

    expect(err).not.toBeInstanceOf(TargetError);
    expect(err.cause).toBeUndefined();

    Object.defineProperty(err, 'name', { value: TargetError.name });

    const unwrapped = unwrapErrorType(TargetError, err);
    expect(unwrapped).toBe(err);
  });
});

import { describe, expect, it } from 'vitest';
import { getRetrySuppressedError, isRetrySuppressedError, RetrySuppressedError } from './retrySuppressedError.js';

describe('RetrySuppressedError', () => {
  it('exposes attempts via getter', () => {
    const err = new RetrySuppressedError('retries suppressed', 2);
    expect(err.attempts).toBe(2);
  });
});

describe('isRetrySuppressedError', () => {
  it('returns true for instances of RetrySuppressedError', () => {
    const err = new RetrySuppressedError('retries suppressed', 2);
    expect(isRetrySuppressedError(err)).toBe(true);
  });

  it('returns false for non RetrySuppressedError errors', () => {
    expect(isRetrySuppressedError(new Error('boom'))).toBe(false);
  });
});

describe('getRetrySuppressedError', () => {
  it('returns the error when passed directly', () => {
    const err = new RetrySuppressedError('retries suppressed', 2);
    expect(getRetrySuppressedError(err)).toBe(err);
  });

  it('unwraps nested causes', () => {
    const err = new RetrySuppressedError('retries suppressed', 2);
    const wrapped = new Error('outer', { cause: err });
    expect(getRetrySuppressedError(wrapped)).toBe(err);
  });

  it('returns null when no RetrySuppressedError exists', () => {
    const wrapped = new Error('outer', { cause: new Error('inner') });
    expect(getRetrySuppressedError(wrapped)).toBeNull();
  });
});

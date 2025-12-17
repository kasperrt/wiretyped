import { describe, expect, it } from 'vitest';
import { getRetryExhaustedError, isRetryExhaustedError, RetryExhaustedError } from './retryExhaustedError.js';

describe('RetryExhaustedError', () => {
  it('exposes attempts via getter', () => {
    const err = new RetryExhaustedError('retries exhausted', 3);
    expect(err.attempts).toBe(3);
  });
});

describe('isRetryExhaustedError', () => {
  it('returns true for instances of RetryExhaustedError', () => {
    const err = new RetryExhaustedError('retries exhausted', 3);
    expect(isRetryExhaustedError(err)).toBe(true);
  });

  it('returns false for non RetryExhaustedError errors', () => {
    expect(isRetryExhaustedError(new Error('boom'))).toBe(false);
  });
});

describe('getRetryExhaustedError', () => {
  it('returns the error when passed directly', () => {
    const err = new RetryExhaustedError('retries exhausted', 3);
    expect(getRetryExhaustedError(err)).toBe(err);
  });

  it('unwraps nested causes', () => {
    const err = new RetryExhaustedError('retries exhausted', 3);
    const wrapped = new Error('outer', { cause: err });
    expect(getRetryExhaustedError(wrapped)).toBe(err);
  });

  it('returns null when no RetryExhaustedError exists', () => {
    const wrapped = new Error('outer', { cause: new Error('inner') });
    expect(getRetryExhaustedError(wrapped)).toBeNull();
  });
});

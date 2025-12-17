import { describe, expect, it } from 'vitest';
import { AbortError, isAbortError } from './abortError.js';

describe('isAbortError', () => {
  it('returns true for instances of AbortError', () => {
    const err = new AbortError('stopped');
    expect(isAbortError(err)).toBe(true);
  });

  it('returns false for non-abort errors', () => {
    expect(isAbortError(new Error('boom'))).toBe(false);
  });
});
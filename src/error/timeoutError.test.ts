import { describe, expect, it } from 'vitest';
import { isTimeoutError, TimeoutError } from './timeoutError.js';

describe('isTimeoutError', () => {
  it('returns true for instances of TimeoutError', () => {
    const err = new TimeoutError('timed out');
    expect(isTimeoutError(err)).toBe(true);
  });

  it('returns false for non TimeoutError errors', () => {
    expect(isTimeoutError(new Error('boom'))).toBe(false);
  });
});

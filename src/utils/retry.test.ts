import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isErrorType } from '../error/isErrorType.js';
import { RetryExhaustedError } from '../error/retryExhaustedError.js';
import { RetrySuppressedError } from '../error/retrySuppressedError.js';
import { unwrapErrorType } from '../error/unwrapErrorType.js';
import { retry } from './retry.js';
import type { SafeWrapAsync } from './wrap.js';

describe('retry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns data immediately when fn succeeds on first attempt', async () => {
    const fn: () => SafeWrapAsync<Error, string> = vi.fn().mockResolvedValueOnce([null, 'ok']);

    const promise = retry<string>({
      fn,
      attempts: 3,
      timeout: 100,
    });

    const [err, data] = await promise;

    expect(err).toBeNull();
    expect(data).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries until fn succeeds within the allowed number of attempts', async () => {
    const error = new Error('temporary error');

    const fn: () => SafeWrapAsync<Error, string> = vi
      .fn()
      .mockResolvedValueOnce([error, null]) // attempt 1
      .mockResolvedValueOnce([error, null]) // attempt 2
      .mockResolvedValueOnce([null, 'ok']); // attempt 3

    const promise = retry<string>({
      fn,
      attempts: 3,
      timeout: 100,
    });

    // First call happens immediately
    expect(fn).toHaveBeenCalledTimes(1);

    // Advance once for attempt 2
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(2);

    // Advance again for attempt 3
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(3);

    const [err, data] = await promise;

    expect(err).toBeNull();
    expect(data).toBe('ok');
  });

  it('does not retry when errFn returns true and returns the error', async () => {
    const fatalError = new Error('fatal');

    const fn: () => SafeWrapAsync<Error, string> = vi.fn().mockResolvedValueOnce([fatalError, null]);

    const errFn = vi.fn<(e: Error) => boolean>().mockReturnValue(true);

    const [err, data] = await retry<string>({
      fn,
      attempts: 5,
      timeout: 100,
      errFn,
    });

    // Only called once, because errFn says "do not retry"
    expect(fn).toHaveBeenCalledTimes(1);
    expect(errFn).toHaveBeenCalledTimes(1);
    expect(errFn).toHaveBeenCalledWith(fatalError);

    expect(data).toBeNull();
    expect(isErrorType(RetrySuppressedError, err)).toBe(true);
    expect(unwrapErrorType(RetrySuppressedError, err)?.attempts).toBe(1);
    expect(err).toStrictEqual(new RetrySuppressedError('error further retries suppressed', 1, { cause: fatalError }));
  });

  it('retries up to the configured attempts and then returns last error', async () => {
    const error = new Error('still bad');

    const fn: () => SafeWrapAsync<Error, string> = vi.fn().mockResolvedValue([error, null]); // always fails

    const attempts = 2;
    const timeout = 100;

    const promise = retry<string>({
      fn,
      attempts,
      timeout,
    });

    // attempt 1
    expect(fn).toHaveBeenCalledTimes(1);

    // attempt 2
    await vi.advanceTimersByTimeAsync(timeout);
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(2);

    // attempt 3 (attempt > attempts triggers "Attempts exceeded" branch)
    await vi.advanceTimersByTimeAsync(timeout);
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(3);

    const [err, data] = await promise;

    expect(data).toBeNull();
    expect(isErrorType(RetryExhaustedError, err)).toBe(true);
    expect(unwrapErrorType(RetryExhaustedError, err)?.attempts).toBe(3);
    expect(err).toStrictEqual(new RetryExhaustedError('error retries exhausted', 3, { cause: error }));
  });
});

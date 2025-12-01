// retry.test.ts
import { afterEach, beforeEach, describe, expect, it, type MockedFunction, vi } from 'vitest';
import { retry } from './retry';
import type { SafeWrapAsync } from './wrap';

describe('retry', () => {
  let consoleErrorSpy: MockedFunction<typeof console.error>;

  beforeEach(() => {
    vi.useFakeTimers();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.useRealTimers();
  });

  it('returns data immediately when fn succeeds on first attempt', async () => {
    const fn: () => SafeWrapAsync<Error, string> = vi.fn().mockResolvedValueOnce([null, 'ok']);

    const promise = retry<string>({
      name: 'immediateSuccess',
      fn,
      attempts: 3,
      timeout: 100,
      log: true,
    });

    const [err, data] = await promise;

    expect(err).toBeNull();
    expect(data).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('retries until fn succeeds within the allowed number of attempts', async () => {
    const error = new Error('temporary error');

    const fn: () => SafeWrapAsync<Error, string> = vi
      .fn()
      .mockResolvedValueOnce([error, null]) // attempt 1
      .mockResolvedValueOnce([error, null]) // attempt 2
      .mockResolvedValueOnce([null, 'ok']); // attempt 3

    const promise = retry<string>({
      name: 'eventualSuccess',
      fn,
      attempts: 3,
      timeout: 100,
      log: true,
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
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('does not retry when errFn returns true and returns the error', async () => {
    const fatalError = new Error('fatal');

    const fn: () => SafeWrapAsync<Error, string> = vi.fn().mockResolvedValueOnce([fatalError, null]);

    const errFn = vi.fn<(e: Error) => boolean>().mockReturnValue(true);

    const [err, data] = await retry<string>({
      name: 'fatalCase',
      fn,
      attempts: 5,
      timeout: 100,
      errFn,
      log: true,
    });

    // Only called once, because errFn says "do not retry"
    expect(fn).toHaveBeenCalledTimes(1);
    expect(errFn).toHaveBeenCalledTimes(1);
    expect(errFn).toHaveBeenCalledWith(fatalError);

    expect(data).toBeNull();
    expect(err).toBe(fatalError);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy.mock.calls[0][0]).toContain("fatalCase retrier: Didn't match error-condition for retrier");
  });

  it('retries up to the configured attempts and then returns last error', async () => {
    const error = new Error('still bad');

    const fn: () => SafeWrapAsync<Error, string> = vi.fn().mockResolvedValue([error, null]); // always fails

    const attempts = 2;
    const timeout = 100;

    const promise = retry<string>({
      name: 'exhaustedCase',
      fn,
      attempts,
      timeout,
      log: true,
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
    expect(err).toBe(error);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy.mock.calls[0][0]).toContain(
      'exhaustedCase retrier: Attempts exceeded allowed number of retries.',
    );
  });

  it('does not log when log is set to false', async () => {
    const error = new Error('oops');

    const fn: () => SafeWrapAsync<Error, string> = vi.fn().mockResolvedValue([error, null]);

    const attempts = 1;
    const timeout = 50;

    const promise = retry<string>({
      name: 'silentCase',
      fn,
      attempts,
      timeout,
      log: false,
    });

    // attempt 1
    expect(fn).toHaveBeenCalledTimes(1);

    // attempt 2 (this will exceed attempts and return error)
    await vi.advanceTimersByTimeAsync(timeout);
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(2);

    const [err, data] = await promise;

    expect(data).toBeNull();
    expect(err).toBe(error);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});

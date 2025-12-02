import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CacheClient } from './client';

describe('CacheClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0)); // Date.now() === 0
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const advance = (ms: number) => {
    vi.advanceTimersByTime(ms);
  };

  it('returns result from fetch and caches it', async () => {
    const client = new CacheClient({ ttl: 5_000, cleanupInterval: 30_000 });

    const fetchFn = vi.fn().mockResolvedValue('data');

    // @ts-expect-error
    const [err1, result1] = await client.get('key', () => fetchFn().then((d) => [null, d] as const));
    expect(err1).toBeNull();
    expect(result1).toBe('data');
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Second call should return cached value and not call fetchFn again
    const fetchFn2 = vi.fn().mockResolvedValue('other');
    // @ts-expect-error
    const [err2, result2] = await client.get('key', () => fetchFn2().then((d) => [null, d] as const));
    expect(err2).toBeNull();
    expect(result2).toBe('data');
    expect(fetchFn2).not.toHaveBeenCalled();
  });

  it('reuses the same pending promise for concurrent requests with same key', async () => {
    const client = new CacheClient({ ttl: 5_000, cleanupInterval: 30_000 });

    let resolveRequest: (value: string) => void = () => {};
    const underlyingPromise = new Promise<string>((resolve) => {
      resolveRequest = resolve;
    });

    const fetchFn = vi.fn().mockReturnValue(underlyingPromise);

    const p1 = client.get('key', () =>
      fetchFn()
        // @ts-expect-error
        .then((d) => [null, d] as const)
        // @ts-expect-error
        .catch((e) => [e as Error, null] as const),
    );
    const p2 = client.get('key', () =>
      fetchFn()
        // @ts-expect-error
        .then((d) => [null, d] as const)
        // @ts-expect-error
        .catch((e) => [e as Error, null] as const),
    );

    // Only one actual fetch should be started
    expect(fetchFn).toHaveBeenCalledTimes(1);
    // Both get calls should return the same promise instance
    expect(p1).toBe(p2);

    resolveRequest('value');

    await expect(p1).resolves.toEqual([null, 'value']);
    await expect(p2).resolves.toEqual([null, 'value']);

    // After it resolves, next call should use the cached value, not call fetch again
    const fetchFn2 = vi.fn().mockResolvedValue('other');
    // @ts-expect-error
    const [, p3] = await client.get('key', () => fetchFn2().then((d) => [null, d] as const));

    expect(fetchFn2).not.toHaveBeenCalled();
    expect(p3).toBe('value');
  });

  it('respects ttl and refetches after default ttl expires (no fake timers)', async () => {
    const nowSpy = vi.spyOn(Date, 'now');

    // First call at t = 0
    nowSpy.mockReturnValue(0);

    const client = new CacheClient({ ttl: 1_000, cleanupInterval: 30_000 });

    const fetchFn = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');
    // @ts-expect-error
    const [err1, result1] = await client.get('key', () => fetchFn().then((d) => [null, d] as const));
    expect(err1).toBeNull();
    expect(result1).toBe('first');
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Second call at t = 35_000 (past ttl)
    nowSpy.mockReturnValue(35_000);
    // @ts-expect-error
    const [err2, result2] = await client.get('key', () => fetchFn().then((d) => [null, d] as const));
    expect(err2).toBeNull();
    expect(result2).toBe('second');
    expect(fetchFn).toHaveBeenCalledTimes(2);

    nowSpy.mockRestore();
  });

  it('respects custom ttl parameter per call', async () => {
    const client = new CacheClient({ ttl: 10_000, cleanupInterval: 30_000 });

    const fetchFn = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');

    // Use a much shorter ttl for this call
    // @ts-expect-error
    const [err1, result1] = await client.get('key', () => fetchFn().then((d) => [null, d] as const), 100);
    expect(err1).toBeNull();
    expect(result1).toBe('first');
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Not yet expired
    advance(50);
    // @ts-expect-error
    const [err2, result2] = await client.get('key', () => fetchFn().then((d) => [null, d] as const), 100);
    expect(err2).toBeNull();
    expect(result2).toBe('first');
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Now expire it
    advance(100);

    // @ts-expect-error
    const [err3, result3] = await client.get('key', () => fetchFn().then((d) => [null, d] as const), 100);
    expect(err3).toBeNull();
    expect(result3).toBe('second');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('propagates errors and does not cache rejected requests', async () => {
    const client = new CacheClient({ ttl: 5_000, cleanupInterval: 30_000 });

    const error = new Error('fail');
    const failingFetch = vi.fn().mockRejectedValue(error);

    const [errFail] = await client.get('key', () =>
      failingFetch()
        // @ts-expect-error
        .then((d) => [null, d] as const)
        // @ts-expect-error
        .catch((e) => [e as Error, null] as const),
    );
    expect(errFail).toEqual(error);
    expect(failingFetch).toHaveBeenCalledTimes(1);

    // After a failure, a new request with the same key should be executed and cached
    const successFetch = vi.fn().mockResolvedValue('ok');
    const [errOk, result] = await client.get('key', () =>
      successFetch()
        // @ts-expect-error
        .then((d) => [null, d] as const)
        // @ts-expect-error
        .catch((e) => [e as Error, null] as const),
    );

    expect(successFetch).toHaveBeenCalledTimes(1);
    expect(errOk).toBeNull();
    expect(result).toBe('ok');

    // Subsequent call should hit cache and not call successFetch again
    const successFetch2 = vi.fn().mockResolvedValue('other');
    const [errCached, cached] = await client.get('key', () =>
      successFetch2()
        // @ts-expect-error
        .then((d) => [null, d] as const)
        // @ts-expect-error
        .catch((e) => [e as Error, null] as const),
    );
    expect(errCached).toBeNull();
    expect(cached).toBe('ok');
    expect(successFetch2).not.toHaveBeenCalled();
  });

  it('returns tuple errors when resolver throws synchronously and allows retry', async () => {
    const client = new CacheClient({ ttl: 5_000, cleanupInterval: 30_000 });
    const error = new Error('boom');
    const throwing = vi.fn(() => {
      throw error;
    });

    const [errThrow, resThrow] = await client.get('key', () =>
      new Promise((resolve) => resolve(throwing())).then(
        (d) => [null, d] as const,
        (e) => [e as Error, null] as const,
      ),
    );

    expect(errThrow).toEqual(error);
    expect(resThrow).toBeNull();
    expect(throwing).toHaveBeenCalledTimes(1);

    const success = vi.fn().mockResolvedValue('ok');
    const [errOk, resOk] = await client.get('key', () =>
      success().then(
        // @ts-expect-error
        (d) => [null, d] as const,
        // @ts-expect-error
        (e) => [e as Error, null] as const,
      ),
    );

    expect(errOk).toBeNull();
    expect(resOk).toBe('ok');
    expect(success).toHaveBeenCalledTimes(1);
  });

  it('cleanup interval does not break cache behavior over time', async () => {
    const client = new CacheClient({ ttl: 1_000, cleanupInterval: 500 });

    const fetchFn = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');
    // @ts-expect-error
    const [err1, result1] = await client.get('key', () => fetchFn().then((d) => [null, d] as const));
    expect(err1).toBeNull();
    expect(result1).toBe('first');
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Let some cleanup cycles run and also expire the entry
    advance(5_000);
    // @ts-expect-error
    const [err2, result2] = await client.get('key', () => fetchFn().then((d) => [null, d] as const));
    expect(err2).toBeNull();
    expect(result2).toBe('second');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

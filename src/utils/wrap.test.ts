import { describe, expect, it } from 'vitest';
import { safeWrap, safeWrapAsync } from './wrap.js';

class CustomError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CustomError';
  }
}

describe('safeWrap', () => {
  it('returns [null, data] when the function succeeds', () => {
    const [err, data] = safeWrap(() => 42);

    expect(err).toBeNull();
    expect(data).toBe(42);
  });

  it('returns [null, parsedJson] when JSON.parse succeeds', () => {
    const json = '{"foo":"bar"}';

    const [err, data] = safeWrap(() => JSON.parse(json) as { foo: string });

    expect(err).toBeNull();
    expect(data).toEqual({ foo: 'bar' });
  });

  it('returns [error, null] when the function throws', () => {
    const [err, data] = safeWrap(() => {
      throw new Error('boom');
    });

    expect(data).toBeNull();
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('boom');
  });

  it('respects the generic ErrorType when casting', () => {
    const [err, data] = safeWrap<CustomError>(() => {
      throw new CustomError('custom boom');
    });

    expect(data).toBeNull();
    expect(err).toBeInstanceOf(CustomError);
    expect((err as CustomError).message).toBe('custom boom');
  });
});

describe('safeWrapAsync', () => {
  it('returns [null, data] when the promise resolves', async () => {
    const [err, data] = await safeWrapAsync(() => {
      return Promise.resolve('ok');
    });

    expect(err).toBeNull();
    expect(data).toBe('ok');
  });

  it('returns [error, null] when the promise rejects', async () => {
    const [err, data] = await safeWrapAsync(() => {
      return Promise.reject(new Error('async boom'));
    });

    expect(data).toBeNull();
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('async boom');
  });

  it('returns [error, null] when the factory throws before returning a promise', async () => {
    const [err, data] = await safeWrapAsync(() => {
      // synchronous throw inside factory, before any Promise is created
      throw new Error('sync boom before promise');
    });

    expect(data).toBeNull();
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('sync boom before promise');
  });

  it('respects the generic ErrorType when casting (async)', async () => {
    const [err, data] = await safeWrapAsync<CustomError, string>(() => {
      throw new CustomError('async custom boom');
    });

    expect(data).toBeNull();
    expect(err).toBeInstanceOf(CustomError);
    expect((err as CustomError).message).toBe('async custom boom');
  });

  it('works with async JSON.parse usage', async () => {
    const json = '{"value": 123}';

    const [err, data] = await safeWrapAsync<Error, { value: number }>(async () => {
      // simulating some async work before parsing
      await Promise.resolve();
      return JSON.parse(json);
    });

    expect(err).toBeNull();
    expect(data).toEqual({ value: 123 });
  });

  it('captures JSON.parse errors inside async function', async () => {
    const invalidJson = '{ value: 123 '; // invalid JSON

    const [err, data] = await safeWrapAsync<Error, unknown>(async () => {
      await Promise.resolve();
      return JSON.parse(invalidJson);
    });

    expect(data).toBeNull();
    expect(err).toBeInstanceOf(SyntaxError);
  });
});

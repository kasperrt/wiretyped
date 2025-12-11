import { afterEach, beforeEach, describe, expect, type MockedFunction, test, vi } from 'vitest';
import { z } from 'zod';
import { CacheClient } from '../cache/client.js';
import { AbortError } from '../error/abortError.js';
import { isHttpError } from '../error/httpError.js';
import { isErrorType } from '../error/isErrorType.js';
import { getRetryExhaustedError, RetryExhaustedError } from '../error/retryExhaustedError.js';
import { getRetrySuppressedError, RetrySuppressedError } from '../error/retrySuppressedError.js';
import { TimeoutError } from '../error/timeoutError.js';
import { ValidationError } from '../error/validationError.js';
import type { FetchClientProvider, FetchClientProviderDefinition, Options, RequestOptions } from '../types/request.js';
import * as signals from '../utils/signals.js';
import { RequestClient } from './client.js';
import type { RequestDefinitions } from './types.js';

type MockedFetchClientProvider = MockedFunction<FetchClientProvider>;

const MOCK_FETCH_PROVIDER = vi.fn(function (
  this: FetchClientProviderDefinition,
  baseUrl: string | URL,
  options: Options,
) {
  Object.defineProperties(this, {
    baseUrl: {
      value: typeof baseUrl === 'string' ? baseUrl : baseUrl.toString(),
      writable: false,
    },
    opts: { value: options, writable: false },
  });
}) as unknown as MockedFetchClientProvider;

MOCK_FETCH_PROVIDER.prototype.get = vi.fn();
MOCK_FETCH_PROVIDER.prototype.post = vi.fn();
MOCK_FETCH_PROVIDER.prototype.put = vi.fn();
MOCK_FETCH_PROVIDER.prototype.patch = vi.fn();
MOCK_FETCH_PROVIDER.prototype.delete = vi.fn();
MOCK_FETCH_PROVIDER.prototype.config = vi.fn();
MOCK_FETCH_PROVIDER.prototype.dispose = vi.fn();

const DEFAULT_HEADERS = {
  Accept: 'application/json',
};

const DEFAULT_HEADERS_SEND = {
  'Content-Type': 'application/json',
};

const defaultEndpoints = {
  '/api/noop': {
    get: {
      response: z.object({
        data: z.string(),
      }),
    },
  },
} satisfies RequestDefinitions;
const DEFAULT_REQUEST_OPTS: RequestOptions = { timeout: false, retry: { limit: 0 } };

// AsyncWrap helpers
// biome-ignore lint/suspicious/noExplicitAny: We are testing and don't want to go too deep in on types
const asyncOk = (response: any): Promise<[null, any]> => Promise.resolve([null, response]);
// biome-ignore lint/suspicious/noExplicitAny: We are testing and don't want to go too deep in on types
const asyncErr = (error: any): Promise<[any, null]> => Promise.resolve([error, null]);

describe('RequestClient', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Create', () => {
    test('Constructs http provider with expected params, and class has expected properties', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const requestClient = new RequestClient({
        fetchProvider: MOCK_FETCH_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        endpoints: defaultEndpoints,
        validation: true,
        fetchOpts: { timeout: 10_000, retry: { limit: 0 }, credentials: 'include', mode: 'cors' },
        debug: true,
      });

      expect(MOCK_FETCH_PROVIDER).toHaveBeenCalledOnce();
      const firstCall = MOCK_FETCH_PROVIDER.mock.calls[0];
      const options = firstCall[1];

      expect(options).toEqual({
        credentials: 'include',
        mode: 'cors',
        headers: new Headers(DEFAULT_HEADERS),
      });

      expect(requestClient).toHaveProperty('url');
      expect(requestClient).toHaveProperty('get');
      expect(requestClient).toHaveProperty('put');
      expect(requestClient).toHaveProperty('post');
      expect(requestClient).toHaveProperty('patch');
      expect(requestClient).toHaveProperty('delete');
      expect(requestClient).toHaveProperty('config');
      expect(requestClient).toHaveProperty('download');

      consoleLogSpy.mockRestore();
      consoleDebugSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    test('Constructs http provider with expected params, and class has expected properties, but missing sseProvider doesnt crash', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const requestClient = new RequestClient({
        fetchProvider: MOCK_FETCH_PROVIDER,
        // @ts-expect-error
        sseProvider: null,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: DEFAULT_REQUEST_OPTS,
        endpoints: defaultEndpoints,
        validation: true,
        debug: true,
      });

      expect(MOCK_FETCH_PROVIDER).toHaveBeenCalledOnce();
      const firstCall = MOCK_FETCH_PROVIDER.mock.calls[0];
      const options = firstCall[1];

      expect(options).toEqual({
        headers: new Headers(DEFAULT_HEADERS),
      });

      expect(requestClient).toHaveProperty('url');
      expect(requestClient).toHaveProperty('get');
      expect(requestClient).toHaveProperty('put');
      expect(requestClient).toHaveProperty('post');
      expect(requestClient).toHaveProperty('patch');
      expect(requestClient).toHaveProperty('delete');
      expect(requestClient).toHaveProperty('config');
      expect(requestClient).toHaveProperty('download');

      consoleLogSpy.mockRestore();
      consoleDebugSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });
  });

  describe('Lifecycle', () => {
    test('dispose delegates to cache client and fetch provider if available', () => {
      const disposeSpy = vi.spyOn(CacheClient.prototype, 'dispose');
      const fetchDisposeSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'dispose');

      const requestClient = new RequestClient({
        fetchProvider: MOCK_FETCH_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: DEFAULT_REQUEST_OPTS,
        endpoints: defaultEndpoints,
        validation: true,
      });

      requestClient.dispose();

      expect(disposeSpy).toHaveBeenCalledTimes(1);
      expect(fetchDisposeSpy).toHaveBeenCalledTimes(1);
      disposeSpy.mockRestore();
      fetchDisposeSpy.mockRestore();
    });
  });

  describe('Retry', () => {
    test("Calls provider's get method with expected retry params", async () => {
      const mockGetEndpoints = {
        '/api/my-endpoint': {
          get: { response: z.object({ data: z.string() }) },
        },
      } satisfies RequestDefinitions;

      const getSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'get').mockImplementation(() => {
        const response = {
          json: () => ({ data: 'GET request data no params' }),
          text: () => '{ "data": "GET request data no params" }',
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        };

        // AsyncWrap<Error, FetchResponse>
        return [null, response];
      });

      const requestClient: RequestClient<typeof mockGetEndpoints> = new RequestClient({
        fetchProvider: MOCK_FETCH_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: DEFAULT_REQUEST_OPTS,
        endpoints: mockGetEndpoints,
        validation: true,
      });
      const retryObject = {
        limit: 1,
      };

      const [err, res] = await requestClient.get('/api/my-endpoint', null, {
        retry: retryObject,
      });

      expect(err).toBeNull();
      expect(res).toEqual({ data: 'GET request data no params' });
      expect(getSpy).toHaveBeenCalledOnce();
      // Retry/timeout are handled inside RequestClient; the provider only receives fetch options.
      expect(getSpy).toHaveBeenCalledWith('api/my-endpoint', {});
    });

    test('uses default retry limit when none provided', async () => {
      vi.useFakeTimers();
      const mockGetEndpoints = {
        '/api/my-endpoint': {
          get: { response: z.object({ data: z.string() }) },
        },
      } satisfies RequestDefinitions;

      const getSpy = vi
        .spyOn(MOCK_FETCH_PROVIDER.prototype, 'get')
        .mockImplementationOnce(async () => asyncErr(new TypeError('transient')))
        .mockImplementationOnce(async () => asyncErr(new TypeError('transient-2')))
        .mockImplementationOnce(async () =>
          asyncOk({
            json: () => ({ data: 'recovered' }),
            text: () => '{ "data": "recovered" }',
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
          }),
        );

      const client: RequestClient<typeof mockGetEndpoints> = new RequestClient({
        fetchProvider: MOCK_FETCH_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: { timeout: false }, // no retry provided -> default { limit: 2 }
        endpoints: mockGetEndpoints,
        validation: false,
      });

      const promise = client.get('/api/my-endpoint', null);

      await vi.advanceTimersByTimeAsync(2000);
      await Promise.resolve();

      const [err, res] = await promise;

      expect(err).toBeNull();
      expect(res).toEqual({ data: 'recovered' });
      expect(getSpy).toHaveBeenCalledTimes(3); // initial + 2 retries (default limit)
      vi.useRealTimers();
    });

    test('honors numeric retry option (simple retry)', async () => {
      vi.useFakeTimers();
      const mockGetEndpoints = {
        '/api/my-endpoint': {
          get: { response: z.object({ data: z.string() }) },
        },
      } satisfies RequestDefinitions;

      const getSpy = vi
        .spyOn(MOCK_FETCH_PROVIDER.prototype, 'get')
        .mockImplementationOnce(async () => asyncErr(new TypeError('first')))
        .mockImplementationOnce(async () => asyncErr(new TypeError('second')))
        .mockImplementationOnce(async () => asyncErr(new TypeError('third')))
        .mockImplementationOnce(async () => asyncErr(new TypeError('fourth')))
        .mockImplementationOnce(async () => asyncErr(new TypeError('fifth')))
        .mockImplementationOnce(async () =>
          asyncOk({
            json: () => ({ data: 'eventual success' }),
            text: () => '{ "data": "eventual success" }',
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
          }),
        );

      const client: RequestClient<typeof mockGetEndpoints> = new RequestClient({
        fetchProvider: MOCK_FETCH_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: { timeout: false, retry: 5 },
        endpoints: mockGetEndpoints,
        validation: false,
      });

      const promise = client.get('/api/my-endpoint', null);

      await vi.advanceTimersByTimeAsync(5000);
      await Promise.resolve();

      const [err, res] = await promise;

      expect(err).toBeNull();
      expect(res).toEqual({ data: 'eventual success' });
      expect(getSpy).toHaveBeenCalledTimes(6); // 1 initial + 5 simple retries
      vi.useRealTimers();
    });

    test('uses default retry limit when limit is null in object retry', async () => {
      vi.useFakeTimers();
      const mockGetEndpoints = {
        '/api/my-endpoint': {
          get: { response: z.object({ data: z.string() }) },
        },
      } satisfies RequestDefinitions;

      const getSpy = vi
        .spyOn(MOCK_FETCH_PROVIDER.prototype, 'get')
        .mockImplementationOnce(async () => asyncErr(new TypeError('first')))
        .mockImplementationOnce(async () => asyncErr(new TypeError('second')))
        .mockImplementationOnce(async () =>
          asyncOk({
            json: () => ({ data: 'default limit success' }),
            text: () => '{ "data": "default limit success" }',
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
          }),
        );

      const client: RequestClient<typeof mockGetEndpoints> = new RequestClient({
        fetchProvider: MOCK_FETCH_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        // @ts-expect-error
        fetchOpts: { timeout: false, retry: { limit: null, timeout: 1 } },
        endpoints: mockGetEndpoints,
        validation: false,
      });

      const promise = client.get('/api/my-endpoint', null, { retry: { limit: undefined, timeout: 1 } });

      await vi.advanceTimersByTimeAsync(2000);
      await Promise.resolve();

      const [err, res] = await promise;

      expect(err).toBeNull();
      expect(res).toEqual({ data: 'default limit success' });
      expect(getSpy).toHaveBeenCalledTimes(3); // default limit (2) + initial
      vi.useRealTimers();
    });

    test('Stops retrying when provider returns an AbortError', async () => {
      const mockGetEndpoints = {
        '/api/my-endpoint': {
          get: { response: z.object({ data: z.string() }) },
        },
      } satisfies RequestDefinitions;

      const abortErr = new AbortError('stopped');
      const getSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'get').mockImplementation(async () => asyncErr(abortErr));

      const requestClient: RequestClient<typeof mockGetEndpoints> = new RequestClient({
        fetchProvider: MOCK_FETCH_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: { retry: { limit: 3, timeout: 1 }, timeout: false },
        endpoints: mockGetEndpoints,
        validation: true,
      });

      const [err, res] = await requestClient.get('/api/my-endpoint', null);

      expect(res).toBeNull();
      expect(err).toBeInstanceOf(Error);
      expect(err).toStrictEqual(
        new Error('error doing request in get', {
          cause: new RetrySuppressedError('error further retries suppressed', 1, {
            cause: new Error('error request GET in request', { cause: abortErr }),
          }),
        }),
      );
      expect(getSpy).toHaveBeenCalledTimes(1);
    });

    test('Retries when provider returns TimeoutError', async () => {
      const mockGetEndpoints = {
        '/api/my-endpoint': {
          get: { response: z.object({ data: z.string() }) },
        },
      } satisfies RequestDefinitions;

      const timeoutErr = new TimeoutError('slow');
      const successResponse = {
        json: () => ({ data: 'ok' }),
        text: () => '{ "data": "ok" }',
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
      };

      const getSpy = vi
        .spyOn(MOCK_FETCH_PROVIDER.prototype, 'get')
        .mockImplementationOnce(async () => asyncErr(timeoutErr))
        .mockImplementationOnce(async () => asyncOk(successResponse));

      const requestClient: RequestClient<typeof mockGetEndpoints> = new RequestClient({
        fetchProvider: MOCK_FETCH_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: { retry: { limit: 1, timeout: 1 }, timeout: false },
        endpoints: mockGetEndpoints,
        validation: true,
      });

      const [err, res] = await requestClient.get('/api/my-endpoint', null);

      expect(err).toBeNull();
      expect(res).toEqual({ data: 'ok' });
      expect(getSpy).toHaveBeenCalledTimes(2);
    });

    test('Retries when provider returns AbortError wrapping TimeoutError', async () => {
      const mockGetEndpoints = {
        '/api/my-endpoint': {
          get: { response: z.object({ data: z.string() }) },
        },
      } satisfies RequestDefinitions;

      const timeoutErr = new TimeoutError('slow');
      const abortErr = new AbortError('aborted', { cause: timeoutErr });
      const successResponse = {
        json: () => ({ data: 'ok' }),
        text: () => '{ "data": "ok" }',
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
      };

      const getSpy = vi
        .spyOn(MOCK_FETCH_PROVIDER.prototype, 'get')
        .mockImplementationOnce(async () => asyncErr(abortErr))
        .mockImplementationOnce(async () => asyncOk(successResponse));

      const requestClient: RequestClient<typeof mockGetEndpoints> = new RequestClient({
        fetchProvider: MOCK_FETCH_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: { retry: { limit: 1, timeout: 1 }, timeout: false },
        endpoints: mockGetEndpoints,
        validation: true,
      });

      const [err, res] = await requestClient.get('/api/my-endpoint', null);

      expect(err).toBeNull();
      expect(res).toEqual({ data: 'ok' });
      expect(getSpy).toHaveBeenCalledTimes(2);
    });

    test('Retries when provider returns TypeError', async () => {
      const mockGetEndpoints = {
        '/api/my-endpoint': {
          get: { response: z.object({ data: z.string() }) },
        },
      } satisfies RequestDefinitions;

      const typeErr = new TypeError('network');
      const successResponse = {
        json: () => ({ data: 'ok' }),
        text: () => '{ "data": "ok" }',
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
      };

      const getSpy = vi
        .spyOn(MOCK_FETCH_PROVIDER.prototype, 'get')
        .mockImplementationOnce(async () => asyncErr(typeErr))
        .mockImplementationOnce(async () => asyncOk(successResponse));

      const requestClient: RequestClient<typeof mockGetEndpoints> = new RequestClient({
        fetchProvider: MOCK_FETCH_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: { retry: { limit: 1, timeout: 1 }, timeout: false },
        endpoints: mockGetEndpoints,
        validation: true,
      });

      const [err, res] = await requestClient.get('/api/my-endpoint', null);

      expect(err).toBeNull();
      expect(res).toEqual({ data: 'ok' });
      expect(getSpy).toHaveBeenCalledTimes(2);
    });

    test('Skips retries when status is in ignoreStatusCodes', async () => {
      const mockGetEndpoints = {
        '/api/my-endpoint': {
          get: { response: z.object({ data: z.string() }) },
        },
      } satisfies RequestDefinitions;

      const httpResponse = {
        ok: false,
        status: 429,
        json: () => ({ message: 'too many requests' }),
        text: () => '{ "message": "too many requests" }',
        headers: { get: () => 'application/json' },
        clone: () => ({ ...httpResponse }),
      };

      const getSpy = vi
        .spyOn(MOCK_FETCH_PROVIDER.prototype, 'get')
        .mockImplementation(async () => asyncOk(httpResponse));

      const requestClient: RequestClient<typeof mockGetEndpoints> = new RequestClient({
        fetchProvider: MOCK_FETCH_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: { retry: { limit: 3, timeout: 1, ignoreStatusCodes: [429] }, timeout: false },
        endpoints: mockGetEndpoints,
        validation: true,
      });

      const [err, res] = await requestClient.get('/api/my-endpoint', null);

      expect(res).toBeNull();
      expect(err).toBeInstanceOf(Error);
      expect(getSpy).toHaveBeenCalledTimes(1);
    });

    test('Skips retries for non-listed status when ignoreStatusCodes is set', async () => {
      const mockGetEndpoints = {
        '/api/my-endpoint': {
          get: { response: z.object({ data: z.string() }) },
        },
      } satisfies RequestDefinitions;

      const httpResponse = {
        ok: false,
        status: 418,
        json: () => ({ message: 'teapot' }),
        text: () => '{ "message": "teapot" }',
        headers: { get: () => 'application/json' },
        clone: () => ({ ...httpResponse }),
      };

      const getSpy = vi
        .spyOn(MOCK_FETCH_PROVIDER.prototype, 'get')
        .mockImplementation(async () => asyncOk(httpResponse));

      const requestClient: RequestClient<typeof mockGetEndpoints> = new RequestClient({
        fetchProvider: MOCK_FETCH_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: { retry: { limit: 3, timeout: 1, ignoreStatusCodes: [429] }, timeout: false },
        endpoints: mockGetEndpoints,
        validation: true,
      });

      const promise = requestClient.get('/api/my-endpoint', null);
      const [err, res] = await promise;

      expect(res).toBeNull();
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).cause).toBeInstanceOf(RetrySuppressedError);
      expect(isHttpError(err)).toBe(true);
      expect(getRetrySuppressedError(err)?.attempts).toBe(1);
      expect(getSpy).toHaveBeenCalledTimes(1);
    });

    test('Retries when status is in retryCodes and ignoreStatusCodes is empty', async () => {
      const mockGetEndpoints = {
        '/api/my-endpoint': {
          get: { response: z.object({ data: z.string() }) },
        },
      } satisfies RequestDefinitions;

      const errorResponse = {
        ok: false,
        status: 500,
        json: () => ({ message: 'server error' }),
        text: () => '{ "message": "server error" }',
        headers: { get: () => 'application/json' },
        clone: () => ({ ...errorResponse }),
      };

      const successResponse = {
        ok: true,
        status: 200,
        json: () => ({ data: 'ok' }),
        text: () => '{ "data": "ok" }',
        headers: { get: () => 'application/json' },
      };

      const getSpy = vi
        .spyOn(MOCK_FETCH_PROVIDER.prototype, 'get')
        .mockImplementationOnce(async () => asyncOk(errorResponse))
        .mockImplementationOnce(async () => asyncOk(successResponse));

      const requestClient: RequestClient<typeof mockGetEndpoints> = new RequestClient({
        fetchProvider: MOCK_FETCH_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: { retry: { limit: 1, timeout: 1, statusCodes: [500] }, timeout: false },
        endpoints: mockGetEndpoints,
        validation: true,
      });

      const [err, res] = await requestClient.get('/api/my-endpoint', null);

      expect(err).toBeNull();
      expect(res).toEqual({ data: 'ok' });
      expect(getSpy).toHaveBeenCalledTimes(2);
    });

    test('Stops retrying when status is not in retryCodes', async () => {
      const mockGetEndpoints = {
        '/api/my-endpoint': {
          get: { response: z.object({ data: z.string() }) },
          sse: {
            events: {
              message: z.object({ foo: z.string() }),
              player: z.object({ bar: z.string() }),
            },
          },
        },
      } satisfies RequestDefinitions;

      const httpResponse = {
        ok: false,
        status: 418,
        json: () => ({ message: 'teapot' }),
        text: () => '{ "message": "teapot" }',
        headers: { get: () => 'application/json' },
        clone: () => ({ ...httpResponse }),
      };

      const getSpy = vi
        .spyOn(MOCK_FETCH_PROVIDER.prototype, 'get')
        .mockImplementation(async () => asyncOk(httpResponse));

      const requestClient: RequestClient<typeof mockGetEndpoints> = new RequestClient({
        fetchProvider: MOCK_FETCH_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: { retry: { limit: 3, timeout: 1, statusCodes: [500] }, timeout: false },
        endpoints: mockGetEndpoints,
        validation: true,
      });

      requestClient.sse('/api/my-endpoint', null, ([err, event]) => {
        if (err) {
          return;
        }

        if (event.type === 'message') {
          // This should type-narrow the types based on the standard-schema/spec infered type,
          // from
          event.data;
        } else if (event.type === 'player') {
          event.data;
        } else {
          event;
        }
      });
      const [err, res] = await requestClient.get('/api/my-endpoint', null);

      expect(res).toBeNull();
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).cause).toBeInstanceOf(RetrySuppressedError);
      expect(getRetrySuppressedError(err)?.attempts).toBe(1);
      expect(isHttpError(err)).toBe(true);
      expect(getSpy).toHaveBeenCalledTimes(1);
    });

    test('wraps thrown provider error before processing tuple', async () => {
      const mockGetEndpoints = {
        '/api/my-endpoint': {
          get: { response: z.object({ data: z.string() }) },
        },
      } satisfies RequestDefinitions;

      const thrown = new Error('boom');
      const getSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'get').mockImplementation(() => {
        throw thrown;
      });

      const client = new RequestClient({
        fetchProvider: MOCK_FETCH_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: { timeout: false, retry: { limit: 0 } },
        endpoints: mockGetEndpoints,
        validation: false,
      });

      const [err, res] = await client.get('/api/my-endpoint', null);

      expect(res).toBeNull();
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toContain('error doing request in get');
      expect(err).toStrictEqual(
        new Error('error doing request in get', {
          cause: new RetryExhaustedError('error retries exhausted', 1, {
            cause: new Error('error calling request GET in request', { cause: thrown }),
          }),
        }),
      );
      expect(getSpy).toHaveBeenCalledOnce();
    });
  });

  describe('config', () => {
    test('forwards fetch options to provider without retry/timeout', async () => {
      vi.useFakeTimers();
      const fetchSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'get').mockImplementation(async () =>
        asyncOk({
          json: () => {
            throw new Error('test');
          },
          text: () => '{ "ok": true }',
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const requestClient = new RequestClient({
        fetchProvider: MOCK_FETCH_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        endpoints: defaultEndpoints,
        validation: true,
        fetchOpts: {
          timeout: 60_000,
        },
      });

      requestClient.config({
        fetchOpts: {
          headers: new Headers({ 'X-Test': '1' }),
          credentials: 'include',
          mode: 'cors',
          retry: { limit: 9 },
          timeout: 1000,
        },
      });

      const request = requestClient.get('/api/noop', null);
      await vi.advanceTimersByTimeAsync(9 * 1000);
      const [err, res] = await request;

      expect(getRetryExhaustedError(err)?.attempts).toBe(10);
      expect(err).toStrictEqual(
        new Error('error doing request in get', {
          cause: new RetryExhaustedError('error retries exhausted', 10, {
            cause: new Error('error getting response in GET', {
              cause: new Error('error parsing json in getResponseData', { cause: new Error('test') }),
            }),
          }),
        }),
      );
      expect(res).toBeNull();
      expect(fetchSpy).toHaveBeenCalledTimes(10);
      vi.useRealTimers();
    });

    test('applies request-level retry settings to future calls', async () => {
      vi.useFakeTimers();
      const mockGetEndpoints = {
        '/api/my-endpoint': {
          get: { response: z.object({ data: z.string() }) },
        },
      } as const satisfies RequestDefinitions;

      const getSpy = vi
        .spyOn(MOCK_FETCH_PROVIDER.prototype, 'get')
        .mockImplementation(() => Promise.resolve([new TypeError('boom') as unknown as Error, null]));

      const client = new RequestClient({
        fetchProvider: MOCK_FETCH_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        endpoints: mockGetEndpoints,
        validation: true,
        fetchOpts: {
          timeout: 60_000,
        },
      });

      client.config({
        fetchOpts: {
          retry: {
            limit: 0,
          },
        },
      });

      const [err, res] = await client.get('/api/my-endpoint', null);

      expect(res).toBeNull();
      expect(err).toBeInstanceOf(Error);
      expect(getSpy).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });

    test('updates cache options and affects caching behavior', async () => {
      vi.useFakeTimers();
      const mockGetEndpoints = {
        '/api/my-endpoint': {
          get: { response: z.object({ data: z.string() }) },
        },
      } as const satisfies RequestDefinitions;

      const getSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'get').mockImplementation(() =>
        asyncOk({
          json: () => ({ data: 'from-fetch' }),
          text: () => '{ "data": "from-fetch" }',
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const client = new RequestClient({
        fetchProvider: MOCK_FETCH_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        endpoints: mockGetEndpoints,
        validation: true,
        cacheOpts: { ttl: 1_000, cleanupInterval: 30_000 },
      });

      // Prime cache
      await client.get('/api/my-endpoint', null, { cacheRequest: true });
      expect(getSpy).toHaveBeenCalledTimes(1);

      // Change cache TTL to a shorter value
      client.config({ cacheOpts: { ttl: 100 } });

      // Advance beyond new TTL so cache should expire
      await vi.advanceTimersByTimeAsync(150);

      await client.get('/api/my-endpoint', null, { cacheRequest: true });
      expect(getSpy).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });
  });

  describe('Signals', () => {
    test('merges provided signal into request options', async () => {
      const mockGetEndpoints = {
        '/api/my-endpoint': {
          get: { response: z.object({ data: z.string() }) },
        },
      } satisfies RequestDefinitions;

      const externalController = new AbortController();
      const timeoutSpy = vi.spyOn(signals, 'createTimeoutSignal').mockReturnValue(null);
      const mergeSpy = vi.spyOn(signals, 'mergeSignals').mockReturnValue(externalController.signal);
      const getSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'get').mockImplementation(() =>
        asyncOk({
          json: () => ({ data: 'ok' }),
          text: () => '{ "data": "ok" }',
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const client = new RequestClient({
        fetchProvider: MOCK_FETCH_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: { timeout: false, retry: { limit: 0 } },
        endpoints: mockGetEndpoints,
        validation: false,
      });

      await client.get('/api/my-endpoint', null, { signal: externalController.signal, timeout: false });

      expect(timeoutSpy).toHaveBeenCalledWith(false);
      expect(mergeSpy).toHaveBeenCalledWith([externalController.signal, null]);
      expect(getSpy).toHaveBeenCalledWith(
        'api/my-endpoint',
        expect.objectContaining({ signal: externalController.signal }),
      );

      timeoutSpy.mockRestore();
      mergeSpy.mockRestore();
      getSpy.mockRestore();
    });

    test('includes default timeout signal in request options when none provided', async () => {
      const mockGetEndpoints = {
        '/api/my-endpoint': {
          get: { response: z.object({ data: z.string() }) },
        },
      } satisfies RequestDefinitions;

      const timeoutSignal = new AbortController().signal;
      const timeoutSpy = vi.spyOn(signals, 'createTimeoutSignal').mockReturnValue(timeoutSignal);
      const mergeSpy = vi.spyOn(signals, 'mergeSignals').mockReturnValue(timeoutSignal);
      const getSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'get').mockImplementation(() =>
        asyncOk({
          json: () => ({ data: 'ok' }),
          text: () => '{ "data": "ok" }',
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const client = new RequestClient({
        fetchProvider: MOCK_FETCH_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: {},
        endpoints: mockGetEndpoints,
        validation: false,
      });

      await client.get('/api/my-endpoint', null, {});

      expect(timeoutSpy).toHaveBeenCalledWith(60_000);
      expect(mergeSpy).toHaveBeenCalledWith([undefined, timeoutSignal]);
      expect(getSpy).toHaveBeenCalledWith('api/my-endpoint', expect.objectContaining({ signal: timeoutSignal }));

      timeoutSpy.mockRestore();
      mergeSpy.mockRestore();
      getSpy.mockRestore();
    });

    test('falls back to default timeout when both opts and requestOpts timeout are null', async () => {
      const mockGetEndpoints = {
        '/api/my-endpoint': {
          get: { response: z.object({ data: z.string() }) },
        },
      } satisfies RequestDefinitions;

      const timeoutSignal = new AbortController().signal;
      const timeoutSpy = vi.spyOn(signals, 'createTimeoutSignal').mockReturnValue(timeoutSignal);
      const mergeSpy = vi.spyOn(signals, 'mergeSignals').mockReturnValue(timeoutSignal);
      const getSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'get').mockImplementation(() =>
        asyncOk({
          json: () => ({ data: 'ok' }),
          text: () => '{ "data": "ok" }',
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const client = new RequestClient({
        fetchProvider: MOCK_FETCH_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        //@ts-expect-error
        fetchOpts: { timeout: null, retry: { limit: 0 } },
        endpoints: mockGetEndpoints,
        validation: false,
      });

      //@ts-expect-error
      await client.get('/api/my-endpoint', null, { timeout: null });

      expect(timeoutSpy).toHaveBeenCalledWith(60_000);
      expect(mergeSpy).toHaveBeenCalledWith([undefined, timeoutSignal]);
      expect(getSpy).toHaveBeenCalledWith('api/my-endpoint', expect.objectContaining({ signal: timeoutSignal }));

      timeoutSpy.mockRestore();
      mergeSpy.mockRestore();
      getSpy.mockRestore();
    });
  });

  describe('Url', () => {
    const mockEndpoints = {
      '/api/my-endpoint': {
        url: {
          $search: z.object({
            a: z.string(),
          }),
          response: z.string(),
        },
      },
      '/api/my-endpoint/{integration}': {
        url: {
          $path: z.object({ integration: z.enum(['test']) }),
          response: z.string(),
        },
      },
      '/api/my-bad-endpoint/{ye}}': {
        url: {
          $search: z.object({
            a: z.string(),
          }),
          response: z.string(),
        },
      },
    } satisfies RequestDefinitions;

    let requestClient: RequestClient<typeof mockEndpoints>;
    let consoleLogSpy: MockedFunction<VoidFunction>;
    let consoleDebugSpy: MockedFunction<VoidFunction>;
    let consoleWarnSpy: MockedFunction<VoidFunction>;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      requestClient = new RequestClient({
        fetchProvider: MOCK_FETCH_PROVIDER,
        baseUrl: '/base',
        hostname: 'https://api.example.com',
        fetchOpts: DEFAULT_REQUEST_OPTS,
        endpoints: mockEndpoints,
        validation: true,
        debug: true,
      });
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
      consoleDebugSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    test('No endpoint: errors if endpoint dont exit', async () => {
      //@ts-expect-error
      const [err, res] = await requestClient.url('/api/non-existing', null);

      expect(err).toStrictEqual(new Error('error no schemas found for /api/non-existing'));
      expect(res).toBeNull();
    });

    test('Returns full url for endpoint with search params', async () => {
      const [err, res] = await requestClient.url('/api/my-endpoint', {
        $search: { a: 'b' },
      });

      expect(err).toBeNull();
      expect(res).toBe('https://api.example.com/base/api/my-endpoint?a=b');
    });

    test('Returns error and null data when constructUrl errors due to bad url', async () => {
      const [err, res] = await requestClient.url('/api/my-bad-endpoint/{ye}}', {
        $search: { a: 'b' },
        ye: 'heh',
      });

      expect(res).toBeNull();
      expect(err?.message).toMatch(/error constructing url in.*/);
    });
  });

  describe('Download', () => {
    const mockGetEndpoints = {
      '/api/my-endpoint': { download: { response: z.instanceof(Blob) } },
      '/api/my-endpoint/{my-param}': {
        download: { response: z.instanceof(Blob) },
      },
      '/api/my-bad-endpoint/{ye}}': {
        download: { response: z.instanceof(Blob) },
      },
    } satisfies RequestDefinitions;

    let requestClient: RequestClient<typeof mockGetEndpoints>;
    let consoleLogSpy: MockedFunction<VoidFunction>;
    let consoleDebugSpy: MockedFunction<VoidFunction>;
    let consoleWarnSpy: MockedFunction<VoidFunction>;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      requestClient = new RequestClient({
        fetchProvider: MOCK_FETCH_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: DEFAULT_REQUEST_OPTS,
        endpoints: mockGetEndpoints,
        validation: true,
        debug: true,
      });
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
      consoleDebugSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    test('No endpoint: errors if endpoint dont exit', async () => {
      const getSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'get').mockImplementation(() => null);

      const [err, res] = await requestClient.download(
        //@ts-expect-error
        '/api/non-existing',
        null,
      );

      expect(err).toStrictEqual(new Error('error no schemas found for /api/non-existing'));
      expect(getSpy).toHaveBeenCalledTimes(0);
      expect(res).toBeNull();
    });

    test('Returns error and null data when request returns error tuple', async () => {
      const underlyingError = {
        cause: 'something bad with delete',
        status: 400,
      };

      const getSpy = vi
        .spyOn(MOCK_FETCH_PROVIDER.prototype, 'get')
        .mockImplementation(async () => asyncErr(underlyingError));

      const [err, res] = await requestClient.download('/api/my-endpoint', null);

      expect(res).toBeNull();
      expect(getSpy).toHaveBeenCalledOnce();
      expect(getSpy).toHaveBeenCalledWith('api/my-endpoint', {});
      expect(err).toBeInstanceOf(Error);
      expect(err).toStrictEqual(
        new Error('error doing request in download', {
          cause: new RetryExhaustedError('error retries exhausted', 1, {
            cause: new Error('error request GET in request', { cause: underlyingError }),
          }),
        }),
      );
    });

    test("No params: returns blob data from provider's get when request was successful", async () => {
      const getSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'get').mockImplementation(() => {
        const response = {
          blob: () => {
            throw new Error('error in blob');
          },
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        };

        return [null, response];
      });

      const [err, res] = await requestClient.download('/api/my-endpoint', null);

      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe('error doing request in download');
      expect(getSpy).toHaveBeenCalledOnce();
      expect(getSpy).toHaveBeenCalledWith('api/my-endpoint', {});
      expect(res).toBeNull();
    });

    test("No params: returns blob data from provider's get when request was successful", async () => {
      const dummyBlob = new Blob(['hello'], { type: 'application/pdf' });

      const getSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'get').mockImplementation(() => {
        const response = {
          blob: (() => Promise.resolve(dummyBlob)) as () => Promise<Blob>,
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        };

        return [null, response];
      });

      const [err, res] = await requestClient.download('/api/my-endpoint', null);

      expect(err).toBeNull();
      expect(getSpy).toHaveBeenCalledOnce();
      expect(getSpy).toHaveBeenCalledWith('api/my-endpoint', {});
      expect(res?.type).toBe('application/pdf');

      const blobText = await res?.text();
      expect(blobText).toBe('hello');
    });

    test("With params: returns blob data from provider's get when request was successful", async () => {
      const dummyBlob = new Blob(['hello'], { type: 'application/pdf' });

      const getSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'get').mockImplementation(() => {
        const response = {
          blob: (() => Promise.resolve(dummyBlob)) as () => Promise<Blob>,
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        };

        return [null, response];
      });

      const [err, res] = await requestClient.download('/api/my-endpoint/{my-param}', {
        'my-param': 'download-this',
      });

      expect(err).toBeNull();
      expect(getSpy).toHaveBeenCalledOnce();
      expect(getSpy).toHaveBeenCalledWith('api/my-endpoint/download-this', {});
      expect(res?.type).toBe('application/pdf');

      const blobText = await res?.text();
      expect(blobText).toBe('hello');
    });

    test('Returns error and null data when constructUrl errors due to bad url', async () => {
      const dummyBlob = new Blob(['hello'], { type: 'application/pdf' });

      const getSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'get').mockImplementation(() => {
        const response = {
          blob: (() => Promise.resolve(dummyBlob)) as () => Promise<Blob>,
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        };

        return [null, response];
      });

      const [err, res] = await requestClient.download('/api/my-bad-endpoint/{ye}}', { ye: 'heh' });

      expect(res).toBeNull();
      expect(getSpy).not.toHaveBeenCalled();
      expect(err).toBeInstanceOf(Error);
      expect(err?.message.toLowerCase()).toContain('error constructing url');
    });
  });

  describe('GET', () => {
    const mockGetEndpoints = {
      '/api/my-endpoint': { get: { response: z.object({ data: z.string() }) } },
      'api/my-param-endpoint/{param}': {
        get: {
          $search: z.object({ test: z.number(), optional: z.string().optional() }).optional(),
          $path: z.object({ param: z.enum(['foo', 'bar']) }),
          response: z.object({ data: z.string() }),
        },
      },
      '/api/my-empty-endpoint': {
        get: {
          $search: z.object().optional(),
          $path: z.object().optional(),
          response: z.null(),
        },
      },
      '/api/my-string-endpoint': { get: { response: z.string() } },
      '/api/my-endpoint/{my-param}': {
        get: { response: z.object({ data: z.string() }) },
      },
      '/api/my-bad-endpoint/{ye}}': {
        get: { response: z.object({ data: z.string() }) },
      },
    } satisfies RequestDefinitions;

    describe('Without caching', () => {
      let requestClient: RequestClient<typeof mockGetEndpoints>;
      let consoleLogSpy: MockedFunction<VoidFunction>;
      let consoleDebugSpy: MockedFunction<VoidFunction>;

      beforeEach(() => {
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

        requestClient = new RequestClient({
          fetchProvider: MOCK_FETCH_PROVIDER,
          baseUrl: 'https://api.example.com/base',
          hostname: 'https://api.example.com',
          fetchOpts: DEFAULT_REQUEST_OPTS,
          endpoints: mockGetEndpoints,
          validation: true,
          debug: true,
        });
      });

      afterEach(() => {
        consoleLogSpy.mockRestore();
        consoleDebugSpy.mockRestore();
      });

      test('No endpoint: errors if endpoint dont exit', async () => {
        const getSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'get').mockImplementation(() => null);

        //@ts-expect-error
        const [err, res] = await requestClient.get('/api/non-existing', null);

        expect(err).toStrictEqual(new Error('error no schemas found for /api/non-existing'));
        expect(getSpy).toHaveBeenCalledTimes(0);
        expect(res).toBeNull();
      });

      test('No params: returns json parsed data when request was successful', async () => {
        const getSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'get').mockImplementation(async () =>
          asyncOk({
            json: () => ({ data: 'GET request data no params' }),
            text: () => '{ "data": "GET request data no params" }',
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
          }),
        );

        const [err, res] = await requestClient.get('/api/my-endpoint', null);

        expect(err).toBeNull();
        expect(getSpy).toHaveBeenCalledOnce();
        expect(getSpy).toHaveBeenCalledWith('api/my-endpoint', {});
        expect(res).toStrictEqual({ data: 'GET request data no params' });
      });

      test('No params: returns json parsed data when request was successful non-validated', async () => {
        const getSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'get').mockImplementation(async () =>
          asyncOk({
            json: () => ({ data: 'GET request data no params' }),
            text: () => '{ "data": "GET request data no params" }',
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
          }),
        );

        const [err, res] = await requestClient.get('/api/my-endpoint', null, {
          validate: false,
          headers: {
            'x-test': 'foo',
          },
        });

        expect(err).toBeNull();
        expect(getSpy).toHaveBeenCalledOnce();
        expect(getSpy).toHaveBeenCalledWith('api/my-endpoint', {
          headers: {
            'x-test': 'foo',
          },
        });
        expect(res).toStrictEqual({ data: 'GET request data no params' });
      });

      test('No params: returns json parsed data when request was successful non-validated on client', async () => {
        requestClient = new RequestClient({
          fetchProvider: MOCK_FETCH_PROVIDER,
          baseUrl: 'https://api.example.com/base',
          hostname: 'https://api.example.com',
          fetchOpts: DEFAULT_REQUEST_OPTS,
          endpoints: mockGetEndpoints,
          validation: false,
          debug: false,
        });
        const getSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'get').mockImplementation(async () =>
          asyncOk({
            json: () => ({ data: 'GET request data no params' }),
            text: () => '{ "data": "GET request data no params" }',
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
          }),
        );

        const [err, res] = await requestClient.get('/api/my-endpoint', null);

        expect(err).toBeNull();
        expect(getSpy).toHaveBeenCalledOnce();
        expect(getSpy).toHaveBeenCalledWith('api/my-endpoint', {});
        expect(res).toStrictEqual({ data: 'GET request data no params' });
      });

      test('No params: response wrong schema parsing', async () => {
        const getSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'get').mockImplementation(async () =>
          asyncOk({
            json: () => null,
            text: () => '{ "data": "GET request data no params" }',
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
          }),
        );

        const [err, res] = await requestClient.get('/api/my-endpoint', null);
        expect(isErrorType(ValidationError, err)).toEqual(true);
        expect(getSpy).toHaveBeenCalledOnce();
        expect(getSpy).toHaveBeenCalledWith('api/my-endpoint', {});
        expect(res).toStrictEqual(null);
      });

      test('No params: returns null on 204', async () => {
        const getSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'get').mockImplementation(async () =>
          asyncOk({
            json: () => null,
            text: () => 'null',
            ok: true,
            status: 204,
            headers: { get: () => 'application/json' },
          }),
        );

        const [err, res] = await requestClient.get('/api/my-empty-endpoint', {
          $path: {},
          $search: {},
        });

        expect(err).toBeNull();
        expect(getSpy).toHaveBeenCalledOnce();
        expect(getSpy).toHaveBeenCalledWith('api/my-empty-endpoint', {});
        expect(res).toStrictEqual(null);
      });

      test('No params: returns null on 200 empty string', async () => {
        const getSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'get').mockImplementation(async () =>
          asyncOk({
            json: () => '',
            text: () => '',
            ok: true,
            status: 200,
            headers: { get: () => 'text/plain' },
          }),
        );

        const [err, res] = await requestClient.get('/api/my-empty-endpoint', {
          $path: undefined,
          $search: undefined,
        });

        expect(err).toBeNull();
        expect(getSpy).toHaveBeenCalledOnce();
        expect(getSpy).toHaveBeenCalledWith('api/my-empty-endpoint', {});
        expect(res).toStrictEqual(null);
      });

      test('No params: returns string on 200', async () => {
        const getSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'get').mockImplementation(async () =>
          asyncOk({
            json: () => 'test',
            text: () => 'test',
            ok: true,
            status: 200,
            headers: { get: () => 'text/plain' },
          }),
        );

        const [err, res] = await requestClient.get('/api/my-string-endpoint', null);
        expect(err).toBeNull();
        expect(getSpy).toHaveBeenCalledOnce();
        expect(getSpy).toHaveBeenCalledWith('api/my-string-endpoint', {});
        expect(res).toStrictEqual('test');
      });

      test('No params: returns string on 200', async () => {
        const getSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'get').mockImplementation(async () =>
          asyncOk({
            json: () => {
              throw new Error('json-error');
            },
            text: () => {
              throw new Error('text-error');
            },
            ok: true,
            status: 200,
            headers: { get: () => 'text/plain' },
          }),
        );

        const [err, res] = await requestClient.get('/api/my-string-endpoint', null);
        expect(err).toBeInstanceOf(Error);
        expect(err?.message).toBe('error doing request in get');
        expect(getSpy).toHaveBeenCalledOnce();
        expect(getSpy).toHaveBeenCalledWith('api/my-string-endpoint', {});
        expect(res).toBeNull();
      });

      test('With params: should return json parsed data when request was successful', async () => {
        const getSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'get').mockImplementation(async () =>
          asyncOk({
            json: () => ({ data: 'GET request data with params' }),
            text: () => '{ "data": "GET request data with params" }',
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
          }),
        );

        const [err, res] = await requestClient.get('/api/my-endpoint/{my-param}', {
          'my-param': 23,
        });

        expect(err).toBeNull();
        expect(getSpy).toHaveBeenCalledOnce();
        expect(getSpy).toHaveBeenCalledWith('api/my-endpoint/23', {});
        expect(res).toStrictEqual({ data: 'GET request data with params' });
      });

      test('Returns error and null data when request returns error tuple', async () => {
        const underlyingError = {
          cause: 'something bad',
          status: 400,
        };

        const getSpy = vi
          .spyOn(MOCK_FETCH_PROVIDER.prototype, 'get')
          .mockImplementation(async () => asyncErr(underlyingError));

        const [err, res] = await requestClient.get('/api/my-endpoint', null);

        expect(res).toBeNull();
        expect(getSpy).toHaveBeenCalledOnce();
        expect(getSpy).toHaveBeenCalledWith('api/my-endpoint', {});
        expect(err).toBeInstanceOf(Error);
        expect(err?.message).toBe('error doing request in get');
        expect((err as Error).cause).toStrictEqual(
          new RetryExhaustedError('error retries exhausted', 1, {
            cause: new Error('error request GET in request', { cause: underlyingError }),
          }),
        );
      });

      test('All params: Returns json parsed data when request was successful', async () => {
        const getSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'get').mockImplementation(async () =>
          asyncOk({
            json: () => ({ data: 'GET request data no params' }),
            text: () => '{ "data": "GET request data no params" }',
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
          }),
        );

        const [err, res] = await requestClient.get('api/my-param-endpoint/{param}', {
          $path: { param: 'foo' },
          $search: { test: 1, optional: undefined },
        });

        expect(err).toBeNull();
        expect(getSpy).toHaveBeenCalledOnce();
        expect(getSpy).toHaveBeenCalledWith('api/my-param-endpoint/foo?test=1', {});
        expect(res).toStrictEqual({ data: 'GET request data no params' });
      });

      test('All params: Errors on bad search param', async () => {
        const getSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'get').mockImplementation(async () =>
          asyncOk({
            json: () => ({ data: 'GET request data no params' }),
            text: () => '{ "data": "GET request data no params" }',
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
          }),
        );

        const [err, res] = await requestClient.get('api/my-param-endpoint/{param}', {
          $path: { param: 'foo' },
          // @ts-expect-error
          $search: { test: 'not-a-number' },
        });

        expect(err).toStrictEqual(new Error('error constructing URL in GET'));
        expect(getSpy).toHaveBeenCalledTimes(0);
        expect(res).toBeNull();
      });

      test('Returns error and null data when constructUrl errors due to bad url', async () => {
        const getSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'get');

        // note extra trailing } here in the endpoint
        const [err, res] = await requestClient.get('/api/my-bad-endpoint/{ye}}', {
          ye: 'something',
        });

        expect(res).toBeNull();
        expect(getSpy).not.toHaveBeenCalled();
        expect(err).toBeInstanceOf(Error);
        expect(err?.message.toLowerCase()).toContain('error constructing url');
      });
    });

    describe('With cacheRequest: true', () => {
      test('Calls get() to fetch fresh data if key was not in cache and returns data', async () => {
        const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const requestClientWithCache = new RequestClient({
          fetchProvider: MOCK_FETCH_PROVIDER,
          baseUrl: 'https://api.example.com/base',
          hostname: 'https://api.example.com',
          fetchOpts: DEFAULT_REQUEST_OPTS,
          endpoints: mockGetEndpoints,
          validation: true,
          debug: true,
        });

        const getSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'get').mockImplementation(async () =>
          asyncOk({
            json: () => ({ data: 'GET request data with cacheRequest' }),
            text: () => '{ "data": "GET request data with cacheRequest" }',
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
          }),
        );

        const [err, res] = await requestClientWithCache.get('/api/my-endpoint', null, {
          cacheRequest: true,
        });

        expect(err).toBeNull();
        expect(getSpy).toHaveBeenCalledOnce();
        expect(getSpy).toHaveBeenCalledWith('api/my-endpoint', {});
        expect(res).toStrictEqual({
          data: 'GET request data with cacheRequest',
        });
        consoleLogSpy.mockRestore();
        consoleDebugSpy.mockRestore();
        consoleWarnSpy.mockRestore();
      });

      test('Does not call get() if key was in cache, and returns cached value', async () => {
        const requestClientWithCache = new RequestClient({
          fetchProvider: MOCK_FETCH_PROVIDER,
          baseUrl: 'https://api.example.com/base',
          hostname: 'https://api.example.com',
          fetchOpts: DEFAULT_REQUEST_OPTS,
          endpoints: mockGetEndpoints,
          validation: true,
        });

        // Step 1: call get() on endpoint so it gets added to the cache
        const getSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'get').mockImplementation(async () =>
          asyncOk({
            json: () => ({ data: 'GET request data with cacheRequest' }),
            text: () => '{ "data": "GET request data with cacheRequest" }',
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
          }),
        );
        const [err, res] = await requestClientWithCache.get('/api/my-endpoint', null, {
          cacheRequest: true,
        });
        expect(getSpy).toHaveBeenCalledOnce();
        expect(getSpy).toHaveBeenCalledWith('api/my-endpoint', {});
        expect(err).toBeNull();
        expect(res).toStrictEqual({
          data: 'GET request data with cacheRequest',
        });

        // Set the times called back to 0 before step 2
        getSpy.mockClear();

        // Step 2: call get() again to ensure it gets the value from the cache
        const [errCached, resCached] = await requestClientWithCache.get('/api/my-endpoint', null, {
          cacheRequest: true,
        });
        expect(getSpy).not.toHaveBeenCalled();
        expect(errCached).toBeNull();
        expect(resCached).toStrictEqual({
          data: 'GET request data with cacheRequest',
        });
      });

      test('Returns error and null data when request returns error tuple in cacheRequest: true', async () => {
        const requestClientWithCache = new RequestClient({
          fetchProvider: MOCK_FETCH_PROVIDER,
          baseUrl: 'https://api.example.com/base',
          hostname: 'https://api.example.com',
          fetchOpts: DEFAULT_REQUEST_OPTS,
          endpoints: mockGetEndpoints,
          validation: true,
        });

        const underlyingError = {
          cause: 'something bad',
          status: 400,
        };

        const getSpy = vi
          .spyOn(MOCK_FETCH_PROVIDER.prototype, 'get')
          .mockImplementation(async () => asyncErr(underlyingError));

        const [err, res] = await requestClientWithCache.get('/api/my-endpoint', null, {
          cacheRequest: true,
        });

        expect(res).toBeNull();
        expect(getSpy).toHaveBeenCalledOnce();
        expect(getSpy).toHaveBeenCalledWith('api/my-endpoint', {});
        expect(err).toBeInstanceOf(Error);
        expect(err).toStrictEqual(
          new Error('error getting cached response in get', {
            cause: new Error('error getting cached request', {
              cause: new Error('error getting request uncached after cache attempt', {
                cause: new Error('error doing request in get', {
                  cause: new RetryExhaustedError('error retries exhausted', 1, {
                    cause: new Error('error request GET in request', { cause: underlyingError }),
                  }),
                }),
              }),
            }),
          }),
        );
      });
    });
  });

  describe('POST', () => {
    const mockPostEndpoints = {
      '/api/my-endpoint': {
        post: {
          request: z.object({ name: z.string() }),
          response: z.object({ data: z.string() }),
        },
      },
      '/api/my-endpoint/{my-param}': {
        post: {
          request: z.object({ name: z.string() }),
          response: z.object({ data: z.string() }),
        },
      },
      '/api/my-bad-endpoint/{ye}}': {
        post: {
          request: z.object({ name: z.string() }),
          response: z.object({ data: z.string() }),
        },
      },
    } satisfies RequestDefinitions;

    let requestClient: RequestClient<typeof mockPostEndpoints>;

    let consoleLogSpy: MockedFunction<VoidFunction>;
    let consoleDebugSpy: MockedFunction<VoidFunction>;
    let consoleWarnSpy: MockedFunction<VoidFunction>;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      requestClient = new RequestClient({
        fetchProvider: MOCK_FETCH_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: DEFAULT_REQUEST_OPTS,
        endpoints: mockPostEndpoints,
        validation: true,
        debug: true,
      });
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
      consoleDebugSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    test('No endpoint: errors if endpoint dont exit', async () => {
      const postSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'post').mockImplementation(() => null);

      //@ts-expect-error
      const [err, res] = await requestClient.post('/api/non-existing', null);

      expect(err).toStrictEqual(new Error('error no schemas found for /api/non-existing'));
      expect(postSpy).toHaveBeenCalledTimes(0);
      expect(res).toBeNull();
    });

    test('No params: parse error on request wrong schema', async () => {
      const postSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'post').mockImplementation(async () =>
        asyncOk({
          json: () => null,
          text: () => '{ "data": "POST returned from mock provider no params" }',
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const [err, res] = await requestClient.post('/api/my-endpoint', null, {
        // @ts-expect-error
        age: 22,
      });

      expect(isErrorType(ValidationError, err)).toBe(true);
      expect(postSpy).toHaveBeenCalledTimes(0);
      expect(res).toBeNull();
    });

    test('No params: parse error on response wrong schema', async () => {
      const postSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'post').mockImplementation(async () =>
        asyncOk({
          json: () => null,
          text: () => '',
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const [err, res] = await requestClient.post('/api/my-endpoint', null, {
        name: 'Brother',
      });

      expect(isErrorType(ValidationError, err)).toBe(true);
      expect(postSpy).toHaveBeenCalledOnce();
      expect(postSpy).toHaveBeenCalledWith(
        'api/my-endpoint',
        expect.objectContaining({
          headers: new Headers(DEFAULT_HEADERS_SEND),
          body: JSON.stringify({ name: 'Brother' }),
        }),
      );
      expect(res).toBeNull();
    });

    test('No params: parse error on response throw', async () => {
      const postSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'post').mockImplementation(async () =>
        asyncOk({
          json: () => {
            throw new Error('json-error');
          },
          text: () => {
            throw new Error('json-error');
          },
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const [err, res] = await requestClient.post('/api/my-endpoint', null, {
        name: 'Brother',
      });

      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe('error doing request in post');
      expect(postSpy).toHaveBeenCalledOnce();
      expect(postSpy).toHaveBeenCalledWith(
        'api/my-endpoint',
        expect.objectContaining({
          headers: new Headers(DEFAULT_HEADERS_SEND),
          body: JSON.stringify({ name: 'Brother' }),
        }),
      );
      expect(res).toBeNull();
    });

    test("No params: returns response from provider's post method when successful", async () => {
      const postSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'post').mockImplementation(async () =>
        asyncOk({
          json: () => ({
            data: 'POST returned from mock provider no params',
          }),
          text: () => '{ "data": "POST returned from mock provider no params" }',
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const [err, res] = await requestClient.post('/api/my-endpoint', null, {
        name: 'Brother',
      });

      expect(err).toBeNull();
      expect(postSpy).toHaveBeenCalledOnce();
      expect(postSpy).toHaveBeenCalledWith(
        'api/my-endpoint',
        expect.objectContaining({
          headers: new Headers(DEFAULT_HEADERS_SEND),
          body: JSON.stringify({ name: 'Brother' }),
        }),
      );
      expect(res).toStrictEqual({
        data: 'POST returned from mock provider no params',
      });
    });

    test("No params: returns response from provider's post method when successful non-validated", async () => {
      const postSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'post').mockImplementation(async () =>
        asyncOk({
          json: () => ({
            data: 'POST returned from mock provider no params',
          }),
          text: () => '{ "data": "POST returned from mock provider no params" }',
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const [err, res] = await requestClient.post('/api/my-endpoint', null, { name: 'Brother' }, { validate: false });

      expect(err).toBeNull();
      expect(postSpy).toHaveBeenCalledOnce();
      expect(postSpy).toHaveBeenCalledWith(
        'api/my-endpoint',
        expect.objectContaining({
          headers: new Headers(DEFAULT_HEADERS_SEND),
          body: JSON.stringify({ name: 'Brother' }),
        }),
      );
      expect(res).toStrictEqual({
        data: 'POST returned from mock provider no params',
      });
    });

    test("No params: returns response from provider's post method when successful non-validated on client", async () => {
      requestClient = new RequestClient({
        fetchProvider: MOCK_FETCH_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: DEFAULT_REQUEST_OPTS,
        endpoints: mockPostEndpoints,
        validation: false,
        debug: false,
      });

      const postSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'post').mockImplementation(async () =>
        asyncOk({
          json: () => ({
            data: 'POST returned from mock provider no params',
          }),
          text: () => '{ "data": "POST returned from mock provider no params" }',
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const [err, res] = await requestClient.post('/api/my-endpoint', null, {
        name: 'Brother',
      });

      expect(err).toBeNull();
      expect(postSpy).toHaveBeenCalledOnce();
      expect(postSpy).toHaveBeenCalledWith(
        'api/my-endpoint',
        expect.objectContaining({
          headers: new Headers(DEFAULT_HEADERS_SEND),
          body: JSON.stringify({ name: 'Brother' }),
        }),
      );
      expect(res).toStrictEqual({
        data: 'POST returned from mock provider no params',
      });
    });

    test("With params: returns response from provider's post method when successful", async () => {
      const postSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'post').mockImplementation(async () =>
        asyncOk({
          json: () => ({
            data: 'POST returned from mock provider with params',
          }),
          text: () => '{ "data": "POST returned from mock provider with params" }',
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const [err, res] = await requestClient.post(
        '/api/my-endpoint/{my-param}',
        { 'my-param': 'hey' },
        { name: 'Brother' },
      );

      expect(err).toBeNull();
      expect(postSpy).toHaveBeenCalledOnce();
      expect(postSpy).toHaveBeenCalledWith(
        'api/my-endpoint/hey',
        expect.objectContaining({
          headers: new Headers(DEFAULT_HEADERS_SEND),
          body: JSON.stringify({ name: 'Brother' }),
        }),
      );
      expect(res).toStrictEqual({
        data: 'POST returned from mock provider with params',
      });
    });

    test('Returns error and null data when request returns error tuple', async () => {
      const underlyingError = {
        cause: 'something bad with post',
        status: 400,
      };

      const postSpy = vi
        .spyOn(MOCK_FETCH_PROVIDER.prototype, 'post')
        .mockImplementation(async () => asyncErr(underlyingError));

      const [err, res] = await requestClient.post('/api/my-endpoint', null, {
        name: 'Brother',
      });

      expect(res).toBeNull();
      expect(postSpy).toHaveBeenCalledOnce();
      expect(postSpy).toHaveBeenCalledWith(
        'api/my-endpoint',
        expect.objectContaining({
          headers: new Headers(DEFAULT_HEADERS_SEND),
          body: JSON.stringify({ name: 'Brother' }),
        }),
      );
      expect(err).toBeInstanceOf(Error);
      expect(err).toStrictEqual(
        new Error('error doing request in post', {
          cause: new RetryExhaustedError('error retries exhausted', 1, {
            cause: new Error('error request POST in request', { cause: underlyingError }),
          }),
        }),
      );
    });

    test('Returns error and null data when constructUrl errors due to bad url', async () => {
      const postSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'post');

      const [err, res] = await requestClient.post(
        '/api/my-bad-endpoint/{ye}}',
        { ye: 'something' },
        { name: 'Brother' },
      );

      expect(res).toBeNull();
      expect(postSpy).not.toHaveBeenCalled();
      expect(err).toBeInstanceOf(Error);
      expect(err?.message.toLowerCase()).toContain('error constructing url');
    });
  });

  describe('PUT', () => {
    const mockPutEndpoints = {
      '/api/my-endpoint': {
        put: {
          request: z.object({ name: z.string() }),
          response: z.object({ data: z.string() }),
        },
      },
      '/api/my-endpoint/{my-param}': {
        put: {
          request: z.object({ name: z.string() }),
          response: z.object({ data: z.string() }),
        },
      },
      '/api/my-bad-endpoint/{ye}}': {
        put: {
          request: z.object({ name: z.string() }),
          response: z.object({ data: z.string() }),
        },
      },
    } satisfies RequestDefinitions;

    let requestClient: RequestClient<typeof mockPutEndpoints>;

    let consoleLogSpy: MockedFunction<VoidFunction>;
    let consoleDebugSpy: MockedFunction<VoidFunction>;
    let consoleWarnSpy: MockedFunction<VoidFunction>;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      requestClient = new RequestClient({
        fetchProvider: MOCK_FETCH_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: DEFAULT_REQUEST_OPTS,
        endpoints: mockPutEndpoints,
        validation: true,
        debug: true,
      });
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
      consoleDebugSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    test('No endpoint: errors if endpoint dont exit', async () => {
      const putSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'put').mockImplementation(() => null);

      //@ts-expect-error
      const [err, res] = await requestClient.put('/api/non-existing', null);

      expect(err).toStrictEqual(new Error('error no schemas found for /api/non-existing'));
      expect(putSpy).toHaveBeenCalledTimes(0);
      expect(res).toBeNull();
    });

    test('No endpoint: errors if endpoint dont exit', async () => {
      const putSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'put').mockImplementation(() => null);

      //@ts-expect-error
      const [err, res] = await requestClient.put('/api/non-existing', null);

      expect(err).toStrictEqual(new Error('error no schemas found for /api/non-existing'));
      expect(putSpy).toHaveBeenCalledTimes(0);
      expect(res).toBeNull();
    });

    test('No params: parse error on request wrong schema', async () => {
      const putSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'put').mockImplementation(async () =>
        asyncOk({
          json: () => null,
          text: () => 'null',
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const [err, res] = await requestClient.put('/api/my-endpoint', null, {
        // @ts-expect-error
        age: 22,
      });

      expect(isErrorType(ValidationError, err)).toBe(true);
      expect(putSpy).toHaveBeenCalledTimes(0);
      expect(res).toBeNull();
    });

    test('No params: parse error on response wrong schema', async () => {
      const putSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'put').mockImplementation(async () =>
        asyncOk({
          json: () => null,
          text: () => 'null',
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const [err, res] = await requestClient.put('/api/my-endpoint', null, {
        name: 'Brother',
      });

      expect(isErrorType(ValidationError, err)).toBe(true);
      expect(putSpy).toHaveBeenCalledOnce();
      expect(putSpy).toHaveBeenCalledWith(
        'api/my-endpoint',
        expect.objectContaining({
          headers: new Headers(DEFAULT_HEADERS_SEND),
          body: JSON.stringify({ name: 'Brother' }),
        }),
      );
      expect(res).toBeNull();
    });

    test('No params: parse error on response throw', async () => {
      const putSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'put').mockImplementation(async () =>
        asyncOk({
          json: () => {
            throw new Error('json-error');
          },
          text: () => {
            throw new Error('json-error');
          },
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const [err, res] = await requestClient.put('/api/my-endpoint', null, {
        name: 'Brother',
      });

      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe('error doing request in put');
      expect(putSpy).toHaveBeenCalledOnce();
      expect(putSpy).toHaveBeenCalledWith(
        'api/my-endpoint',
        expect.objectContaining({
          headers: new Headers(DEFAULT_HEADERS_SEND),
          body: JSON.stringify({ name: 'Brother' }),
        }),
      );
      expect(res).toBeNull();
    });

    test("No params: returns response from provider's put method when successful", async () => {
      const putSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'put').mockImplementation(async () =>
        asyncOk({
          json: () => ({ data: 'PUT returned from mock provider no params' }),
          text: () => '{ "data": "PUT returned from mock provider no params" }',
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const [err, res] = await requestClient.put('/api/my-endpoint', null, {
        name: 'Pooh',
      });

      expect(err).toBeNull();
      expect(putSpy).toHaveBeenCalledOnce();
      expect(putSpy).toHaveBeenCalledWith(
        'api/my-endpoint',
        expect.objectContaining({ headers: new Headers(DEFAULT_HEADERS_SEND), body: JSON.stringify({ name: 'Pooh' }) }),
      );
      expect(res).toStrictEqual({
        data: 'PUT returned from mock provider no params',
      });
    });

    test("No params: returns response from provider's put method when successful non-validated", async () => {
      const putSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'put').mockImplementation(async () =>
        asyncOk({
          json: () => ({
            data: 'POST returned from mock provider no params',
          }),
          text: () => '{ "data": "POST returned from mock provider no params" }',
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const [err, res] = await requestClient.put('/api/my-endpoint', null, { name: 'Brother' }, { validate: false });

      expect(err).toBeNull();
      expect(putSpy).toHaveBeenCalledOnce();
      expect(putSpy).toHaveBeenCalledWith(
        'api/my-endpoint',
        expect.objectContaining({
          headers: new Headers(DEFAULT_HEADERS_SEND),
          body: JSON.stringify({ name: 'Brother' }),
        }),
      );
      expect(res).toStrictEqual({
        data: 'POST returned from mock provider no params',
      });
    });

    test("No params: returns response from provider's put method when successful non-validated on client", async () => {
      requestClient = new RequestClient({
        fetchProvider: MOCK_FETCH_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: DEFAULT_REQUEST_OPTS,
        endpoints: mockPutEndpoints,
        validation: false,
        debug: false,
      });

      const putSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'put').mockImplementation(async () =>
        asyncOk({
          json: () => ({
            data: 'POST returned from mock provider no params',
          }),
          text: () => '{ "data": "POST returned from mock provider no params" }',
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const [err, res] = await requestClient.put('/api/my-endpoint', null, {
        name: 'Brother',
      });

      expect(err).toBeNull();
      expect(putSpy).toHaveBeenCalledOnce();
      expect(putSpy).toHaveBeenCalledWith(
        'api/my-endpoint',
        expect.objectContaining({
          headers: new Headers(DEFAULT_HEADERS_SEND),
          body: JSON.stringify({ name: 'Brother' }),
        }),
      );
      expect(res).toStrictEqual({
        data: 'POST returned from mock provider no params',
      });
    });

    test("With params: returns response from provider's put method when successful", async () => {
      const putSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'put').mockImplementation(async () =>
        asyncOk({
          json: () => ({
            data: 'PUT returned from mock provider with params',
          }),
          text: () => '{ "data": "PUT returned from mock provider with params" }',
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const [err, res] = await requestClient.put(
        '/api/my-endpoint/{my-param}',
        { 'my-param': 'hey' },
        { name: 'Pooh' },
      );

      expect(err).toBeNull();
      expect(putSpy).toHaveBeenCalledOnce();
      expect(putSpy).toHaveBeenCalledWith(
        'api/my-endpoint/hey',
        expect.objectContaining({ headers: new Headers(DEFAULT_HEADERS_SEND), body: JSON.stringify({ name: 'Pooh' }) }),
      );
      expect(res).toStrictEqual({
        data: 'PUT returned from mock provider with params',
      });
    });

    test('Returns error and null data when request returns error tuple', async () => {
      const underlyingError = {
        cause: 'something bad with put',
        status: 400,
      };

      const putSpy = vi
        .spyOn(MOCK_FETCH_PROVIDER.prototype, 'put')
        .mockImplementation(async () => asyncErr(underlyingError));

      const [err, res] = await requestClient.put('/api/my-endpoint', null, {
        name: 'Pooh',
      });

      expect(res).toBeNull();
      expect(putSpy).toHaveBeenCalledOnce();
      expect(putSpy).toHaveBeenCalledWith(
        'api/my-endpoint',
        expect.objectContaining({ headers: new Headers(DEFAULT_HEADERS_SEND), body: JSON.stringify({ name: 'Pooh' }) }),
      );
      expect(err).toBeInstanceOf(Error);
      expect(err).toStrictEqual(
        new Error('error doing request in put', {
          cause: new RetryExhaustedError('error retries exhausted', 1, {
            cause: new Error('error request PUT in request', { cause: underlyingError }),
          }),
        }),
      );
    });

    test('Returns error and null data when constructUrl errors due to bad url', async () => {
      const putSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'put');

      const [err, res] = await requestClient.put('/api/my-bad-endpoint/{ye}}', { ye: 'something' }, { name: 'Pooh' });

      expect(res).toBeNull();
      expect(putSpy).not.toHaveBeenCalled();
      expect(err).toBeInstanceOf(Error);
      expect(err?.message.toLowerCase()).toContain('error constructing url');
    });
  });

  describe('PATCH', () => {
    const mockPatchEndpoints = {
      '/api/my-endpoint': {
        patch: {
          request: z.object({ name: z.string() }),
          response: z.object({ data: z.string() }),
        },
      },
      '/api/my-endpoint/{my-param}': {
        patch: {
          request: z.object({ name: z.string() }),
          response: z.object({ data: z.string() }),
        },
      },
      '/api/my-bad-endpoint/{ye}}': {
        patch: {
          request: z.object({ name: z.string() }),
          response: z.object({ data: z.string() }),
        },
      },
    } satisfies RequestDefinitions;

    let requestClient: RequestClient<typeof mockPatchEndpoints>;
    let consoleLogSpy: MockedFunction<VoidFunction>;
    let consoleDebugSpy: MockedFunction<VoidFunction>;
    let consoleWarnSpy: MockedFunction<VoidFunction>;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      requestClient = new RequestClient({
        fetchProvider: MOCK_FETCH_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: DEFAULT_REQUEST_OPTS,
        endpoints: mockPatchEndpoints,
        validation: true,
        debug: true,
      });
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
      consoleDebugSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    test('No endpoint: errors if endpoint dont exit', async () => {
      const patchSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'patch').mockImplementation(() => null);

      //@ts-expect-error
      const [err, res] = await requestClient.patch('/api/non-existing', null);

      expect(err).toStrictEqual(new Error('error no schemas found for /api/non-existing'));
      expect(patchSpy).toHaveBeenCalledTimes(0);
      expect(res).toBeNull();
    });

    test('No endpoint: errors if endpoint dont exit', async () => {
      const patchSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'patch').mockImplementation(() => null);

      //@ts-expect-error
      const [err, res] = await requestClient.patch('/api/non-existing', null);

      expect(err).toStrictEqual(new Error('error no schemas found for /api/non-existing'));
      expect(patchSpy).toHaveBeenCalledTimes(0);
      expect(res).toBeNull();
    });

    test('No params: parse error on request wrong schema', async () => {
      const patchSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'patch').mockImplementation(async () =>
        asyncOk({
          json: () => null,
          text: () => 'null',
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const [err, res] = await requestClient.patch('/api/my-endpoint', null, {
        // @ts-expect-error
        age: 22,
      });

      expect(isErrorType(ValidationError, err)).toBe(true);
      expect(patchSpy).toHaveBeenCalledTimes(0);
      expect(res).toBeNull();
    });

    test('No params: parse error on response wrong schema', async () => {
      const patchSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'patch').mockImplementation(async () =>
        asyncOk({
          json: () => null,
          text: () => 'null',
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const [err, res] = await requestClient.patch('/api/my-endpoint', null, {
        name: 'Brother',
      });

      expect(isErrorType(ValidationError, err)).toBe(true);
      expect(patchSpy).toHaveBeenCalledOnce();
      expect(patchSpy).toHaveBeenCalledWith(
        'api/my-endpoint',
        expect.objectContaining({
          headers: new Headers(DEFAULT_HEADERS_SEND),
          body: JSON.stringify({ name: 'Brother' }),
        }),
      );
      expect(res).toBeNull();
    });

    test('No params: parse error on response throw', async () => {
      const patchSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'patch').mockImplementation(async () =>
        asyncOk({
          json: () => {
            throw new Error('json-error');
          },
          text: () => {
            throw new Error('json-error');
          },
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const [err, res] = await requestClient.patch('/api/my-endpoint', null, {
        name: 'Brother',
      });

      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe('error doing request in patch');
      expect(patchSpy).toHaveBeenCalledOnce();
      expect(patchSpy).toHaveBeenCalledWith(
        'api/my-endpoint',
        expect.objectContaining({
          headers: new Headers(DEFAULT_HEADERS_SEND),
          body: JSON.stringify({ name: 'Brother' }),
        }),
      );
      expect(res).toBeNull();
    });

    test("No params: returns response from provider's patch method when successful", async () => {
      const patchSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'patch').mockImplementation(async () =>
        asyncOk({
          json: () => ({
            data: 'PATCH returned from mock provider no params',
          }),
          text: () => '{ "data": "PATCH returned from mock provider no params" }',
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const [err, res] = await requestClient.patch('/api/my-endpoint', null, {
        name: 'Little Foot',
      });

      expect(err).toBeNull();
      expect(patchSpy).toHaveBeenCalledOnce();
      expect(patchSpy).toHaveBeenCalledWith(
        'api/my-endpoint',
        expect.objectContaining({
          headers: new Headers(DEFAULT_HEADERS_SEND),
          body: JSON.stringify({ name: 'Little Foot' }),
        }),
      );
      expect(res).toStrictEqual({
        data: 'PATCH returned from mock provider no params',
      });
    });

    test("No params: returns response from provider's patch method when successful without validation", async () => {
      const patchSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'patch').mockImplementation(async () =>
        asyncOk({
          json: () => ({
            data: 'PATCH returned from mock provider no params',
          }),
          text: () => '{ "data": "PATCH returned from mock provider no params" }',
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const [err, res] = await requestClient.patch(
        '/api/my-endpoint',
        null,
        { name: 'Little Foot' },
        { validate: false },
      );

      expect(err).toBeNull();
      expect(patchSpy).toHaveBeenCalledOnce();
      expect(patchSpy).toHaveBeenCalledWith(
        'api/my-endpoint',
        expect.objectContaining({
          headers: new Headers(DEFAULT_HEADERS_SEND),
          body: JSON.stringify({ name: 'Little Foot' }),
        }),
      );
      expect(res).toStrictEqual({
        data: 'PATCH returned from mock provider no params',
      });
    });

    test("No params: returns response from provider's patch method when successful without validation on client", async () => {
      requestClient = new RequestClient({
        fetchProvider: MOCK_FETCH_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: DEFAULT_REQUEST_OPTS,
        endpoints: mockPatchEndpoints,
        validation: false,
        debug: false,
      });

      const patchSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'patch').mockImplementation(async () =>
        asyncOk({
          json: () => ({
            data: 'PATCH returned from mock provider no params',
          }),
          text: () => '{ "data": "PATCH returned from mock provider no params" }',
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const [err, res] = await requestClient.patch('/api/my-endpoint', null, {
        name: 'Little Foot',
      });

      expect(err).toBeNull();
      expect(patchSpy).toHaveBeenCalledOnce();
      expect(patchSpy).toHaveBeenCalledWith(
        'api/my-endpoint',
        expect.objectContaining({
          headers: new Headers(DEFAULT_HEADERS_SEND),
          body: JSON.stringify({ name: 'Little Foot' }),
        }),
      );
      expect(res).toStrictEqual({
        data: 'PATCH returned from mock provider no params',
      });
    });

    test("With params: returns response from provider's patch method when successful", async () => {
      const patchSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'patch').mockImplementation(async () =>
        asyncOk({
          json: () => ({
            data: 'PATCH returned from mock provider with params',
          }),
          text: () => '{ "data": "PATCH returned from mock provider with params" }',
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const [err, res] = await requestClient.patch(
        '/api/my-endpoint/{my-param}',
        { 'my-param': 'hey' },
        { name: 'Little Foot' },
      );

      expect(err).toBeNull();
      expect(patchSpy).toHaveBeenCalledOnce();
      expect(patchSpy).toHaveBeenCalledWith(
        'api/my-endpoint/hey',
        expect.objectContaining({
          headers: new Headers(DEFAULT_HEADERS_SEND),
          body: JSON.stringify({ name: 'Little Foot' }),
        }),
      );
      expect(res).toStrictEqual({
        data: 'PATCH returned from mock provider with params',
      });
    });

    test('Returns error and null data when request returns error tuple', async () => {
      const underlyingError = {
        cause: 'something bad with patch',
        status: 400,
      };

      const patchSpy = vi
        .spyOn(MOCK_FETCH_PROVIDER.prototype, 'patch')
        .mockImplementation(async () => asyncErr(underlyingError));

      const [err, res] = await requestClient.patch('/api/my-endpoint', null, {
        name: 'Little Foot',
      });

      expect(res).toBeNull();
      expect(patchSpy).toHaveBeenCalledOnce();
      expect(patchSpy).toHaveBeenCalledWith(
        'api/my-endpoint',
        expect.objectContaining({
          headers: new Headers(DEFAULT_HEADERS_SEND),
          body: JSON.stringify({ name: 'Little Foot' }),
        }),
      );
      expect(err).toBeInstanceOf(Error);
      expect(err).toStrictEqual(
        new Error('error doing request in patch', {
          cause: new RetryExhaustedError('error retries exhausted', 1, {
            cause: new Error('error request PATCH in request', { cause: underlyingError }),
          }),
        }),
      );
    });

    test('Returns error and null data when constructUrl errors due to bad url', async () => {
      const patchSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'patch');

      const [err, res] = await requestClient.patch(
        '/api/my-bad-endpoint/{ye}}',
        { ye: 'something' },
        { name: 'Little Foot' },
      );

      expect(res).toBeNull();
      expect(patchSpy).not.toHaveBeenCalled();
      expect(err).toBeInstanceOf(Error);
      expect(err?.message.toLowerCase()).toContain('error constructing url');
    });
  });

  describe('DELETE', () => {
    const mockDeleteEndpoints = {
      '/api/my-endpoint': {
        delete: { response: z.object({ data: z.string() }) },
      },
      '/api/my-endpoint/{my-param}': {
        delete: { response: z.object({ data: z.string() }) },
      },
      '/api/my-bad-endpoint/{ye}}': {
        delete: { response: z.object({ data: z.string() }) },
      },
    } satisfies RequestDefinitions;

    let requestClient: RequestClient<typeof mockDeleteEndpoints>;
    let consoleLogSpy: MockedFunction<VoidFunction>;
    let consoleDebugSpy: MockedFunction<VoidFunction>;
    let consoleWarnSpy: MockedFunction<VoidFunction>;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      requestClient = new RequestClient({
        fetchProvider: MOCK_FETCH_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: DEFAULT_REQUEST_OPTS,
        endpoints: mockDeleteEndpoints,
        validation: true,
        debug: true,
      });
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
      consoleDebugSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    test('No endpoint: errors if endpoint dont exit', async () => {
      const deleteSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'delete').mockImplementation(() => null);

      //@ts-expect-error
      const [err, res] = await requestClient.delete('/api/non-existing', null);

      expect(err).toStrictEqual(new Error('error no schemas found for /api/non-existing'));
      expect(deleteSpy).toHaveBeenCalledTimes(0);
      expect(res).toBeNull();
    });

    test('No endpoint: errors if endpoint dont exit', async () => {
      const deleteSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'delete').mockImplementation(() => null);

      //@ts-expect-error
      const [err, res] = await requestClient.delete('/api/non-existing', null);

      expect(err).toStrictEqual(new Error('error no schemas found for /api/non-existing'));
      expect(deleteSpy).toHaveBeenCalledTimes(0);
      expect(res).toBeNull();
    });

    test('No params: parse error on response throw', async () => {
      const deleteSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'delete').mockImplementation(async () =>
        asyncOk({
          json: () => {
            throw new Error('json-error');
          },
          text: () => {
            throw new Error('json-error');
          },
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const [err, res] = await requestClient.delete('/api/my-endpoint', null);

      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe('error doing request in delete');
      expect(deleteSpy).toHaveBeenCalledOnce();
      expect(deleteSpy).toHaveBeenCalledWith('api/my-endpoint', {});
      expect(res).toBeNull();
    });

    test('No params: parse error on response wrong schema', async () => {
      const deleteSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'delete').mockImplementation(async () =>
        asyncOk({
          json: () => null,
          text: () => 'null',
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const [err, res] = await requestClient.delete('/api/my-endpoint', null);

      expect(isErrorType(ValidationError, err)).toBe(true);
      expect(deleteSpy).toHaveBeenCalledOnce();
      expect(deleteSpy).toHaveBeenCalledWith('api/my-endpoint', {});
      expect(res).toBeNull();
    });

    test("No params: returns response from provider's delete method when successful", async () => {
      const deleteSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'delete').mockImplementation(async () =>
        asyncOk({
          json: () => ({
            data: 'DELETE returned from mock provider no params',
          }),
          text: () => '{ "data": "DELETE returned from mock provider no params" }',
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const [err, res] = await requestClient.delete('/api/my-endpoint', null);

      expect(err).toBeNull();
      expect(deleteSpy).toHaveBeenCalledOnce();
      expect(deleteSpy).toHaveBeenCalledWith('api/my-endpoint', {});
      expect(res).toStrictEqual({
        data: 'DELETE returned from mock provider no params',
      });
    });

    test("No params: returns response from provider's delete method when successful without validation", async () => {
      const deleteSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'delete').mockImplementation(async () =>
        asyncOk({
          json: () => ({
            data: 'DELETE returned from mock provider no params',
          }),
          text: () => '{ "data": "DELETE returned from mock provider no params" }',
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const [err, res] = await requestClient.delete('/api/my-endpoint', null, {
        validate: false,
      });

      expect(err).toBeNull();
      expect(deleteSpy).toHaveBeenCalledOnce();
      expect(deleteSpy).toHaveBeenCalledWith('api/my-endpoint', {});
      expect(res).toStrictEqual({
        data: 'DELETE returned from mock provider no params',
      });
    });

    test("No params: returns response from provider's delete method when successful without validation on client", async () => {
      requestClient = new RequestClient({
        fetchProvider: MOCK_FETCH_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: DEFAULT_REQUEST_OPTS,
        endpoints: mockDeleteEndpoints,
        validation: false,
        debug: false,
      });
      const deleteSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'delete').mockImplementation(async () =>
        asyncOk({
          json: () => ({
            data: 'DELETE returned from mock provider no params',
          }),
          text: () => '{ "data": "DELETE returned from mock provider no params" }',
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const [err, res] = await requestClient.delete('/api/my-endpoint', null);

      expect(err).toBeNull();
      expect(deleteSpy).toHaveBeenCalledOnce();
      expect(deleteSpy).toHaveBeenCalledWith('api/my-endpoint', {});
      expect(res).toStrictEqual({
        data: 'DELETE returned from mock provider no params',
      });
    });

    test("With params: returns response from provider's delete method when successful", async () => {
      const deleteSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'delete').mockImplementation(async () =>
        asyncOk({
          json: () => ({
            data: 'DELETE returned from mock provider with params',
          }),
          text: () => '{ "data": "DELETE returned from mock provider with params" }',
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const [err, res] = await requestClient.delete('/api/my-endpoint/{my-param}', {
        'my-param': 'hey',
      });

      expect(err).toBeNull();
      expect(deleteSpy).toHaveBeenCalledOnce();
      expect(deleteSpy).toHaveBeenCalledWith('api/my-endpoint/hey', {});
      expect(res).toStrictEqual({
        data: 'DELETE returned from mock provider with params',
      });
    });

    test('Returns error and null data when request returns error tuple', async () => {
      const underlyingError = {
        cause: 'something bad with delete',
        status: 400,
      };

      const deleteSpy = vi
        .spyOn(MOCK_FETCH_PROVIDER.prototype, 'delete')
        .mockImplementation(async () => asyncErr(underlyingError));

      const [err, res] = await requestClient.delete('/api/my-endpoint', null);

      expect(res).toBeNull();
      expect(deleteSpy).toHaveBeenCalledOnce();
      expect(deleteSpy).toHaveBeenCalledWith('api/my-endpoint', {});
      expect(err).toBeInstanceOf(Error);
      expect(getRetryExhaustedError(err)?.attempts).toBe(1);
      expect(err).toStrictEqual(
        new Error('error doing request in delete', {
          cause: new RetryExhaustedError('error retries exhausted', 1, {
            cause: new Error('error request DELETE in request', { cause: underlyingError }),
          }),
        }),
      );
    });

    test('Returns error and null data when constructUrl errors due to bad url', async () => {
      const deleteSpy = vi.spyOn(MOCK_FETCH_PROVIDER.prototype, 'delete');

      const [err, res] = await requestClient.delete('/api/my-bad-endpoint/{ye}}', {
        ye: 'something',
      });

      expect(res).toBeNull();
      expect(deleteSpy).not.toHaveBeenCalled();
      expect(err).toBeInstanceOf(Error);
      expect(err?.message.toLowerCase()).toContain('error constructing url');
    });
  });
});

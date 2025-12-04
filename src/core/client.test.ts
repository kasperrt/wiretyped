import { afterEach, beforeEach, describe, expect, type MockedFunction, test, vi } from 'vitest';
import { z } from 'zod';
import { isTimeoutError, TimeoutError } from '../error';
import { AbortError } from '../error/abortError';
import { HTTPError } from '../error/httpError';
import { isErrorType } from '../error/isErrorType';
import { ValidationError } from '../error/validationError';
import * as signals from '../utils/signals';
import { RequestClient } from './client';
import type {
  HttpClientProvider,
  HttpClientProviderDefinition,
  HttpRequestOptions,
  RequestDefinitions,
  RequestOptions,
  SSEClientProvider,
  SSEClientProviderDefinition,
  SSEClientSourceInit,
} from './types';

type MockedHTTPClientProvider = MockedFunction<HttpClientProvider>;

const MOCK_HTTP_PROVIDER = vi.fn(function (
  this: HttpClientProviderDefinition,
  baseUrl: string | URL,
  options: HttpRequestOptions,
) {
  Object.defineProperties(this, {
    baseUrl: {
      value: typeof baseUrl === 'string' ? baseUrl : baseUrl.toString(),
      writable: false,
    },
    opts: { value: options, writable: false },
  });
}) as unknown as MockedHTTPClientProvider;

MOCK_HTTP_PROVIDER.prototype.get = vi.fn();
MOCK_HTTP_PROVIDER.prototype.post = vi.fn();
MOCK_HTTP_PROVIDER.prototype.put = vi.fn();
MOCK_HTTP_PROVIDER.prototype.patch = vi.fn();
MOCK_HTTP_PROVIDER.prototype.delete = vi.fn();

type MockedSSEClientProvider = MockedFunction<SSEClientProvider>;

const MOCK_SSE_PROVIDER = vi.fn(function (
  this: SSEClientProviderDefinition,
  url: string | URL,
  init?: SSEClientSourceInit,
) {
  Object.defineProperties(this, {
    url: {
      value: typeof url === 'string' ? url : url.toString(),
      writable: false,
    },
    withCredentials: { value: init?.withCredentials ?? true, writable: false },
    readyState: { value: 0, writable: true }, // start CONNECTING to be realistic
    CLOSED: { value: 2, writable: false },
    CONNECTING: { value: 0, writable: false },
    OPEN: { value: 1, writable: false },
  });

  this.onopen = null;
  this.onmessage = null;
  this.onerror = null;

  this.close = vi.fn(() => {
    // biome-ignore lint/suspicious/noExplicitAny: Overriding on purpose to access internal state
    (this as any).readyState = this.CLOSED;
  });
  this.addEventListener = vi.fn();
  this.removeEventListener = vi.fn();
  this.dispatchEvent = vi.fn().mockReturnValue(true);

  // Simulate async successful open
  queueMicrotask(() => {
    // biome-ignore lint/suspicious/noExplicitAny: Overriding on purpose to access internal state
    (this as any).readyState = this.OPEN;
    this.onopen?.(new Event('open'));
  });
}) as unknown as MockedSSEClientProvider;

const DEFAULT_HEADERS = {
  Accept: 'application/json',
};

const DEFAULT_HEADERS_SEND = {
  'Content-Type': 'application/json',
};

const defaultEndpoints: RequestDefinitions = {};
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
        httpProvider: MOCK_HTTP_PROVIDER,
        sseProvider: MOCK_SSE_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        endpoints: defaultEndpoints,
        validation: true,
        fetchOpts: { timeout: 10_000, retry: { limit: 0 }, credentials: 'include', mode: 'cors' },
        debug: true,
      });

      expect(MOCK_HTTP_PROVIDER).toHaveBeenCalledOnce();
      const firstCall = MOCK_HTTP_PROVIDER.mock.calls[0];
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
        httpProvider: MOCK_HTTP_PROVIDER,
        // @ts-expect-error
        sseProvider: null,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: DEFAULT_REQUEST_OPTS,
        endpoints: defaultEndpoints,
        validation: true,
        debug: true,
      });

      expect(MOCK_HTTP_PROVIDER).toHaveBeenCalledOnce();
      const firstCall = MOCK_HTTP_PROVIDER.mock.calls[0];
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
      expect(requestClient).toHaveProperty('download');

      consoleLogSpy.mockRestore();
      consoleDebugSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });
  });

  describe('Retry', () => {
    test("Calls provider's get method with expected retry params", async () => {
      const mockGetEndpoints = {
        '/api/my-endpoint': {
          get: { response: z.object({ data: z.string() }) },
        },
      } satisfies RequestDefinitions;

      const getSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'get').mockImplementation(() => {
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
        httpProvider: MOCK_HTTP_PROVIDER,
        sseProvider: MOCK_SSE_PROVIDER,
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
      expect(getSpy).toHaveBeenCalledWith('api/my-endpoint', expect.any(Object));
    });

    test('uses default retry limit when none provided', async () => {
      vi.useFakeTimers();
      const mockGetEndpoints = {
        '/api/my-endpoint': {
          get: { response: z.object({ data: z.string() }) },
        },
      } satisfies RequestDefinitions;

      const getSpy = vi
        .spyOn(MOCK_HTTP_PROVIDER.prototype, 'get')
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
        httpProvider: MOCK_HTTP_PROVIDER,
        sseProvider: MOCK_SSE_PROVIDER,
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
        .spyOn(MOCK_HTTP_PROVIDER.prototype, 'get')
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
        httpProvider: MOCK_HTTP_PROVIDER,
        sseProvider: MOCK_SSE_PROVIDER,
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
        .spyOn(MOCK_HTTP_PROVIDER.prototype, 'get')
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
        httpProvider: MOCK_HTTP_PROVIDER,
        sseProvider: MOCK_SSE_PROVIDER,
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
      const getSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'get').mockImplementation(async () => asyncErr(abortErr));

      const requestClient: RequestClient<typeof mockGetEndpoints> = new RequestClient({
        httpProvider: MOCK_HTTP_PROVIDER,
        sseProvider: MOCK_SSE_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: { retry: { limit: 3, timeout: 1 }, timeout: false },
        endpoints: mockGetEndpoints,
        validation: true,
      });

      const [err, res] = await requestClient.get('/api/my-endpoint', null);

      expect(res).toBeNull();
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).cause).toStrictEqual(new Error('error request GET in request', { cause: abortErr }));
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
        .spyOn(MOCK_HTTP_PROVIDER.prototype, 'get')
        .mockImplementationOnce(async () => asyncErr(timeoutErr))
        .mockImplementationOnce(async () => asyncOk(successResponse));

      const requestClient: RequestClient<typeof mockGetEndpoints> = new RequestClient({
        httpProvider: MOCK_HTTP_PROVIDER,
        sseProvider: MOCK_SSE_PROVIDER,
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
        .spyOn(MOCK_HTTP_PROVIDER.prototype, 'get')
        .mockImplementationOnce(async () => asyncErr(typeErr))
        .mockImplementationOnce(async () => asyncOk(successResponse));

      const requestClient: RequestClient<typeof mockGetEndpoints> = new RequestClient({
        httpProvider: MOCK_HTTP_PROVIDER,
        sseProvider: MOCK_SSE_PROVIDER,
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
      };

      const getSpy = vi
        .spyOn(MOCK_HTTP_PROVIDER.prototype, 'get')
        .mockImplementation(async () => asyncOk(httpResponse));

      const requestClient: RequestClient<typeof mockGetEndpoints> = new RequestClient({
        httpProvider: MOCK_HTTP_PROVIDER,
        sseProvider: MOCK_SSE_PROVIDER,
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
      };

      const successResponse = {
        ok: true,
        status: 200,
        json: () => ({ data: 'ok' }),
        text: () => '{ "data": "ok" }',
        headers: { get: () => 'application/json' },
      };

      const getSpy = vi
        .spyOn(MOCK_HTTP_PROVIDER.prototype, 'get')
        .mockImplementationOnce(async () => asyncOk(errorResponse))
        .mockImplementationOnce(async () => asyncOk(successResponse));

      const requestClient: RequestClient<typeof mockGetEndpoints> = new RequestClient({
        httpProvider: MOCK_HTTP_PROVIDER,
        sseProvider: MOCK_SSE_PROVIDER,
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
        },
      } satisfies RequestDefinitions;

      const httpResponse = {
        ok: false,
        status: 418,
        json: () => ({ message: 'teapot' }),
        text: () => '{ "message": "teapot" }',
        headers: { get: () => 'application/json' },
      };

      const getSpy = vi
        .spyOn(MOCK_HTTP_PROVIDER.prototype, 'get')
        .mockImplementation(async () => asyncOk(httpResponse));

      const requestClient: RequestClient<typeof mockGetEndpoints> = new RequestClient({
        httpProvider: MOCK_HTTP_PROVIDER,
        sseProvider: MOCK_SSE_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: { retry: { limit: 3, timeout: 1, statusCodes: [500] }, timeout: false },
        endpoints: mockGetEndpoints,
        validation: true,
      });

      const [err, res] = await requestClient.get('/api/my-endpoint', null);

      expect(res).toBeNull();
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).cause).toBeInstanceOf(HTTPError);
      expect(getSpy).toHaveBeenCalledTimes(1);
    });

    test('wraps thrown provider error before processing tuple', async () => {
      const mockGetEndpoints = {
        '/api/my-endpoint': {
          get: { response: z.object({ data: z.string() }) },
        },
      } satisfies RequestDefinitions;

      const thrown = new Error('boom');
      const getSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'get').mockImplementation(() => {
        throw thrown;
      });

      const client: RequestClient<typeof mockGetEndpoints> = new RequestClient({
        httpProvider: MOCK_HTTP_PROVIDER,
        sseProvider: MOCK_SSE_PROVIDER,
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
      expect((err as Error).cause).toStrictEqual(new Error('error calling request get in request', { cause: thrown }));
      expect(getSpy).toHaveBeenCalledOnce();
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
      const getSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'get').mockImplementation(() =>
        asyncOk({
          json: () => ({ data: 'ok' }),
          text: () => '{ "data": "ok" }',
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const client = new RequestClient({
        httpProvider: MOCK_HTTP_PROVIDER,
        sseProvider: MOCK_SSE_PROVIDER,
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
      const getSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'get').mockImplementation(() =>
        asyncOk({
          json: () => ({ data: 'ok' }),
          text: () => '{ "data": "ok" }',
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const client = new RequestClient({
        httpProvider: MOCK_HTTP_PROVIDER,
        sseProvider: MOCK_SSE_PROVIDER,
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
      const getSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'get').mockImplementation(() =>
        asyncOk({
          json: () => ({ data: 'ok' }),
          text: () => '{ "data": "ok" }',
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
        }),
      );

      const client = new RequestClient({
        httpProvider: MOCK_HTTP_PROVIDER,
        sseProvider: MOCK_SSE_PROVIDER,
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
        httpProvider: MOCK_HTTP_PROVIDER,
        sseProvider: MOCK_SSE_PROVIDER,
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
        httpProvider: MOCK_HTTP_PROVIDER,
        sseProvider: MOCK_SSE_PROVIDER,
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
      const getSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'get').mockImplementation(() => null);

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
        .spyOn(MOCK_HTTP_PROVIDER.prototype, 'get')
        .mockImplementation(async () => asyncErr(underlyingError));

      const [err, res] = await requestClient.download('/api/my-endpoint', null);

      expect(res).toBeNull();
      expect(getSpy).toHaveBeenCalledOnce();
      expect(getSpy).toHaveBeenCalledWith('api/my-endpoint', {});
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe('error doing request in download');
      expect((err as Error).cause).toStrictEqual(new Error('error request GET in request', { cause: underlyingError }));
    });

    test("No params: returns blob data from provider's get when request was successful", async () => {
      const getSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'get').mockImplementation(() => {
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

      const getSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'get').mockImplementation(() => {
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

      const getSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'get').mockImplementation(() => {
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

      const getSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'get').mockImplementation(() => {
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
          httpProvider: MOCK_HTTP_PROVIDER,
          sseProvider: MOCK_SSE_PROVIDER,
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
        const getSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'get').mockImplementation(() => null);

        //@ts-expect-error
        const [err, res] = await requestClient.get('/api/non-existing', null);

        expect(err).toStrictEqual(new Error('error no schemas found for /api/non-existing'));
        expect(getSpy).toHaveBeenCalledTimes(0);
        expect(res).toBeNull();
      });

      test('No params: returns json parsed data when request was successful', async () => {
        const getSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'get').mockImplementation(async () =>
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
        const getSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'get').mockImplementation(async () =>
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
        });

        expect(err).toBeNull();
        expect(getSpy).toHaveBeenCalledOnce();
        expect(getSpy).toHaveBeenCalledWith('api/my-endpoint', expect.any(Object));
        expect(res).toStrictEqual({ data: 'GET request data no params' });
      });

      test('No params: returns json parsed data when request was successful non-validated on client', async () => {
        requestClient = new RequestClient({
          httpProvider: MOCK_HTTP_PROVIDER,
          sseProvider: MOCK_SSE_PROVIDER,
          baseUrl: 'https://api.example.com/base',
          hostname: 'https://api.example.com',
          fetchOpts: DEFAULT_REQUEST_OPTS,
          endpoints: mockGetEndpoints,
          validation: false,
          debug: false,
        });
        const getSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'get').mockImplementation(async () =>
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
        const getSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'get').mockImplementation(async () =>
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
        const getSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'get').mockImplementation(async () =>
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
        const getSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'get').mockImplementation(async () =>
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
        const getSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'get').mockImplementation(async () =>
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
        const getSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'get').mockImplementation(async () =>
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
        expect(res).toBeNull;
      });

      test('With params: should return json parsed data when request was successful', async () => {
        const getSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'get').mockImplementation(async () =>
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
          .spyOn(MOCK_HTTP_PROVIDER.prototype, 'get')
          .mockImplementation(async () => asyncErr(underlyingError));

        const [err, res] = await requestClient.get('/api/my-endpoint', null);

        expect(res).toBeNull();
        expect(getSpy).toHaveBeenCalledOnce();
        expect(getSpy).toHaveBeenCalledWith('api/my-endpoint', {});
        expect(err).toBeInstanceOf(Error);
        expect(err?.message).toBe('error doing request in get');
        expect((err as Error).cause).toStrictEqual(
          new Error('error request GET in request', { cause: underlyingError }),
        );
      });

      test('All params: Returns json parsed data when request was successful', async () => {
        const getSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'get').mockImplementation(async () =>
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
        const getSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'get').mockImplementation(async () =>
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

        expect(err).toStrictEqual(new Error('error constructing URL in get'));
        expect(getSpy).toHaveBeenCalledTimes(0);
        expect(res).toBeNull();
      });

      test('Returns error and null data when constructUrl errors due to bad url', async () => {
        const getSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'get');

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
          httpProvider: MOCK_HTTP_PROVIDER,
          sseProvider: MOCK_SSE_PROVIDER,
          baseUrl: 'https://api.example.com/base',
          hostname: 'https://api.example.com',
          fetchOpts: DEFAULT_REQUEST_OPTS,
          endpoints: mockGetEndpoints,
          validation: true,
          debug: true,
        });

        const getSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'get').mockImplementation(async () =>
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
        expect(getSpy).toHaveBeenCalledWith('api/my-endpoint', expect.any(Object));
        expect(res).toStrictEqual({
          data: 'GET request data with cacheRequest',
        });
        consoleLogSpy.mockRestore();
        consoleDebugSpy.mockRestore();
        consoleWarnSpy.mockRestore();
      });

      test('Does not call get() if key was in cache, and returns cached value', async () => {
        const requestClientWithCache = new RequestClient({
          httpProvider: MOCK_HTTP_PROVIDER,
          sseProvider: MOCK_SSE_PROVIDER,
          baseUrl: 'https://api.example.com/base',
          hostname: 'https://api.example.com',
          fetchOpts: DEFAULT_REQUEST_OPTS,
          endpoints: mockGetEndpoints,
          validation: true,
        });

        // Step 1: call get() on endpoint so it gets added to the cache
        const getSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'get').mockImplementation(async () =>
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
        expect(getSpy).toHaveBeenCalledWith('api/my-endpoint', expect.any(Object));
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
          httpProvider: MOCK_HTTP_PROVIDER,
          sseProvider: MOCK_SSE_PROVIDER,
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
          .spyOn(MOCK_HTTP_PROVIDER.prototype, 'get')
          .mockImplementation(async () => asyncErr(underlyingError));

        const [err, res] = await requestClientWithCache.get('/api/my-endpoint', null, {
          cacheRequest: true,
        });

        expect(res).toBeNull();
        expect(getSpy).toHaveBeenCalledOnce();
        expect(getSpy).toHaveBeenCalledWith('api/my-endpoint', expect.any(Object));
        expect(err).toBeInstanceOf(Error);
        expect(err?.message.toLowerCase()).toContain('error getting cached response in get');
        expect((((err as Error).cause as Error).cause as Error).cause).toStrictEqual(
          new Error('error doing request in get', {
            cause: new Error('error request GET in request', { cause: underlyingError }),
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
        httpProvider: MOCK_HTTP_PROVIDER,
        sseProvider: MOCK_SSE_PROVIDER,
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
      const postSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'post').mockImplementation(() => null);

      //@ts-expect-error
      const [err, res] = await requestClient.post('/api/non-existing', null);

      expect(err).toStrictEqual(new Error('error no schemas found for /api/non-existing'));
      expect(postSpy).toHaveBeenCalledTimes(0);
      expect(res).toBeNull();
    });

    test('No params: parse error on request wrong schema', async () => {
      const postSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'post').mockImplementation(async () =>
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
      const postSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'post').mockImplementation(async () =>
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
        expect.objectContaining({ headers: DEFAULT_HEADERS_SEND, body: JSON.stringify({ name: 'Brother' }) }),
      );
      expect(res).toBeNull();
    });

    test('No params: parse error on response throw', async () => {
      const postSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'post').mockImplementation(async () =>
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
        expect.objectContaining({ headers: DEFAULT_HEADERS_SEND, body: JSON.stringify({ name: 'Brother' }) }),
      );
      expect(res).toBeNull();
    });

    test("No params: returns response from provider's post method when successful", async () => {
      const postSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'post').mockImplementation(async () =>
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
        expect.objectContaining({ headers: DEFAULT_HEADERS_SEND, body: JSON.stringify({ name: 'Brother' }) }),
      );
      expect(res).toStrictEqual({
        data: 'POST returned from mock provider no params',
      });
    });

    test("No params: returns response from provider's post method when successful non-validated", async () => {
      const postSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'post').mockImplementation(async () =>
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
        expect.objectContaining({ headers: DEFAULT_HEADERS_SEND, body: JSON.stringify({ name: 'Brother' }) }),
      );
      expect(res).toStrictEqual({
        data: 'POST returned from mock provider no params',
      });
    });

    test("No params: returns response from provider's post method when successful non-validated on client", async () => {
      requestClient = new RequestClient({
        httpProvider: MOCK_HTTP_PROVIDER,
        sseProvider: MOCK_SSE_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: DEFAULT_REQUEST_OPTS,
        endpoints: mockPostEndpoints,
        validation: false,
        debug: false,
      });

      const postSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'post').mockImplementation(async () =>
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
        expect.objectContaining({ headers: DEFAULT_HEADERS_SEND, body: JSON.stringify({ name: 'Brother' }) }),
      );
      expect(res).toStrictEqual({
        data: 'POST returned from mock provider no params',
      });
    });

    test("With params: returns response from provider's post method when successful", async () => {
      const postSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'post').mockImplementation(async () =>
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
        expect.objectContaining({ headers: DEFAULT_HEADERS_SEND, body: JSON.stringify({ name: 'Brother' }) }),
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
        .spyOn(MOCK_HTTP_PROVIDER.prototype, 'post')
        .mockImplementation(async () => asyncErr(underlyingError));

      const [err, res] = await requestClient.post('/api/my-endpoint', null, {
        name: 'Brother',
      });

      expect(res).toBeNull();
      expect(postSpy).toHaveBeenCalledOnce();
      expect(postSpy).toHaveBeenCalledWith(
        'api/my-endpoint',
        expect.objectContaining({ headers: DEFAULT_HEADERS_SEND, body: JSON.stringify({ name: 'Brother' }) }),
      );
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe('error doing request in post');
      expect((err as Error).cause).toStrictEqual(
        new Error('error request POST in request', { cause: underlyingError }),
      );
    });

    test('Returns error and null data when constructUrl errors due to bad url', async () => {
      const postSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'post');

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
        httpProvider: MOCK_HTTP_PROVIDER,
        sseProvider: MOCK_SSE_PROVIDER,
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
      const putSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'put').mockImplementation(() => null);

      //@ts-expect-error
      const [err, res] = await requestClient.put('/api/non-existing', null);

      expect(err).toStrictEqual(new Error('error no schemas found for /api/non-existing'));
      expect(putSpy).toHaveBeenCalledTimes(0);
      expect(res).toBeNull();
    });

    test('No endpoint: errors if endpoint dont exit', async () => {
      const putSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'put').mockImplementation(() => null);

      //@ts-expect-error
      const [err, res] = await requestClient.put('/api/non-existing', null);

      expect(err).toStrictEqual(new Error('error no schemas found for /api/non-existing'));
      expect(putSpy).toHaveBeenCalledTimes(0);
      expect(res).toBeNull();
    });

    test('No params: parse error on request wrong schema', async () => {
      const putSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'put').mockImplementation(async () =>
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
      const putSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'put').mockImplementation(async () =>
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
        expect.objectContaining({ headers: DEFAULT_HEADERS_SEND, body: JSON.stringify({ name: 'Brother' }) }),
      );
      expect(res).toBeNull();
    });

    test('No params: parse error on response throw', async () => {
      const putSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'put').mockImplementation(async () =>
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
        expect.objectContaining({ headers: DEFAULT_HEADERS_SEND, body: JSON.stringify({ name: 'Brother' }) }),
      );
      expect(res).toBeNull();
    });

    test("No params: returns response from provider's put method when successful", async () => {
      const putSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'put').mockImplementation(async () =>
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
        expect.objectContaining({ headers: DEFAULT_HEADERS_SEND, body: JSON.stringify({ name: 'Pooh' }) }),
      );
      expect(res).toStrictEqual({
        data: 'PUT returned from mock provider no params',
      });
    });

    test("No params: returns response from provider's put method when successful non-validated", async () => {
      const putSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'put').mockImplementation(async () =>
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
        expect.objectContaining({ headers: DEFAULT_HEADERS_SEND, body: JSON.stringify({ name: 'Brother' }) }),
      );
      expect(res).toStrictEqual({
        data: 'POST returned from mock provider no params',
      });
    });

    test("No params: returns response from provider's put method when successful non-validated on client", async () => {
      requestClient = new RequestClient({
        httpProvider: MOCK_HTTP_PROVIDER,
        sseProvider: MOCK_SSE_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: DEFAULT_REQUEST_OPTS,
        endpoints: mockPutEndpoints,
        validation: false,
        debug: false,
      });

      const putSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'put').mockImplementation(async () =>
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
        expect.objectContaining({ headers: DEFAULT_HEADERS_SEND, body: JSON.stringify({ name: 'Brother' }) }),
      );
      expect(res).toStrictEqual({
        data: 'POST returned from mock provider no params',
      });
    });

    test("With params: returns response from provider's put method when successful", async () => {
      const putSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'put').mockImplementation(async () =>
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
        expect.objectContaining({ headers: DEFAULT_HEADERS_SEND, body: JSON.stringify({ name: 'Pooh' }) }),
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
        .spyOn(MOCK_HTTP_PROVIDER.prototype, 'put')
        .mockImplementation(async () => asyncErr(underlyingError));

      const [err, res] = await requestClient.put('/api/my-endpoint', null, {
        name: 'Pooh',
      });

      expect(res).toBeNull();
      expect(putSpy).toHaveBeenCalledOnce();
      expect(putSpy).toHaveBeenCalledWith(
        'api/my-endpoint',
        expect.objectContaining({ headers: DEFAULT_HEADERS_SEND, body: JSON.stringify({ name: 'Pooh' }) }),
      );
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe('error doing request in put');
      expect((err as Error).cause as Error).toStrictEqual(new Error('error request PUT in request'));
      expect(((err as Error).cause as Error).cause).toStrictEqual(underlyingError);
    });

    test('Returns error and null data when constructUrl errors due to bad url', async () => {
      const putSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'put');

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
        httpProvider: MOCK_HTTP_PROVIDER,
        sseProvider: MOCK_SSE_PROVIDER,
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
      const patchSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'patch').mockImplementation(() => null);

      //@ts-expect-error
      const [err, res] = await requestClient.patch('/api/non-existing', null);

      expect(err).toStrictEqual(new Error('error no schemas found for /api/non-existing'));
      expect(patchSpy).toHaveBeenCalledTimes(0);
      expect(res).toBeNull();
    });

    test('No endpoint: errors if endpoint dont exit', async () => {
      const patchSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'patch').mockImplementation(() => null);

      //@ts-expect-error
      const [err, res] = await requestClient.patch('/api/non-existing', null);

      expect(err).toStrictEqual(new Error('error no schemas found for /api/non-existing'));
      expect(patchSpy).toHaveBeenCalledTimes(0);
      expect(res).toBeNull();
    });

    test('No params: parse error on request wrong schema', async () => {
      const patchSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'patch').mockImplementation(async () =>
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
      const patchSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'patch').mockImplementation(async () =>
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
        expect.objectContaining({ headers: DEFAULT_HEADERS_SEND, body: JSON.stringify({ name: 'Brother' }) }),
      );
      expect(res).toBeNull();
    });

    test('No params: parse error on response throw', async () => {
      const patchSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'patch').mockImplementation(async () =>
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
        expect.objectContaining({ headers: DEFAULT_HEADERS_SEND, body: JSON.stringify({ name: 'Brother' }) }),
      );
      expect(res).toBeNull();
    });

    test("No params: returns response from provider's patch method when successful", async () => {
      const patchSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'patch').mockImplementation(async () =>
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
        expect.objectContaining({ headers: DEFAULT_HEADERS_SEND, body: JSON.stringify({ name: 'Little Foot' }) }),
      );
      expect(res).toStrictEqual({
        data: 'PATCH returned from mock provider no params',
      });
    });

    test("No params: returns response from provider's patch method when successful without validation", async () => {
      const patchSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'patch').mockImplementation(async () =>
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
        expect.objectContaining({ headers: DEFAULT_HEADERS_SEND, body: JSON.stringify({ name: 'Little Foot' }) }),
      );
      expect(res).toStrictEqual({
        data: 'PATCH returned from mock provider no params',
      });
    });

    test("No params: returns response from provider's patch method when successful without validation on client", async () => {
      requestClient = new RequestClient({
        httpProvider: MOCK_HTTP_PROVIDER,
        sseProvider: MOCK_SSE_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: DEFAULT_REQUEST_OPTS,
        endpoints: mockPatchEndpoints,
        validation: false,
        debug: false,
      });

      const patchSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'patch').mockImplementation(async () =>
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
        expect.objectContaining({ headers: DEFAULT_HEADERS_SEND, body: JSON.stringify({ name: 'Little Foot' }) }),
      );
      expect(res).toStrictEqual({
        data: 'PATCH returned from mock provider no params',
      });
    });

    test("With params: returns response from provider's patch method when successful", async () => {
      const patchSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'patch').mockImplementation(async () =>
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
        expect.objectContaining({ headers: DEFAULT_HEADERS_SEND, body: JSON.stringify({ name: 'Little Foot' }) }),
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
        .spyOn(MOCK_HTTP_PROVIDER.prototype, 'patch')
        .mockImplementation(async () => asyncErr(underlyingError));

      const [err, res] = await requestClient.patch('/api/my-endpoint', null, {
        name: 'Little Foot',
      });

      expect(res).toBeNull();
      expect(patchSpy).toHaveBeenCalledOnce();
      expect(patchSpy).toHaveBeenCalledWith(
        'api/my-endpoint',
        expect.objectContaining({ headers: DEFAULT_HEADERS_SEND, body: JSON.stringify({ name: 'Little Foot' }) }),
      );
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe('error doing request in patch');
      expect((err as Error).cause as Error).toStrictEqual(new Error('error request PATCH in request'));
      expect(((err as Error).cause as Error).cause).toStrictEqual(underlyingError);
    });

    test('Returns error and null data when constructUrl errors due to bad url', async () => {
      const patchSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'patch');

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
        httpProvider: MOCK_HTTP_PROVIDER,
        sseProvider: MOCK_SSE_PROVIDER,
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
      const deleteSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'delete').mockImplementation(() => null);

      //@ts-expect-error
      const [err, res] = await requestClient.delete('/api/non-existing', null);

      expect(err).toStrictEqual(new Error('error no schemas found for /api/non-existing'));
      expect(deleteSpy).toHaveBeenCalledTimes(0);
      expect(res).toBeNull();
    });

    test('No endpoint: errors if endpoint dont exit', async () => {
      const deleteSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'delete').mockImplementation(() => null);

      //@ts-expect-error
      const [err, res] = await requestClient.delete('/api/non-existing', null);

      expect(err).toStrictEqual(new Error('error no schemas found for /api/non-existing'));
      expect(deleteSpy).toHaveBeenCalledTimes(0);
      expect(res).toBeNull();
    });

    test('No params: parse error on response throw', async () => {
      const deleteSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'delete').mockImplementation(async () =>
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
      const deleteSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'delete').mockImplementation(async () =>
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
      const deleteSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'delete').mockImplementation(async () =>
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
      const deleteSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'delete').mockImplementation(async () =>
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
      expect(deleteSpy).toHaveBeenCalledWith('api/my-endpoint', expect.any(Object));
      expect(res).toStrictEqual({
        data: 'DELETE returned from mock provider no params',
      });
    });

    test("No params: returns response from provider's delete method when successful without validation on client", async () => {
      requestClient = new RequestClient({
        httpProvider: MOCK_HTTP_PROVIDER,
        sseProvider: MOCK_SSE_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: DEFAULT_REQUEST_OPTS,
        endpoints: mockDeleteEndpoints,
        validation: false,
        debug: false,
      });
      const deleteSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'delete').mockImplementation(async () =>
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
      const deleteSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'delete').mockImplementation(async () =>
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
        .spyOn(MOCK_HTTP_PROVIDER.prototype, 'delete')
        .mockImplementation(async () => asyncErr(underlyingError));

      const [err, res] = await requestClient.delete('/api/my-endpoint', null);

      expect(res).toBeNull();
      expect(deleteSpy).toHaveBeenCalledOnce();
      expect(deleteSpy).toHaveBeenCalledWith('api/my-endpoint', {});
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).cause as Error).toStrictEqual(new Error('error request DELETE in request'));
      expect(((err as Error).cause as Error).cause).toStrictEqual(underlyingError);
    });

    test('Returns error and null data when constructUrl errors due to bad url', async () => {
      const deleteSpy = vi.spyOn(MOCK_HTTP_PROVIDER.prototype, 'delete');

      const [err, res] = await requestClient.delete('/api/my-bad-endpoint/{ye}}', {
        ye: 'something',
      });

      expect(res).toBeNull();
      expect(deleteSpy).not.toHaveBeenCalled();
      expect(err).toBeInstanceOf(Error);
      expect(err?.message.toLowerCase()).toContain('error constructing url');
    });
  });

  describe('SSE', () => {
    const mockSseEndpoints = {
      '/api/my-sse': {
        sse: {
          response: z.object({
            hello: z.literal('world'),
          }),
        },
      },
      '/api/{integration}': {
        sse: {
          $path: z.object({
            integration: z.enum(['sse-test']),
          }),
          response: z.object({
            hello: z.literal('world'),
          }),
        },
      },
    } satisfies RequestDefinitions;

    let requestClient: RequestClient<typeof mockSseEndpoints>;

    let consoleLogSpy: MockedFunction<VoidFunction>;
    let consoleDebugSpy: MockedFunction<VoidFunction>;
    let consoleWarnSpy: MockedFunction<VoidFunction>;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      requestClient = new RequestClient({
        httpProvider: MOCK_HTTP_PROVIDER,
        sseProvider: MOCK_SSE_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: DEFAULT_REQUEST_OPTS,
        endpoints: mockSseEndpoints,
        validation: true,
        debug: true,
      });

      vi.clearAllMocks();
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
      consoleDebugSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    test('Constructs SSE connection and returns close function', async () => {
      const handler = vi.fn();

      const [err, close] = await requestClient.sse('/api/my-sse', null, handler);

      expect(err).toBeNull();
      expect(MOCK_SSE_PROVIDER).toHaveBeenCalledOnce();

      const instance = MOCK_SSE_PROVIDER.mock.instances[0];

      expect(instance.url).toBe('https://api.example.com/base/api/my-sse');
      expect(instance.withCredentials).toBe(true);

      close?.();
      expect(instance.close).toHaveBeenCalled();
    });

    test('Errors when no sseProvider is supplied', async () => {
      const client = new RequestClient({
        httpProvider: MOCK_HTTP_PROVIDER,
        // @ts-expect-error testing missing provider branch
        sseProvider: null,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: DEFAULT_REQUEST_OPTS,
        endpoints: mockSseEndpoints,
        validation: true,
        debug: false,
      });

      const handler = vi.fn();
      const [err, close] = await client.sse('/api/my-sse', null, handler);

      expect(err).toStrictEqual(new Error('error missing sse provider in sse on url api/my-sse'));
      expect(close).toBeNull();
      expect(handler).not.toHaveBeenCalled();
    });

    test('Errors on non-existant URL', async () => {
      const handler = vi.fn();

      // @ts-expect-error
      const [err, close] = await requestClient.sse('/api/my-non-existing-sse', null, handler);

      expect(err).toStrictEqual(new Error('error no schemas found for /api/my-non-existing-sse'));
      expect(MOCK_SSE_PROVIDER).toHaveBeenCalledTimes(0);
      expect(close).toBeNull();
    });

    test('Errors on malformed URL constructing', async () => {
      const handler = vi.fn();

      // @ts-expect-error
      const [err, close] = await requestClient.sse('/api/{integration}', { $path: { integration: 'slack' } }, handler);

      expect(err).toStrictEqual(new Error('error constructing url in sse'));
      expect(MOCK_SSE_PROVIDER).toHaveBeenCalledTimes(0);
      expect(close).toBeNull();
    });

    test('onmessage parses JSON and calls handler with data', async () => {
      const handler = vi.fn();

      await requestClient.sse('/api/my-sse', null, handler);

      const instance = MOCK_SSE_PROVIDER.mock.instances[0];

      const fakeMessage = {
        data: JSON.stringify({ hello: 'world' }),
      } as MessageEvent;

      instance.onmessage?.(fakeMessage);

      await vi.waitUntil(() => handler.mock.calls.length > 0);

      expect(handler).toHaveBeenCalledWith([null, { hello: 'world' }]);
    });

    test('onerror after open passes ErrorEvent-like details to handler', async () => {
      const handler = vi.fn();

      await requestClient.sse('/api/my-sse', null, handler);
      const instance = MOCK_SSE_PROVIDER.mock.instances[0];

      // Simulate a post-open error event with name/message
      const errorLike = { name: 'ErrorEvent', message: 'I died', extra: true } as unknown as Event;
      instance.onerror?.(errorLike);

      expect(handler).toHaveBeenCalledWith([
        new Error('error receiving on api/my-sse for sse: I died', { cause: errorLike }),
        null,
      ]);
    });

    test('onmessage parses JSON and calls handler with data without validation', async () => {
      const handler = vi.fn();

      await requestClient.sse('/api/my-sse', null, handler, {
        validate: false,
      });

      const instance = MOCK_SSE_PROVIDER.mock.instances[0];

      const fakeMessage = {
        data: JSON.stringify({ hello: 'world' }),
      } as MessageEvent;

      instance.onmessage?.(fakeMessage);

      await vi.waitUntil(() => handler.mock.calls.length > 0);

      expect(handler).toHaveBeenCalledWith([null, { hello: 'world' }]);
    });

    test('onmessage parses JSON and calls handler with data without validation on client', async () => {
      requestClient = new RequestClient({
        httpProvider: MOCK_HTTP_PROVIDER,
        sseProvider: MOCK_SSE_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: DEFAULT_REQUEST_OPTS,
        endpoints: mockSseEndpoints,
        validation: false,
        debug: false,
      });

      const handler = vi.fn();

      await requestClient.sse('/api/my-sse', null, handler);

      const instance = MOCK_SSE_PROVIDER.mock.instances[0];

      const fakeMessage = {
        data: JSON.stringify({ hello: 'world' }),
      } as MessageEvent;

      instance.onmessage?.(fakeMessage);

      await vi.waitUntil(() => handler.mock.calls.length > 0);

      expect(handler).toHaveBeenCalledWith([null, { hello: 'world' }]);
    });

    test('onmessage calls handler with error when JSON is invalid', async () => {
      const handler = vi.fn();

      await requestClient.sse('/api/my-sse', null, handler);

      const instance = MOCK_SSE_PROVIDER.mock.instances[0];

      const fakeMessage = { data: 'not-json' } as MessageEvent;
      instance.onmessage?.(fakeMessage);

      await vi.waitUntil(() => handler.mock.calls.length > 0);

      const [err, data] = handler.mock.calls[0][0];

      expect(err).toBeInstanceOf(Error);
      expect(data).toBeNull();
    });

    test('onmessage calls handler with error when JSON is invalid', async () => {
      const handler = vi.fn();

      await requestClient.sse('/api/my-sse', null, handler);

      const instance = MOCK_SSE_PROVIDER.mock.instances[0];

      const fakeMessage = {
        data: JSON.stringify({ yo: 'dawg' }),
      } as MessageEvent;
      instance.onmessage?.(fakeMessage);

      await vi.waitUntil(() => handler.mock.calls.length > 0);

      const [err, data] = handler.mock.calls[0][0];

      expect(err).toBeInstanceOf(Error);
      expect(data).toBeNull();
    });

    test('onerror calls handler with generic error', async () => {
      const handler = vi.fn();

      await requestClient.sse('/api/my-sse', null, handler);

      const instance = MOCK_SSE_PROVIDER.mock.instances[0];

      const fakeError = new Event('error');
      instance.onerror?.(fakeError);

      await vi.waitUntil(() => handler.mock.calls.length > 0);

      const [err, data] = handler.mock.calls[0][0];
      expect(err).toBeInstanceOf(Error);
      expect(data).toBeNull();
    });

    test('onerror calls handler with error-event error', async () => {
      const handler = vi.fn();

      await requestClient.sse('/api/my-sse', null, handler);

      const instance = MOCK_SSE_PROVIDER.mock.instances[0];

      const fakeError = { name: 'EventError', message: 'Testing' };
      // @ts-expect-error
      instance.onerror?.(fakeError);

      await vi.waitUntil(() => handler.mock.calls.length > 0);

      const [err, data] = handler.mock.calls[0][0];
      expect(err).toBeInstanceOf(Error);
      expect(data).toBeNull();
    });

    test('close() is a no-op when SSE stream is already closed', async () => {
      const LOCAL_CLOSED_SSE_PROVIDER = vi.fn(function (
        this: SSEClientProviderDefinition,
        url: string | URL,
        init?: SSEClientSourceInit,
      ) {
        Object.defineProperties(this, {
          url: {
            value: typeof url === 'string' ? url : url.toString(),
            writable: false,
          },
          withCredentials: {
            value: init?.withCredentials ?? true,
            writable: false,
          },
          readyState: { value: 1, writable: true },
          CLOSED: { value: 2, writable: false },
          CONNECTING: { value: 0, writable: false },
          OPEN: { value: 1, writable: false },
        });

        this.onopen = null;
        this.onmessage = null;
        this.onerror = null;

        this.close = vi.fn(() => {
          // biome-ignore lint/suspicious/noExplicitAny: it's a test
          (this as any).readyState = this.CLOSED;
        });
        this.addEventListener = vi.fn();
        this.removeEventListener = vi.fn();
        this.dispatchEvent = vi.fn().mockReturnValue(true);
      }) as unknown as MockedSSEClientProvider;

      const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const handler = vi.fn();

      const localClient = new RequestClient({
        httpProvider: MOCK_HTTP_PROVIDER,
        sseProvider: LOCAL_CLOSED_SSE_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: DEFAULT_REQUEST_OPTS,
        endpoints: mockSseEndpoints,
        validation: true,
        debug: true,
      });

      // Start the SSE, but DON'T await yet – we want to control when it resolves
      const ssePromise = localClient.sse('/api/my-sse', null, handler);

      // Wait until constructUrl has finished and the SSE provider has actually been constructed
      await vi.waitFor(() => {
        expect(LOCAL_CLOSED_SSE_PROVIDER).toHaveBeenCalledOnce();
      });

      const instance = LOCAL_CLOSED_SSE_PROVIDER.mock.instances[0];
      // Simulate successful open so the inner "opener" promise resolves
      instance.onopen?.(new Event('open'));

      const [err, close] = await ssePromise;

      expect(err).toBeNull();
      expect(LOCAL_CLOSED_SSE_PROVIDER).toHaveBeenCalledOnce();

      // Simulate that the stream has already been closed by the server
      // @ts-expect-error: simulating a state change
      instance.readyState = instance.CLOSED;
      expect(instance.readyState).toBe(instance.CLOSED); // sanity check

      // Call the close function returned from client.sse(...)
      close?.();

      // Since readyState === CLOSED, the underlying connection.close must NOT be called
      expect(instance.close).not.toHaveBeenCalled();

      consoleDebugSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    test('sse() returns timeout error when opening SSE connection exceeds timeout', async () => {
      vi.useFakeTimers();

      const LOCAL_SSE_PROVIDER = vi.fn(function (
        this: SSEClientProviderDefinition,
        url: string | URL,
        init?: SSEClientSourceInit,
      ) {
        Object.defineProperties(this, {
          url: {
            value: typeof url === 'string' ? url : url.toString(),
            writable: false,
          },
          withCredentials: {
            value: init?.withCredentials ?? true,
            writable: false,
          },
          readyState: { value: 0, writable: true }, // CONNECTING
          CLOSED: { value: 2, writable: false },
          CONNECTING: { value: 0, writable: false },
          OPEN: { value: 1, writable: false },
        });

        this.onopen = null;
        this.onmessage = null;
        this.onerror = null;

        this.close = vi.fn();
        this.addEventListener = vi.fn();
        this.removeEventListener = vi.fn();
        this.dispatchEvent = vi.fn().mockReturnValue(true);
      }) as unknown as MockedSSEClientProvider;

      const handler = vi.fn();

      const client = new RequestClient({
        httpProvider: MOCK_HTTP_PROVIDER,
        sseProvider: LOCAL_SSE_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: DEFAULT_REQUEST_OPTS,
        endpoints: mockSseEndpoints,
        validation: true,
        debug: false,
      });

      // Start the SSE, but don't resolve it yet; we want the timeout to fire
      const ssePromise = client.sse('/api/my-sse', null, handler, { timeout: 1000 });

      // Ensure the SSE provider has actually been instantiated (constructUrl finished)
      await vi.waitFor(() => {
        expect(LOCAL_SSE_PROVIDER).toHaveBeenCalledOnce();
      });

      // No onopen / onerror — simulate time passing so the timeout callback runs
      await vi.advanceTimersByTimeAsync(1000);

      const [err, close] = await ssePromise;

      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe('error opening SSE connection');
      // If TimeoutError is exported somewhere, you can check the cause:
      expect(isTimeoutError(err)).toBe(true);
      expect(close).toBeNull();

      // No messages should have been delivered to the handler
      expect(handler).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    test('sse() returns error when new is run', async () => {
      const LOCAL_SSE_PROVIDER = vi.fn(function (
        this: SSEClientProviderDefinition,
        _: string | URL,
        __?: SSEClientSourceInit,
      ) {
        throw new Error('throwing on instantiation');
      }) as unknown as MockedSSEClientProvider;

      const handler = vi.fn();

      const client = new RequestClient({
        httpProvider: MOCK_HTTP_PROVIDER,
        sseProvider: LOCAL_SSE_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: DEFAULT_REQUEST_OPTS,
        endpoints: mockSseEndpoints,
        validation: true,
        debug: false,
      });

      // Start the SSE, do NOT await yet – we want to trigger onerror manually
      const ssePromise = client.sse('/api/my-sse', null, handler);

      // Wait for provider construction so connection.onerror has been wired
      await vi.waitFor(() => {
        expect(LOCAL_SSE_PROVIDER).toHaveBeenCalledOnce();
      });

      const [err, close] = await ssePromise;

      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe('error opening SSE connection');
      expect((err?.cause as Error).message).toBe('error creating new connection for SSE on api/my-sse');

      // Because the error happened during "open", we never get a close function
      expect(close).toBeNull();

      // Because we resolved via the "opening" error branch, the message handler
      // should never be called
      expect(handler).not.toHaveBeenCalled();
    });

    test('sse() returns error when connection.onerror fires before SSE opens', async () => {
      const LOCAL_SSE_PROVIDER = vi.fn(function (
        this: SSEClientProviderDefinition,
        url: string | URL,
        init?: SSEClientSourceInit,
      ) {
        Object.defineProperties(this, {
          url: {
            value: typeof url === 'string' ? url : url.toString(),
            writable: false,
          },
          withCredentials: {
            value: init?.withCredentials ?? true,
            writable: false,
          },
          readyState: { value: 0, writable: true }, // CONNECTING
          CLOSED: { value: 2, writable: false },
          CONNECTING: { value: 0, writable: false },
          OPEN: { value: 1, writable: false },
        });

        this.onopen = null;
        this.onmessage = null;
        this.onerror = null;

        this.close = vi.fn();
        this.addEventListener = vi.fn();
        this.removeEventListener = vi.fn();
        this.dispatchEvent = vi.fn().mockReturnValue(true);
      }) as unknown as MockedSSEClientProvider;

      const handler = vi.fn();

      const client = new RequestClient({
        httpProvider: MOCK_HTTP_PROVIDER,
        sseProvider: LOCAL_SSE_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: DEFAULT_REQUEST_OPTS,
        endpoints: mockSseEndpoints,
        validation: true,
        debug: false,
      });

      // Start the SSE, do NOT await yet – we want to trigger onerror manually
      const ssePromise = client.sse('/api/my-sse', null, handler);

      // Wait for provider construction so connection.onerror has been wired
      await vi.waitFor(() => {
        expect(LOCAL_SSE_PROVIDER).toHaveBeenCalledOnce();
      });

      const instance = LOCAL_SSE_PROVIDER.mock.instances[0];

      // Trigger the connection.onerror handler before onopen has ever fired
      const errorEvent = new Event('error');
      instance.onerror?.(errorEvent);

      const [err, close] = await ssePromise;

      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe('error opening SSE connection');

      // Because the error happened during "open", we never get a close function
      expect(close).toBeNull();

      // Because we resolved via the "opening" error branch, the message handler
      // should never be called
      expect(handler).not.toHaveBeenCalled();
    });

    test('sse opener ignores subsequent resolution attempts (timeout then onopen)', async () => {
      vi.useFakeTimers();

      const LOCAL_SSE_PROVIDER = vi.fn(function (
        this: SSEClientProviderDefinition,
        url: string | URL,
        init?: SSEClientSourceInit,
      ) {
        Object.defineProperties(this, {
          url: {
            value: typeof url === 'string' ? url : url.toString(),
            writable: false,
          },
          withCredentials: {
            value: init?.withCredentials ?? true,
            writable: false,
          },
          readyState: { value: 0, writable: true }, // CONNECTING
          CLOSED: { value: 2, writable: false },
          CONNECTING: { value: 0, writable: false },
          OPEN: { value: 1, writable: false },
        });

        this.onopen = null;
        this.onmessage = null;
        this.onerror = null;

        this.close = vi.fn();
        this.addEventListener = vi.fn();
        this.removeEventListener = vi.fn();
        this.dispatchEvent = vi.fn().mockReturnValue(true);
      }) as unknown as MockedSSEClientProvider;

      const handler = vi.fn();

      const client = new RequestClient({
        httpProvider: MOCK_HTTP_PROVIDER,
        sseProvider: LOCAL_SSE_PROVIDER,
        baseUrl: 'https://api.example.com/base',
        hostname: 'https://api.example.com',
        fetchOpts: DEFAULT_REQUEST_OPTS,
        endpoints: mockSseEndpoints,
        validation: true,
        debug: false,
      });

      // Start the SSE, but don't await yet – we need to manipulate timers and instance
      const ssePromise = client.sse('/api/my-sse', null, handler, { timeout: 1000 });

      // Wait until the SSE provider has actually been constructed
      await vi.waitFor(() => {
        expect(LOCAL_SSE_PROVIDER).toHaveBeenCalledOnce();
      });

      const instance = LOCAL_SSE_PROVIDER.mock.instances[0];
      expect(instance).toBeDefined();

      // 1) Let the timeout fire first -> first call to `done`
      await vi.advanceTimersByTimeAsync(1000);

      // At this point, opener should have resolved with a timeout error
      // but we haven't awaited ssePromise yet.

      // 2) Now simulate a late "open" event -> second call to `done` with resolved === true
      //    This is what hits the `if (resolved) { return; }` branch.
      instance.onopen?.(new Event('open'));

      const [err, close] = await ssePromise;

      // We still see the timeout error result – the late onopen didn't change anything.
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe('error opening SSE connection');
      expect(isTimeoutError(err)).toBe(true);
      expect(close).toBeNull();

      // No messages should have been delivered, since we never successfully opened.
      expect(handler).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});

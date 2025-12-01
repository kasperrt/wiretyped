import { afterEach, beforeEach, describe, expect, it, type MockedFunction, vi } from 'vitest';
import { AbortError, isAbortError } from '../error/abortError';
import { HTTPError } from '../error/httpError';
import { isTimeoutError, TimeoutError } from '../error/timeoutError';
import { unwrapErrorType } from '../error/unwrapErrorType';
import { FetchClient } from './client';
import type { FetchResponse } from './types';

describe('FetchClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  describe('GET', () => {
    it('should make a get request with JSON body', async () => {
      const responseBody = { id: 123 };
      const successResponse = {
        ok: true,
        status: 201,
        json: async () => responseBody,
      } as FetchResponse;

      const mockedFetch = global.fetch as MockedFunction<typeof fetch>;
      mockedFetch.mockResolvedValueOnce(successResponse);

      const client = new FetchClient('https://api.example.com/');

      const [err, response] = await client.get('/data', { timeout: 0 });
      expect(err).toBeNull();
      expect(response).toEqual(successResponse);
      expect(mockedFetch).toHaveBeenCalledTimes(1);
      expect(mockedFetch).toHaveBeenCalledWith('https://api.example.com/data', {
        body: undefined,
        credentials: undefined,
        headers: new Headers(),
        method: 'GET',
        mode: undefined,
      });
    });

    it('should make a get request with JSON body global timeout', async () => {
      const responseBody = { id: 123 };
      const successResponse = {
        ok: true,
        status: 201,
        json: async () => responseBody,
      } as Response;

      const mockedFetch = global.fetch as MockedFunction<typeof fetch>;
      mockedFetch.mockResolvedValueOnce(successResponse);

      const client = new FetchClient('https://api.example.com', { timeout: 0 });

      const [err, response] = await client.get('/data', {});
      expect(err).toBeNull();
      expect(response).toEqual(successResponse);
      expect(mockedFetch).toHaveBeenCalledTimes(1);
      expect(mockedFetch).toHaveBeenCalledWith('https://api.example.com/data', {
        body: undefined,
        credentials: undefined,
        headers: new Headers(),
        method: 'GET',
        mode: undefined,
      });
    });

    it('should make a get request with JSON body no timeout', async () => {
      const responseBody = { id: 123 };
      const successResponse = {
        ok: true,
        status: 201,
        json: async () => responseBody,
      } as Response;

      const mockedFetch = global.fetch as MockedFunction<typeof fetch>;
      mockedFetch.mockResolvedValueOnce(successResponse);

      const client = new FetchClient('https://api.example.com', { timeout: false });

      const [err, response] = await client.get('/data', { timeout: 0 });
      expect(err).toBeNull();
      expect(response).toEqual(successResponse);
      expect(mockedFetch).toHaveBeenCalledTimes(1);
      expect(mockedFetch).toHaveBeenCalledWith('https://api.example.com/data', {
        body: undefined,
        credentials: undefined,
        headers: new Headers(),
        method: 'GET',
        mode: undefined,
      });
    });
  });

  describe('PUT', () => {
    it('should make a put request with JSON body', async () => {
      const responseBody = { id: 123 };
      const successResponse = {
        ok: true,
        status: 201,
        json: async () => responseBody,
      } as FetchResponse;

      const mockedFetch = global.fetch as MockedFunction<typeof fetch>;
      mockedFetch.mockResolvedValueOnce(successResponse);

      const client = new FetchClient('https://api.example.com', {});
      const body = { name: 'Test', value: 42 };

      const [err, response] = await client.put('/data', JSON.stringify(body), {
        timeout: 0,
      });
      expect(err).toBeNull();
      expect(response).toEqual(successResponse);
      expect(mockedFetch).toHaveBeenCalledTimes(1);
      expect(mockedFetch).toHaveBeenCalledWith('https://api.example.com/data', {
        body: JSON.stringify(body),
        credentials: undefined,
        headers: new Headers(),
        method: 'PUT',
        mode: undefined,
      });
    });
  });

  describe('PATCH', () => {
    it('should make a patch request with JSON body', async () => {
      const responseBody = { id: 123 };
      const successResponse = {
        ok: true,
        status: 201,
        json: async () => responseBody,
      } as FetchResponse;

      const mockedFetch = global.fetch as MockedFunction<typeof fetch>;
      mockedFetch.mockResolvedValueOnce(successResponse);

      const client = new FetchClient('https://api.example.com', {});
      const body = { name: 'Test', value: 42 };

      const [err, response] = await client.patch('/data', JSON.stringify(body), { timeout: 0 });
      expect(err).toBeNull();
      expect(response).toEqual(successResponse);
      expect(mockedFetch).toHaveBeenCalledTimes(1);
      expect(mockedFetch).toHaveBeenCalledWith('https://api.example.com/data', {
        body: JSON.stringify(body),
        credentials: undefined,
        headers: new Headers(),
        method: 'PATCH',
        mode: undefined,
      });
    });
  });

  describe('POST', () => {
    it('should make a post request with JSON body', async () => {
      const responseBody = { id: 123 };
      const successResponse = {
        ok: true,
        status: 201,
        json: async () => responseBody,
      } as FetchResponse;

      const mockedFetch = global.fetch as MockedFunction<typeof fetch>;
      mockedFetch.mockResolvedValueOnce(successResponse);

      const client = new FetchClient('https://api.example.com', {});
      const body = { name: 'Test', value: 42 };

      const [err, response] = await client.post('/data', JSON.stringify(body), {
        timeout: 0,
      });
      expect(err).toBeNull();
      expect(response).toEqual(successResponse);
      expect(mockedFetch).toHaveBeenCalledTimes(1);
      expect(mockedFetch).toHaveBeenCalledWith('https://api.example.com/data', {
        body: JSON.stringify(body),
        credentials: undefined,
        headers: new Headers(),
        method: 'POST',
        mode: undefined,
      });
    });
  });

  describe('DELETE', () => {
    it('should make a delete request', async () => {
      const responseBody = { id: 123 };
      const successResponse = {
        ok: true,
        status: 201,
        json: async () => responseBody,
      } as FetchResponse;

      const mockedFetch = global.fetch as MockedFunction<typeof fetch>;
      mockedFetch.mockResolvedValueOnce(successResponse);

      const client = new FetchClient('https://api.example.com', {});

      const [err, response] = await client.delete('/data', { timeout: 0 });
      expect(err).toBeNull();
      expect(response).toEqual(successResponse);
      expect(mockedFetch).toHaveBeenCalledTimes(1);
      expect(mockedFetch).toHaveBeenCalledWith('https://api.example.com/data', {
        credentials: undefined,
        headers: new Headers(),
        method: 'DELETE',
        body: undefined,
        mode: undefined,
      });
    });
  });

  describe('ERROR', () => {
    it('should return http-error if error', async () => {
      const responseBody = { id: 123 };
      const errorResponse = {
        ok: false,
        status: 401,
        json: async () => responseBody,
      } as FetchResponse;

      const mockedFetch = global.fetch as MockedFunction<typeof fetch>;
      mockedFetch.mockResolvedValueOnce(errorResponse);

      const client = new FetchClient('https://api.example.com', {});
      const body = { name: 'Test', value: 42 };

      const [err, response] = await client.post('/data', JSON.stringify(body), {
        timeout: 0,
      });
      expect(err).toBeInstanceOf(HTTPError);
      expect((err as HTTPError).response.status).toBe(401);
      expect(response).toEqual(null);
      expect(mockedFetch).toHaveBeenCalledTimes(1);
      expect(mockedFetch).toHaveBeenCalledWith('https://api.example.com/data', {
        body: JSON.stringify(body),
        credentials: undefined,
        headers: new Headers(),
        method: 'POST',
        mode: undefined,
      });
    });

    it('should return error if error', async () => {
      const errorResponse = new Error('test-error');

      const mockedFetch = global.fetch as MockedFunction<typeof fetch>;
      mockedFetch.mockRejectedValue(errorResponse);

      const client = new FetchClient('https://api.example.com', {});
      const body = { name: 'Test', value: 42 };

      const [err, response] = await client.post('/data', JSON.stringify(body), {
        timeout: 0,
        retry: { limit: 0 },
      });
      expect(err).toBeInstanceOf(Error);
      expect(response).toEqual(null);
      expect(mockedFetch).toHaveBeenCalledTimes(1);
      expect(mockedFetch).toHaveBeenCalledWith('https://api.example.com/data', {
        body: JSON.stringify(body),
        credentials: undefined,
        headers: new Headers(),
        method: 'POST',
        mode: undefined,
      });
    });
  });

  describe('ABORTS', () => {
    it('aborts the request after the configured timeout and surfaces a timeout error with no retries', async () => {
      const mockedFetch = global.fetch as MockedFunction<typeof fetch>;

      mockedFetch.mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
        const signal = init?.signal as AbortSignal | undefined;

        return new Promise<Response>((_resolve, reject) => {
          // If already aborted, reject immediately
          if (signal?.aborted) {
            reject(signal.reason);
            return;
          }

          // Otherwise reject when the signal aborts
          signal?.addEventListener(
            'abort',
            () => {
              reject(signal.reason);
            },
            { once: true },
          );
        });
      });

      // Global client timeout not set, so we pass it per-call
      const client = new FetchClient('https://api.example.com', {});

      const promise = client.get('/data', {
        timeout: 100,
        retry: { limit: 0 },
      });

      // Ensure fetch has been called once
      expect(mockedFetch).toHaveBeenCalledTimes(1);
      const [, init] = mockedFetch.mock.calls[0];
      const signal = (init as RequestInit).signal as AbortSignal;

      expect(signal).toBeDefined();
      expect(signal.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(105);
      await Promise.resolve();

      expect(signal.aborted).toBe(true);
      expect(signal.reason).toBeInstanceOf(TimeoutError);
      expect((signal.reason as TimeoutError).message).toBe('error request timed out after 100ms');

      const [err, res] = await promise;

      expect(res).toBeNull();
      expect(err).not.toBeNull();
      expect(isTimeoutError(err as Error)).toBe(true);
    });

    it('aborts the request after the configured timeout and surfaces a timeout error with default retries', async () => {
      const mockedFetch = global.fetch as MockedFunction<typeof fetch>;

      mockedFetch.mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
        const signal = init?.signal as AbortSignal | undefined;

        return new Promise<Response>((_resolve, reject) => {
          // If already aborted, reject immediately
          if (signal?.aborted) {
            reject(signal.reason);
            return;
          }

          // Otherwise reject when the signal aborts
          signal?.addEventListener(
            'abort',
            () => {
              reject(signal.reason);
            },
            { once: true },
          );
        });
      });

      // Global client timeout not set, so we pass it per-call
      const client = new FetchClient('https://api.example.com', {});

      const promise = client.get('/data', { timeout: 100 });

      // Ensure fetch has been called once
      expect(mockedFetch).toHaveBeenCalledTimes(1);
      const [, init] = mockedFetch.mock.calls[0];
      const signal = (init as RequestInit).signal as AbortSignal;

      expect(signal).toBeDefined();
      expect(signal.aborted).toBe(false);

      // Wait 3005 since we have 2 retries (3 attempts), each with a 1000 second wait
      await vi.advanceTimersByTimeAsync(3005);
      await Promise.resolve();

      expect(signal.aborted).toBe(true);
      expect(signal.reason).toBeInstanceOf(TimeoutError);
      expect((signal.reason as TimeoutError).message).toBe('error request timed out after 100ms');

      const [err, res] = await promise;

      expect(res).toBeNull();
      expect(err).not.toBeNull();
      expect(isTimeoutError(err as Error)).toBe(true);
    });

    it('aborts the request after the configured timeout and surfaces a timeout error with locally overridden retries', async () => {
      const mockedFetch = global.fetch as MockedFunction<typeof fetch>;

      mockedFetch.mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
        const signal = init?.signal as AbortSignal | undefined;

        return new Promise<Response>((_resolve, reject) => {
          // If already aborted, reject immediately
          if (signal?.aborted) {
            reject(signal.reason);
            return;
          }

          // Otherwise reject when the signal aborts
          signal?.addEventListener(
            'abort',
            () => {
              reject(signal.reason);
            },
            { once: true },
          );
        });
      });

      // Global client timeout not set, so we pass it per-call
      const client = new FetchClient('https://api.example.com', {});

      const promise = client.get('/data', {
        timeout: 100,
        retry: { limit: 5, timeout: 100 },
      });

      // Ensure fetch has been called once
      expect(mockedFetch).toHaveBeenCalledTimes(1);
      const [, init] = mockedFetch.mock.calls[0];
      const signal = (init as RequestInit).signal as AbortSignal;

      expect(signal).toBeDefined();
      expect(signal.aborted).toBe(false);

      // Wait 3005 since we have 2 retries (3 attempts), each with a 1000 second wait
      await vi.advanceTimersByTimeAsync(1205);
      await Promise.resolve();

      expect(signal.aborted).toBe(true);
      expect(signal.reason).toBeInstanceOf(TimeoutError);
      expect((signal.reason as TimeoutError).message).toBe('error request timed out after 100ms');

      const [err, res] = await promise;

      expect(res).toBeNull();
      expect(err).not.toBeNull();
      expect(isTimeoutError(err as Error)).toBe(true);
    });

    it('aborts the request after the configured timeout and surfaces a timeout error with global overridden retries', async () => {
      const mockedFetch = global.fetch as MockedFunction<typeof fetch>;

      mockedFetch.mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
        const signal = init?.signal as AbortSignal | undefined;

        return new Promise<Response>((_resolve, reject) => {
          // If already aborted, reject immediately
          if (signal?.aborted) {
            reject(signal.reason);
            return;
          }

          // Otherwise reject when the signal aborts
          signal?.addEventListener(
            'abort',
            () => {
              reject(signal.reason);
            },
            { once: true },
          );
        });
      });

      // Global client timeout set
      const client = new FetchClient('https://api.example.com', {
        retry: { limit: 5, timeout: 100 },
      });

      const promise = client.get('/data', { timeout: 100 });

      // Ensure fetch has been called once
      expect(mockedFetch).toHaveBeenCalledTimes(1);
      const [, init] = mockedFetch.mock.calls[0];
      const signal = (init as RequestInit).signal as AbortSignal;

      expect(signal).toBeDefined();
      expect(signal.aborted).toBe(false);

      // Wait 3005 since we have 2 retries (3 attempts), each with a 1000 second wait
      await vi.advanceTimersByTimeAsync(1205);
      await Promise.resolve();

      expect(signal.aborted).toBe(true);
      expect(signal.reason).toBeInstanceOf(TimeoutError);
      expect((signal.reason as TimeoutError).message).toBe('error request timed out after 100ms');

      const [err, res] = await promise;

      expect(res).toBeNull();
      expect(err).not.toBeNull();
      expect(isTimeoutError(err as Error)).toBe(true);
    });

    it('aborts the request after the configured timeout and surfaces a timeout error with local retries taking presedence', async () => {
      const mockedFetch = global.fetch as MockedFunction<typeof fetch>;

      mockedFetch.mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
        const signal = init?.signal as AbortSignal | undefined;

        return new Promise<Response>((_resolve, reject) => {
          // If already aborted, reject immediately
          if (signal?.aborted) {
            reject(signal.reason);
            return;
          }

          // Otherwise reject when the signal aborts
          signal?.addEventListener(
            'abort',
            () => {
              reject(signal.reason);
            },
            { once: true },
          );
        });
      });

      const client = new FetchClient('https://api.example.com', {
        retry: { limit: 5, timeout: 100 },
      });

      const promise = client.get('/data', {
        timeout: 100,
        retry: { limit: 2, timeout: 100 },
      });

      // Ensure fetch has been called once
      expect(mockedFetch).toHaveBeenCalledTimes(1);
      const [, init] = mockedFetch.mock.calls[0];
      const signal = (init as RequestInit).signal as AbortSignal;

      expect(signal).toBeDefined();
      expect(signal.aborted).toBe(false);

      // Wait for (local) retries
      await vi.advanceTimersByTimeAsync(505);
      await Promise.resolve();

      expect(signal.aborted).toBe(true);
      expect(signal.reason).toBeInstanceOf(TimeoutError);
      expect((signal.reason as TimeoutError).message).toBe('error request timed out after 100ms');

      const [err, res] = await promise;

      expect(res).toBeNull();
      expect(err).not.toBeNull();
      expect(isTimeoutError(err as Error)).toBe(true);
    });

    it('aborts the request when an external abort signal is triggered and does not retry', async () => {
      const mockedFetch = global.fetch as MockedFunction<typeof fetch>;

      mockedFetch.mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
        const signal = init?.signal as AbortSignal | undefined;

        return new Promise<Response>((_resolve, reject) => {
          // If already aborted, reject immediately
          if (signal?.aborted) {
            reject(signal.reason);
            return;
          }

          // Otherwise reject when the signal aborts
          signal?.addEventListener(
            'abort',
            () => {
              reject(signal.reason);
            },
            { once: true },
          );
        });
      });

      const externalController = new AbortController();

      const client = new FetchClient('https://api.example.com', {});

      const promise = client.get('/data', {
        // Use a timeout so we exercise mergeSignals (external + timeout)
        timeout: 1000,
        retry: { limit: 3, timeout: 100 },
        signal: externalController.signal,
      });

      expect(mockedFetch).toHaveBeenCalledTimes(1);
      const [, init] = mockedFetch.mock.calls[0];
      const mergedSignal = (init as RequestInit).signal as AbortSignal;

      expect(mergedSignal).toBeDefined();
      expect(mergedSignal.aborted).toBe(false);
      expect(externalController.signal.aborted).toBe(false);

      const abortError = new AbortError('external abort');
      externalController.abort(abortError);

      // External signal should now be aborted
      expect(externalController.signal.aborted).toBe(true);

      // The merged signal should also be aborted with the same reason
      expect(mergedSignal.aborted).toBe(true);
      expect(mergedSignal.reason).toBe(abortError);

      const [err, res] = await promise;

      expect(res).toBeNull();
      expect(isAbortError(err)).toBe(true);
      const abortErr = unwrapErrorType(AbortError, err);
      expect(abortErr?.message).toBe('external abort');

      // Because this is treated as an abort error, no retries should have occurred
      expect(mockedFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('RETRIES', () => {
    it('retries the request when the response status is configured as a retry status code', async () => {
      const errorResponse = {
        ok: false,
        status: 500,
        json: async () => ({ message: 'server error' }),
      } as FetchResponse;

      const successResponse = {
        ok: true,
        status: 200,
        json: async () => ({ id: 1 }),
      } as FetchResponse;

      const mockedFetch = global.fetch as MockedFunction<typeof fetch>;
      mockedFetch.mockResolvedValueOnce(errorResponse).mockResolvedValueOnce(successResponse);

      const client = new FetchClient('https://api.example.com', {});

      const promise = client.get('/data', {
        timeout: 0,
        retry: {
          limit: 3,
          timeout: 10,
          statusCodes: [500],
        },
      });

      // First attempt happens immediately
      expect(mockedFetch).toHaveBeenCalledTimes(1);

      // Advance time enough for the retry delay to elapse
      await vi.advanceTimersByTimeAsync(15);
      await Promise.resolve();

      const [err, res] = await promise;

      expect(err).toBeNull();
      expect(res).toEqual(successResponse);
      expect(mockedFetch).toHaveBeenCalledTimes(2);
      expect(mockedFetch).toHaveBeenNthCalledWith(1, 'https://api.example.com/data', {
        body: undefined,
        credentials: undefined,
        headers: new Headers(),
        method: 'GET',
        mode: undefined,
      });
      expect(mockedFetch).toHaveBeenNthCalledWith(2, 'https://api.example.com/data', {
        body: undefined,
        credentials: undefined,
        headers: new Headers(),
        method: 'GET',
        mode: undefined,
      });
    });

    it('retries the request with simple retry number instead of object', async () => {
      const errorResponse = {
        ok: false,
        status: 500,
        json: async () => ({ message: 'server error' }),
      } as Response;

      const successResponse = {
        ok: true,
        status: 200,
        json: async () => ({ id: 1 }),
      } as Response;

      const mockedFetch = global.fetch as MockedFunction<typeof fetch>;
      mockedFetch.mockResolvedValueOnce(errorResponse).mockResolvedValueOnce(successResponse);

      const client = new FetchClient('https://api.example.com', {});

      const promise = client.get('/data', {
        timeout: 0,
        retry: 3,
      });

      // First attempt happens immediately
      expect(mockedFetch).toHaveBeenCalledTimes(1);

      // Advance time enough for the retry delay to elapse
      await vi.advanceTimersByTimeAsync(3005);
      await Promise.resolve();

      const [err, res] = await promise;

      expect(err).toBeNull();
      expect(res).toEqual(successResponse);
      expect(mockedFetch).toHaveBeenCalledTimes(2);
      expect(mockedFetch).toHaveBeenNthCalledWith(1, 'https://api.example.com/data', {
        body: undefined,
        credentials: undefined,
        headers: new Headers(),
        method: 'GET',
        mode: undefined,
      });
      expect(mockedFetch).toHaveBeenNthCalledWith(2, 'https://api.example.com/data', {
        body: undefined,
        credentials: undefined,
        headers: new Headers(),
        method: 'GET',
        mode: undefined,
      });
    });

    it('does not retry when the response status is configured as an ignoreStatusCode', async () => {
      const errorResponse = {
        ok: false,
        status: 503,
        json: async () => ({ message: 'maintenance' }),
      } as FetchResponse;

      const mockedFetch = global.fetch as MockedFunction<typeof fetch>;
      mockedFetch.mockResolvedValue(errorResponse);

      const client = new FetchClient('https://api.example.com', {});

      const [err, res] = await client.get('/data', {
        timeout: 0,
        retry: {
          limit: 5,
          timeout: 10,
          ignoreStatusCodes: [503],
        },
      });

      expect(res).toBeNull();
      expect(err).toBeInstanceOf(HTTPError);
      expect((err as HTTPError).response.status).toBe(503);
      // Should not retry, since 503 is explicitly in ignoreStatusCodes
      expect(mockedFetch).toHaveBeenCalledTimes(1);
    });

    it('does not retry when the response status is configured as an ignoreStatusCode, overriding statusCodes object', async () => {
      const errorResponse = {
        ok: false,
        status: 503,
        json: async () => ({ message: 'maintenance' }),
      } as FetchResponse;

      const mockedFetch = global.fetch as MockedFunction<typeof fetch>;
      mockedFetch.mockResolvedValue(errorResponse);

      const client = new FetchClient('https://api.example.com', {});

      const [err, res] = await client.get('/data', {
        timeout: 0,
        retry: {
          limit: 5,
          timeout: 10,
          statusCodes: [503],
          // @ts-expect-error
          ignoreStatusCodes: [503],
        },
      });

      expect(res).toBeNull();
      expect(err).toBeInstanceOf(HTTPError);
      expect((err as HTTPError).response.status).toBe(503);
      // Should not retry, since 503 is explicitly in ignoreStatusCodes
      expect(mockedFetch).toHaveBeenCalledTimes(1);
    });

    it('does not retry when the response status is not in the configured retry status codes', async () => {
      const errorResponse = {
        ok: false,
        status: 404,
        json: async () => ({ message: 'not found' }),
      } as FetchResponse;

      const mockedFetch = global.fetch as MockedFunction<typeof fetch>;
      mockedFetch.mockResolvedValue(errorResponse);

      const client = new FetchClient('https://api.example.com', {});

      const [err, res] = await client.get('/data', {
        timeout: 0,
        retry: {
          limit: 3,
          timeout: 10,
          statusCodes: [500, 502],
        },
      });

      expect(res).toBeNull();
      expect(err).toBeInstanceOf(HTTPError);
      expect((err as HTTPError).response.status).toBe(404);
      // 404 is neither retryable nor in ignoreStatusCodes ⇒ no retries
      expect(mockedFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('MERGE SIGNALS', () => {
    it('aborts merged signal with AbortError fallback when merging an already-aborted signal without reason', async () => {
      const mockedFetch = global.fetch as MockedFunction<typeof fetch>;

      mockedFetch.mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
        const signal = init?.signal as AbortSignal | undefined;

        // We expect mergeSignals to have created a merged controller whose signal
        // is already aborted with the fallback AbortError.
        expect(signal).toBeDefined();
        expect(signal?.aborted).toBe(true);

        const reason = signal?.reason as AbortError;
        expect(reason).toBeInstanceOf(AbortError);
        expect(reason.message).toBe('error signal triggered with unknown reason');

        // Reject so the client surfaces an error tuple
        return Promise.reject(reason);
      });

      // Fake AbortSignal-like object, already aborted, *no* "reason" property
      const fakeSignal = {
        aborted: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as AbortSignal;

      const client = new FetchClient('https://api.example.com', {});

      const [err, res] = await client.get('/data', {
        // Non-zero timeout to force creation of a second signal (timeoutSignal)
        // so mergeSignals() actually builds the merged controller and hits
        // the `signal.aborted` path.
        timeout: 1000,
        retry: { limit: 0 },
        signal: fakeSignal,
      });

      expect(res).toBeNull();
      // We don't really care about the outer error type here; the important
      // part is that the merged signal used the fallback AbortError with the
      // expected message, which we asserted inside the fetch mock.
      expect(err).toBeInstanceOf(Error);
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, type MockedFunction, vi } from 'vitest';
import { AbortError } from '../error/abortError';
import { HTTPError } from '../error/httpError';
import type { FetchResponse } from '../types/request';
import { FetchClient } from './client';

describe('FetchClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('config', () => {
    it('merges headers and updates defaults', async () => {
      const responseBody = { id: 1 };
      const successResponse = {
        ok: true,
        status: 200,
        json: async () => responseBody,
      } as FetchResponse;

      const mockedFetch = global.fetch as MockedFunction<typeof fetch>;
      mockedFetch.mockResolvedValueOnce(successResponse);

      const client = new FetchClient('https://api.example.com/', {
        headers: new Headers({ 'X-Base': '1' }),
      });

      client.config({
        headers: new Headers({ 'X-Extra': '2' }),
        credentials: 'include',
        mode: 'cors',
      });

      const [err, response] = await client.get('/data', {});
      expect(err).toBeNull();
      expect(response).toEqual(successResponse);

      expect(mockedFetch).toHaveBeenCalledWith('https://api.example.com/data', {
        body: undefined,
        credentials: 'include',
        headers: expect.any(Headers),
        method: 'GET',
        mode: 'cors',
      });

      const headers = mockedFetch.mock.calls[0][1]?.headers as Headers;
      expect(headers.get('x-base')).toBe('1');
      expect(headers.get('x-extra')).toBe('2');
    });

    it('allows removing headers via config', async () => {
      const successResponse = {
        ok: true,
        status: 200,
      } as FetchResponse;

      const mockedFetch = global.fetch as MockedFunction<typeof fetch>;
      mockedFetch.mockResolvedValueOnce(successResponse);

      const client = new FetchClient('https://api.example.com/', {
        headers: { 'X-Base': '1' },
      });

      client.config({
        headers: { 'X-Extra': '2' },
      });

      client.config({
        headers: { 'X-Base': null, 'X-Extra': '3' },
      });

      const [err, response] = await client.get('/data', {});
      expect(err).toBeNull();
      expect(response).toEqual(successResponse);

      const headers = mockedFetch.mock.calls[0][1]?.headers as Headers;
      expect(headers.get('x-extra')).toBe('3');
      expect(headers.get('x-base')).toBeNull();
    });
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

    it('should make a get request with JSON body global timeout', async () => {
      const responseBody = { id: 123 };
      const successResponse = {
        ok: true,
        status: 201,
        json: async () => responseBody,
      } as Response;

      const mockedFetch = global.fetch as MockedFunction<typeof fetch>;
      mockedFetch.mockResolvedValueOnce(successResponse);

      const client = new FetchClient('https://api.example.com');

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

      const client = new FetchClient('https://api.example.com', {});

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

      const [err, response] = await client.put('/data', {
        body: JSON.stringify(body),
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

      const [err, response] = await client.patch('/data', {
        body: JSON.stringify(body),
      });
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

      const [err, response] = await client.post('/data', {
        body: JSON.stringify(body),
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

      const [err, response] = await client.delete('/data', {});
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

      const [err, response] = await client.post('/data', {
        body: JSON.stringify(body),
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

      const [err, response] = await client.post('/data', {
        body: JSON.stringify(body),
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

  describe('ABORT SIGNAL', () => {
    it('forwards the provided abort signal to fetch', async () => {
      const mockedFetch = global.fetch as MockedFunction<typeof fetch>;

      mockedFetch.mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
        expect(init?.signal).toBeDefined();
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({}),
        } as FetchResponse);
      });

      const controller = new AbortController();
      const client = new FetchClient('https://api.example.com', {});

      const [err] = await client.get('/data', { signal: controller.signal });

      expect(err).toBeNull();
      expect(mockedFetch).toHaveBeenCalledTimes(1);
      const [, init] = mockedFetch.mock.calls[0];
      expect((init as RequestInit).signal).toBe(controller.signal);
    });

    it('surfaces fetch rejections when a provided signal aborts before the request', async () => {
      const mockedFetch = global.fetch as MockedFunction<typeof fetch>;

      mockedFetch.mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
        const signal = init?.signal as AbortSignal | undefined;
        if (signal?.aborted) {
          return Promise.reject(signal.reason);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({}),
        } as FetchResponse);
      });

      const controller = new AbortController();
      controller.abort(new AbortError('external abort'));

      const client = new FetchClient('https://api.example.com', {});
      const [err, res] = await client.get('/data', { signal: controller.signal });

      expect(res).toBeNull();
      expect(err).toBeInstanceOf(Error);
      expect(mockedFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('ERROR HANDLING', () => {
    it('wraps fetch rejections', async () => {
      const mockedFetch = global.fetch as MockedFunction<typeof fetch>;
      const fetchError = new TypeError('network');
      mockedFetch.mockRejectedValue(fetchError);

      const client = new FetchClient('https://api.example.com', {});
      const [err, res] = await client.get('/data', {});

      expect(res).toBeNull();
      expect(err).toBeInstanceOf(Error);
      expect(err).toStrictEqual(new Error('error wrapping GET request in fetchClient', { cause: fetchError }));
      expect(mockedFetch).toHaveBeenCalledTimes(1);
    });

    it('surfaces the first response', async () => {
      const errorResponse = {
        ok: false,
        status: 500,
        json: async () => ({ message: 'server error' }),
      } as FetchResponse;

      const mockedFetch = global.fetch as MockedFunction<typeof fetch>;
      mockedFetch.mockResolvedValue(errorResponse);

      const client = new FetchClient('https://api.example.com', {});

      const [err, res] = await client.get('/data', {});

      expect(res).toBeNull();
      expect(err).toBeInstanceOf(HTTPError);
      expect((err as HTTPError).response.status).toBe(500);
      expect(mockedFetch).toHaveBeenCalledTimes(1);
    });
  });
});

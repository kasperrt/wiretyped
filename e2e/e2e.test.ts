import { EventSource } from 'eventsource';
import { afterAll, assert, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  getHttpError,
  getRetryExhaustedError,
  getRetrySuppressedError,
  isHttpError,
  isValidationError,
  RequestClient,
  type RequestDefinitions,
} from 'wiretyped';
import { z } from 'zod';
import { type E2EServer, startE2EServer } from './server.ts';

const payloadSchema = z.object({ test: z.literal('yes') });

const endpoints = {
  '/ok/{integration}': {
    get: {
      $search: z.object({
        q: z.string(),
      }),
      $path: z.object({
        integration: z.enum(['slack', 'github']),
      }),
      response: z.object({
        success: z.boolean(),
      }),
    },
    download: {
      $search: z.object({
        q: z.string(),
      }),
      $path: z.object({
        integration: z.enum(['slack', 'github']),
      }),
      response: z.instanceof(Blob),
    },
    delete: {
      $search: z.object({
        q: z.string(),
      }),
      $path: z.object({
        integration: z.enum(['slack', 'github']),
      }),
      response: z.object({
        success: z.boolean(),
      }),
    },
    post: {
      $search: z.object({
        q: z.string(),
      }),
      $path: z.object({
        integration: z.enum(['slack', 'github']),
      }),
      request: payloadSchema,
      response: z.object({
        success: z.boolean(),
        received: payloadSchema,
      }),
    },
    put: {
      $search: z.object({
        q: z.string(),
      }),
      $path: z.object({
        integration: z.enum(['slack', 'github']),
      }),
      request: payloadSchema,
      response: z.object({
        success: z.boolean(),
        received: payloadSchema,
      }),
    },
    patch: {
      $search: z.object({
        q: z.string(),
      }),
      $path: z.object({
        integration: z.enum(['slack', 'github']),
      }),
      request: payloadSchema,
      response: z.object({
        success: z.boolean(),
        received: payloadSchema,
      }),
    },
  },
  '/flaky': {
    get: {
      $search: z.object({ failTimes: z.number() }),
      response: z.object({ ok: z.boolean(), attempt: z.number() }),
    },
  },
  '/bad': {
    get: {
      // Backend will not respond with string here
      response: z.string(),
    },
  },
  '/sse': {
    sse: {
      $search: z.object({
        error: z.enum(['never', 'sometimes']),
      }),
      response: z.object({ i: z.number() }),
    },
  },
} satisfies RequestDefinitions;

let server: E2EServer;
let client: RequestClient<typeof endpoints>;

beforeAll(async () => {
  const [err, srv] = await startE2EServer(endpoints);
  assert(err === null, 'error is not null on server-start, cannot continue');

  server = srv;

  client = new RequestClient({
    baseUrl: server.url,
    hostname: '127.0.0.1',
    endpoints,
    validation: true,
    sseProvider: EventSource,
    fetchOpts: {
      headers: new Headers([['x-type', 'e2e-global']]),
    },
  });
});

beforeEach(() => {
  server.reset();
});

afterAll(async () => {
  const err = await server.close();
  expect(err).toBeNull();
});

describe('wiretyped e2e', () => {
  test('GET /ok returns data and no error', async () => {
    const [err, data] = await client.get(
      '/ok/{integration}',
      {
        $path: { integration: 'slack' },
        $search: { q: 'test' },
      },
      {
        headers: new Headers([['x-client', 'e2e-scoped']]),
      },
    );
    expect(err).toBeNull();
    expect(data?.success).toBe(true);
  });

  test('GET /bad returns data, but errors on validation', async () => {
    const [err, data] = await client.get('/bad', null);

    expect(data).toBeNull();
    expect(isValidationError(err)).toBe(true);
  });

  test('GET /bad returns data, but errors on validation', async () => {
    const [err, data] = await client.get('/bad', null, { validate: false });

    expect(err).toBeNull();
    expect(isValidationError(err)).toBe(false);

    // If we turn off validation, we still get the data
    expect(data).toStrictEqual({
      data: 'wrong-format',
      etc: 'test',
    });
  });

  test('caching reduces server hits (if enabled)', async () => {
    // If cache is per-request, pass options here.
    await client.get(
      '/ok/{integration}',
      {
        $path: { integration: 'slack' },
        $search: { q: 'test' },
      },
      {
        headers: new Headers([['x-client', 'e2e-scoped']]),
      },
    );
    await client.get(
      '/ok/{integration}',
      {
        $path: { integration: 'slack' },
        $search: { q: 'test' },
      },
      {
        headers: new Headers([['x-client', 'e2e-scoped']]),
      },
    );

    const counts = server.getCounts();
    expect(counts['GET /ok/slack']).toBeLessThanOrEqual(2);
  });

  test('POST /ok validates payload and echoes mock response', async () => {
    const [err, data] = await client.post(
      '/ok/{integration}',
      { $path: { integration: 'github' }, $search: { q: 'test' } },
      { test: 'yes' },
      {
        headers: new Headers([['x-client', 'e2e-scoped']]),
      },
    );

    expect(err).toBeNull();
    expect(data?.success).toBe(true);
    expect(data?.received).toEqual({ test: 'yes' });
  });

  test('PUT /ok returns echoed payload', async () => {
    const [err, data] = await client.put(
      '/ok/{integration}',
      { $path: { integration: 'github' }, $search: { q: 'test' } },
      { test: 'yes' },
      {
        headers: new Headers([['x-client', 'e2e-scoped']]),
      },
    );

    expect(err).toBeNull();
    expect(data?.success).toBe(true);
    expect(data?.received).toEqual({ test: 'yes' });
  });

  test('PATCH /ok returns echoed payload', async () => {
    const [err, data] = await client.patch(
      '/ok/{integration}',
      { $path: { integration: 'github' }, $search: { q: 'test' } },
      { test: 'yes' },
      {
        headers: new Headers([['x-client', 'e2e-scoped']]),
      },
    );

    expect(err).toBeNull();
    expect(data?.success).toBe(true);
    expect(data?.received).toEqual({ test: 'yes' });
  });

  test('DOWNLOAD /ok returns blob payload', async () => {
    const [err, blob] = await client.download(
      '/ok/{integration}',
      {
        $path: { integration: 'github' },
        $search: { q: 'file' },
      },
      {
        headers: new Headers([['x-client', 'e2e-scoped']]),
      },
    );

    expect(err).toBeNull();
    expect(blob).toBeInstanceOf(Blob);
    expect(await blob?.text()).toBe('{"success":true}');
  });

  test('Ignoring validation will allow to send non-approved schemas with e2e server rejecting to prove it', async () => {
    const [err] = await client.get(
      '/ok/{integration}',
      // @ts-expect-error
      { $path: { integration: 'not-allowed' }, $search: { q: 'bad' } },
      { validate: false, headers: new Headers([['x-client', 'e2e-scoped']]) },
    );

    expect(isHttpError(err)).toBe(true);
    expect(isValidationError(err)).toBe(false);
    expect(getHttpError(err)?.response?.status).toBe(400);
  });

  test('GET /flaky ok after 5 retries (supplied)', async () => {
    const [err, data] = await client.get(
      '/flaky',
      { $search: { failTimes: 4 } },
      { retry: { limit: 4, timeout: 1 }, headers: new Headers([['x-client', 'e2e-scoped']]) },
    );

    expect(err).toBeNull();
    expect(data).toStrictEqual({
      ok: true,
      attempt: 5,
    });

    const counts = server.getCounts();
    expect(counts['GET /flaky']).toBe(5);
  });

  test('GET /flaky error after 5 retries (supplied 5)', async () => {
    const [err, data] = await client.get(
      '/flaky',
      { $search: { failTimes: 5 } },
      {
        retry: { limit: 4, timeout: 1, statusCodes: [500, 501, 502, 503, 504, 505] },
        headers: new Headers([['x-client', 'e2e-scoped']]),
      },
    );

    console.log(getHttpError(err)?.response.status);
    expect(getRetryExhaustedError(err)?.attempts).toBe(5);
    expect(data).toBeNull();

    const counts = server.getCounts();
    expect(counts['GET /flaky']).toBe(5);
  });

  test('GET /flaky error after 1 retries with suppressed due to ignored statuscode', async () => {
    const [err, data] = await client.get(
      '/flaky',
      { $search: { failTimes: 5 } },
      { retry: { limit: 4, timeout: 1, ignoreStatusCodes: [500] }, headers: new Headers([['x-client', 'e2e-scoped']]) },
    );

    expect(getRetrySuppressedError(err)?.attempts).toBe(1);
    expect(data).toBeNull();

    const counts = server.getCounts();
    expect(counts['GET /flaky']).toBe(1);
  });

  test('GET /flaky error with suppress after 3 attempts as hitting non approved status-code', async () => {
    const [err, data] = await client.get(
      '/flaky',
      { $search: { failTimes: 5 } },
      {
        retry: { limit: 4, timeout: 1, statusCodes: [500, 501, 503, 504] },
        headers: new Headers([['x-client', 'e2e-scoped']]),
      },
    );

    expect(getRetrySuppressedError(err)?.attempts).toBe(3);
    expect(data).toBeNull();

    const counts = server.getCounts();
    expect(counts['GET /flaky']).toBe(3);
  });

  test('SSE /sse streams messages', async () => {
    vi.useFakeTimers();

    const messages: number[] = [];
    const errors: Error[] = [];
    const [errOpen, close] = await client.sse(
      '/sse',
      {
        $search: {
          error: 'never',
        },
      },
      ([err, data]) => {
        if (err) {
          errors.push(err);
          return;
        }

        messages.push(data.i);
      },
      { timeout: 1000 },
    );

    expect(errOpen).toBeNull();
    expect(errors.length).toBe(0);
    await vi.advanceTimersByTimeAsync(10);
    close?.();

    expect(messages.length).toBeGreaterThanOrEqual(3);
    expect(messages).toEqual([1, 2, 3]);

    vi.useRealTimers();
  });

  test('SSE /sse forwards errors without crashing handler', async () => {
    vi.useFakeTimers();

    const messages: number[] = [];
    const errors: Error[] = [];

    const [errOpen, close] = await client.sse(
      '/sse',
      {
        $search: {
          error: 'sometimes',
        },
      },
      ([err, data]) => {
        if (err) {
          errors.push(err);
          return;
        }
        if (data) {
          messages.push(data.i);
        }
      },
      { timeout: 1000 },
    );

    expect(errOpen).toBeNull();

    await vi.advanceTimersByTimeAsync(10);
    close?.();

    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(messages).toContain(1);
    expect(messages).toContain(3);

    vi.useRealTimers();
  });

  test('SSE /sse reconnects after connection error', async () => {
    vi.useFakeTimers();

    const messages: number[] = [];
    const errors: Error[] = [];

    const [errOpen, close] = await client.sse(
      '/sse',
      { $search: { error: 'never' } },
      ([err, data]) => {
        if (err) {
          errors.push(err);
          return;
        }

        messages.push(data.i);
      },
      { timeout: 1000 },
    );

    expect(errOpen).toBeNull();

    // Add two extra await tickers to ensure that we get around the initial connect, reconnect delay, and resumed stream
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(10);
    close?.();

    const counts = server.getCounts();

    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(counts['SSE /sse']).toBeGreaterThanOrEqual(2);
    expect(messages.filter((i) => i === 1).length).toBeGreaterThanOrEqual(2);

    vi.useRealTimers();
  });
});

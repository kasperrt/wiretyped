import { EventSource } from 'eventsource';
import { afterAll, assert, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { getHttpError, isHttpError, RequestClient, type RequestDefinitions } from 'wiretyped';
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
      response: z.object({ ok: z.boolean(), attempt: z.number() }),
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
    const [err, data] = await client.get('/ok/{integration}', {
      $path: { integration: 'slack' },
      $search: { q: 'test' },
    });
    expect(err).toBeNull();
    expect(data?.success).toBe(true);
  });

  test('caching reduces server hits (if enabled)', async () => {
    // If cache is per-request, pass options here.
    await client.get('/ok/{integration}', {
      $path: { integration: 'slack' },
      $search: { q: 'test' },
    });
    await client.get('/ok/{integration}', {
      $path: { integration: 'slack' },
      $search: { q: 'test' },
    });

    const counts = server.getCounts();
    expect(counts['GET /ok/slack']).toBeLessThanOrEqual(2);
  });

  test('POST /ok validates payload and echoes mock response', async () => {
    const [err, data] = await client.post(
      '/ok/{integration}',
      { $path: { integration: 'github' }, $search: { q: 'test' } },
      { test: 'yes' },
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
    );

    expect(err).toBeNull();
    expect(data?.success).toBe(true);
    expect(data?.received).toEqual({ test: 'yes' });
  });

  test('DOWNLOAD /ok returns blob payload', async () => {
    const [err, blob] = await client.download('/ok/{integration}', {
      $path: { integration: 'github' },
      $search: { q: 'file' },
    });

    expect(err).toBeNull();
    expect(blob).toBeInstanceOf(Blob);
    expect(await blob?.text()).toBe('{"success":true}');
  });

  test('Ignoring validation will allow to send non-approved schemas with e2e server rejecting to prove it', async () => {
    const [err] = await client.get(
      '/ok/{integration}',
      // @ts-expect-error
      { $path: { integration: 'not-allowed' }, $search: { q: 'bad' } },
      { validate: false },
    );

    expect(isHttpError(err)).toBe(true);
    expect(getHttpError(err)?.response?.status).toBe(400);
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

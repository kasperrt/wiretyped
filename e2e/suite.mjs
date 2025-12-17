import { safeWrapAsync } from '../dist/utils/wrap.mjs';

/**
 *
 * @param {boolean} condition
 * @param {string} message
 */
function assert(condition, message) {
  if (condition) {
    return;
  }

  throw new Error(message);
}

/**
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isObject(value) {
  return typeof value === 'object' && value !== null;
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function deepEqual(a, b) {
  if (Object.is(a, b)) {
    return true;
  }

  if (typeof a !== typeof b) {
    return false;
  }

  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }

    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) {
        return false;
      }
    }

    return true;
  }

  if (isObject(a) && isObject(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) {
      return false;
    }

    for (let i = 0; i < aKeys.length; i++) {
      if (aKeys[i] !== bKeys[i]) {
        return false;
      }

      if (!deepEqual(a[aKeys[i]], b[bKeys[i]])) {
        return false;
      }
    }
    return true;
  }

  return false;
}

/**
 * @param {unknown} actual
 * @param {unknown} expected
 * @param {string} message
 * @returns {void}
 */
function assertDeepEqual(actual, expected, message) {
  assert(deepEqual(actual, expected), message);
}

/**
 * @param {{ wiretyped: any, endpoints: Record<string, any>, baseUrl: string }} opts
 * @returns {any}
 */
export function createE2EClient({ wiretyped, endpoints, baseUrl }) {
  return new wiretyped.RequestClient({
    baseUrl,
    hostname: '127.0.0.1',
    endpoints,
    validation: true,
    fetchOpts: {
      headers: new Headers([['x-type', 'e2e-global']]),
    },
  });
}

/**
 * @param {{
 *   wiretyped: any,
 *   client: any,
 *   admin: {
 *     reset: () => Promise<Error | null>,
 *     getCounts: () => Promise<[Error | null, Record<string, number> | null]>,
 *   }
 * }} opts
 * @returns {{ name: string, run: () => Promise<void> }[]}
 */
export function getE2ETestCases({ wiretyped, client, admin }) {
  const { ValidationError, RetryExhaustedError, RetrySuppressedError, unwrapErrorType, HTTPError, isErrorType } = wiretyped;

  return [
    {
      name: 'URL helper returns absolute URL',
      run: async () => {
        const errReset = await admin.reset();
        assert(errReset === null, 'reset failed');

        const [err, url] = await client.url('/ok/{integration}', {
          $path: { integration: 'slack' },
          $search: { q: 'test' },
        });

        assert(err === null, 'expected err to be null');
        assert(typeof url === 'string', 'expected url to be a string');
        assert(url.startsWith('http://127.0.0.1:'), 'expected absolute url with localhost base');
        assert(url.includes('/ok/slack'), 'expected url to include path');
        assert(url.includes('q=test'), 'expected url to include search params');
      },
    },
    {
      name: 'GET /ok returns data and no error',
      run: async () => {
        const errReset = await admin.reset();
        assert(errReset === null, 'reset failed');

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
        assert(err === null, 'expected err to be null');
        assert(data?.success === true, 'expected success to be true');
      },
    },
    {
      name: 'GET /bad returns data, but errors on validation',
      run: async () => {
        const errReset = await admin.reset();
        assert(errReset === null, 'reset failed');

        const [err, data] = await client.get('/bad', null);
        assert(data === null, 'expected data to be null');
        assert(isErrorType(ValidationError, err) === true, 'expected validation error');
      },
    },
    {
      name: 'GET /bad returns raw data if validate=false',
      run: async () => {
        const errReset = await admin.reset();
        assert(errReset === null, 'reset failed');

        const [err, data] = await client.get('/bad', null, { validate: false });
        assert(err === null, 'expected err to be null');
        assert(isErrorType(ValidationError, err) === false, 'expected no validation error');
        assertDeepEqual(
          data,
          {
            data: 'wrong-format',
            etc: 'test',
          },
          'expected raw server data',
        );
      },
    },
    {
      name: 'caching reduces server hits (if enabled)',
      run: async () => {
        const errReset = await admin.reset();
        assert(errReset === null, 'reset failed');

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

        const [errCounts, counts] = await admin.getCounts();
        assert(errCounts === null, 'expected counts to return something and not error');
        assert(
          (counts['GET /ok/slack'] ?? 0) <= 2,
          `expected GET /ok/slack <= 2, got ${(counts['GET /ok/slack'] ?? 0).toString()}`,
        );
      },
    },
    {
      name: 'POST /ok validates payload and echoes mock response',
      run: async () => {
        const errReset = await admin.reset();
        assert(errReset === null, 'reset failed');

        const [err, data] = await client.post(
          '/ok/{integration}',
          { $path: { integration: 'github' }, $search: { q: 'test' } },
          { test: 'yes' },
          {
            headers: new Headers([['x-client', 'e2e-scoped']]),
          },
        );

        assert(err === null, 'expected err to be null');
        assert(data?.success === true, 'expected success to be true');
        assertDeepEqual(data?.received, { test: 'yes' }, 'expected received payload');
      },
    },
    {
      name: 'DOWNLOAD /ok returns blob payload',
      run: async () => {
        const errReset = await admin.reset();
        assert(errReset === null, 'reset failed');

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

        assert(err === null, 'expected err to be null');
        assert(blob instanceof Blob, 'expected blob instance');
        assert((await blob.text()) === '{"success":true}', 'unexpected blob text');
      },
    },
    {
      name: 'Ignoring validation will allow to send non-approved schemas with e2e server rejecting to prove it',
      run: async () => {
        const errReset = await admin.reset();
        assert(errReset === null, 'reset failed');

        // Intentionally bypass schema validation.
        const [err] = await client.get(
          '/ok/{integration}',
          { $path: { integration: 'not-allowed' }, $search: { q: 'bad' } },
          { validate: false, headers: new Headers([['x-client', 'e2e-scoped']]) },
        );

        assert(isErrorType(HTTPError, err) === true, 'expected http error');
        assert(isErrorType(ValidationError, err) === false, 'expected no validation error');
        assert(unwrapErrorType(HTTPError, err)?.response?.status === 400, 'expected status 400');
      },
    },
    {
      name: 'GET /flaky ok after 5 retries (supplied)',
      run: async () => {
        const errReset = await admin.reset();
        assert(errReset === null, 'reset failed');

        const [err, data] = await client.get(
          '/flaky',
          { $search: { failTimes: 4 } },
          { retry: { limit: 4, timeout: 1 }, headers: new Headers([['x-client', 'e2e-scoped']]) },
        );

        assert(err === null, 'expected err to be null');
        assertDeepEqual(data, { ok: true, attempt: 5 }, 'unexpected retry result');

        const [errCounts, counts] = await admin.getCounts();
        assert(errCounts === null, 'expected counts to return something and not error');
        assert((counts['GET /flaky'] ?? 0) === 5, 'expected 5 attempts');
      },
    },
    {
      name: 'GET /flaky error after 5 retries (supplied 5)',
      run: async () => {
        const errReset = await admin.reset();
        assert(errReset === null, 'reset failed');

        const [err, data] = await client.get(
          '/flaky',
          { $search: { failTimes: 5 } },
          {
            retry: { limit: 4, timeout: 1, statusCodes: [500, 501, 502, 503, 504, 505] },
            headers: new Headers([['x-client', 'e2e-scoped']]),
          },
        );

        assert(unwrapErrorType(RetryExhaustedError, err)?.attempts === 5, 'expected exhausted after 5 attempts');
        assert(data === null, 'expected data to be null');

        const [errCounts, counts] = await admin.getCounts();
        assert(errCounts === null, 'expected counts to return something and not error');
        assert((counts['GET /flaky'] ?? 0) === 5, 'expected 5 attempts');
      },
    },
    {
      name: 'GET /flaky error after 1 retries with suppressed due to ignored statuscode',
      run: async () => {
        const errReset = await admin.reset();
        assert(errReset === null, 'reset failed');

        const [err, data] = await client.get(
          '/flaky',
          { $search: { failTimes: 5 } },
          {
            retry: { limit: 4, timeout: 1, ignoreStatusCodes: [500] },
            headers: new Headers([['x-client', 'e2e-scoped']]),
          },
        );

        assert(unwrapErrorType(RetrySuppressedError, err)?.attempts === 1, 'expected suppressed after 1 attempt');
        assert(data === null, 'expected data to be null');

        const [errCounts, counts] = await admin.getCounts();
        assert(errCounts === null, 'expected counts to return something and not error');
        assert((counts['GET /flaky'] ?? 0) === 1, 'expected 1 attempt');
      },
    },
    {
      name: 'GET /flaky error with suppress after 3 attempts as hitting non approved status-code',
      run: async () => {
        const errReset = await admin.reset();
        assert(errReset === null, 'reset failed');

        const [err, data] = await client.get(
          '/flaky',
          { $search: { failTimes: 5 } },
          {
            retry: { limit: 4, timeout: 1, statusCodes: [500, 501, 503, 504] },
            headers: new Headers([['x-client', 'e2e-scoped']]),
          },
        );

        assert(unwrapErrorType(RetrySuppressedError, err)?.attempts === 3, 'expected suppressed after 3 attempts');
        assert(data === null, 'expected data to be null');

        const [errCounts, counts] = await admin.getCounts();
        assert(errCounts === null, 'expected counts to return something and not error');
        assert((counts['GET /flaky'] ?? 0) === 3, 'expected 3 attempts');
      },
    },
    {
      name: 'SSE /sse streams messages',
      run: async () => {
        const errReset = await admin.reset();
        assert(errReset === null, 'reset failed');

        const messages = [];
        const statuses = [];

        let resolveDone = null;
        let rejectDone = null;
        const done = new Promise((resolve, reject) => {
          resolveDone = resolve;
          rejectDone = reject;
        });
        const [errOpen, close] = await client.sse(
          '/sse',
          {
            $search: {
              error: 'never',
            },
          },
          ([err, event]) => {
            if (err) {
              rejectDone?.(err);
              return;
            }

            if (event.type === 'message') {
              messages.push(event.data.i);
            }

            if (event.type === 'status') {
              statuses.push(event.data.ok);
            }

            if (event.type === 'done') {
              resolveDone?.();
            }
          },
          { timeout: 1000 },
        );

        assert(errOpen === null, 'expected errOpen to be null');

        await done;
        close?.();
        assert(messages.length >= 3, 'expected >=3 messages');
        assert(messages[0] === 1 && messages[1] === 2 && messages[2] === 3, 'expected messages [1,2,3]');
        assert(statuses.includes(true), 'expected status true');
      },
    },
    {
      name: 'SSE /sse forwards errors without crashing handler',
      run: async () => {
        const errReset = await admin.reset();
        assert(errReset === null, 'reset failed');

        const messages = [];
        const statuses = [];
        const errors = [];
        let resolveDone = null;
        const done = new Promise((resolve) => {
          resolveDone = resolve;
        });

        const [errOpen, close] = await client.sse(
          '/sse',
          {
            $search: {
              error: 'sometimes',
            },
          },
          ([err, event]) => {
            if (err) {
              errors.push(err);
              return;
            }
            if (event.type === 'message') {
              messages.push(event.data.i);
            }

            if (event.type === 'status') {
              statuses.push(event.data.ok);
            }

            if (event.type === 'done') {
              resolveDone?.();
            }
          },
          { timeout: 1000 },
        );

        assert(errOpen === null, 'expected errOpen to be null');
        await done;
        close?.();

        assert(errors.length >= 1, 'expected at least 1 error');
        assert(messages.includes(1), 'expected message 1');
        assert(messages.includes(3), 'expected message 3');
        assert(statuses.length >= 1, 'expected at least 1 status');
      },
    },
    {
      name: 'SSE /sse reconnects after connection error',
      run: async () => {
        const errReset = await admin.reset();
        assert(errReset === null, 'reset failed');

        const messages = [];
        const statuses = [];
        const errors = [];
        let doneCount = 0;
        let resolveDone = null;
        let rejectDone = null;
        const done = new Promise((resolve, reject) => {
          resolveDone = resolve;
          rejectDone = reject;
        });

        const [errOpen, close] = await client.sse(
          '/sse',
          { $search: { error: 'never' } },
          ([err, event]) => {
            if (err) {
              errors.push(err);
              rejectDone?.(err);
              return;
            }

            if (event.type === 'message') {
              messages.push(event.data.i);
            }

            if (event.type === 'status') {
              statuses.push(event.data.ok);
            }

            if (event.type === 'done') {
              doneCount += 1;
              const messageOnes = messages.filter((i) => i === 1).length;
              if (doneCount >= 2 && messageOnes >= 2 && statuses.length >= 1 && errors.length === 0) {
                resolveDone?.();
              }
            }
          },
          { timeout: 5_000 },
        );

        assert(errOpen === null, 'expected errOpen to be null');
        await done;
        close?.();
      },
    },
  ];
}

/**
 * Runs cases sequentially and returns a summary.
 *
 * @param {{ name: string, run: () => Promise<void> }[]} cases
 * @returns {Promise<[unknown[], string[]]>}
 */
export async function runE2ETestCases(cases) {
  const logs = [];
  const errors = [];
  for (const test of cases) {
    const start = performance.now();
    const [err] = await safeWrapAsync(() => test.run());
    const now = performance.now();
    const duration = now - start;
    const durationText = duration > 250 ? `\x1b[33m[${duration.toFixed(2)}ms]` : `\x1b[36m[${duration.toFixed(2)}ms]`;

    if (err) {
      const log = `\x1b[31m [FAILED] \x1b[0m- e2e: ${test.name} - ${durationText} \x1b[0m`;
      logs.push(log);
      errors.push(err);
      continue;
    }

    const log = `\x1b[32m [SUCCESS] \x1b[0m- e2e: ${test.name} - ${durationText} \x1b[0m`;
    logs.push(log);
  }

  return [errors, logs];
}

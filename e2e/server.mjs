import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { sleep } from '../dist/utils/sleep.mjs';
import { validator } from '../dist/utils/validator.mjs';
import { safeWrap, safeWrapAsync } from '../dist/utils/wrap.mjs';

const okEndpoint = '/ok/{integration}';
const flakyEndpoint = '/flaky';
const sseEndpoint = '/sse';

/**
 * Starts an HTTP server implementing the endpoints used by the e2e suite.
 *
 * @param {Record<string, any>} endpoints
 * @returns {Promise<[Error | null, E2EServer | null]>}
 */
export async function startE2EServer(endpoints, opts = {}) {
  const counts = {};
  const okSchemas = endpoints?.[okEndpoint];
  const flakySchemas = endpoints?.[flakyEndpoint];
  const sseSchemas = endpoints?.[sseEndpoint];
  const app = new Hono();
  const sockets = new Set();

  if (!okSchemas || !flakySchemas || !sseSchemas) {
    return [new Error('missing required endpoints for e2e server'), null];
  }

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-client, x-type, Last-Event-ID',
  };

  app.use('*', async (c, next) => {
    for (const [key, value] of Object.entries(corsHeaders)) {
      c.header(key, value);
    }
    await next();
  });

  app.options('*', (c) => {
    for (const [key, value] of Object.entries(corsHeaders)) {
      c.header(key, value);
    }
    return c.body(null, 204);
  });

  function increment(key) {
    counts[key] = (counts[key] ?? 0) + 1;
    return counts[key];
  }

  app.get('/__counts', (c) => c.json(counts));
  app.post('/__reset', (c) => {
    for (const k of Object.keys(counts)) {
      delete counts[k];
    }
    return c.json({ ok: true });
  });

  const distDir = fileURLToPath(new URL('../dist', import.meta.url));
  const browserDistDir = fileURLToPath(new URL('./dist', import.meta.url));

  const contentTypeFor = (ext) => {
    switch (ext) {
      case '.mjs':
      case '.js':
        return 'application/javascript';
      case '.html':
        return 'text/html';
      default:
        return 'text/plain';
    }
  };

  const ensureInside = (root, candidate) => candidate.startsWith(root);

  app.get('/', (c) => c.redirect('/browser-test.html'));

  app.get('/browser-test.html', async (c) => {
    const targetPath = resolve(join(browserDistDir, 'browser-test.html'));
    if (!ensureInside(browserDistDir, targetPath)) {
      return c.text('Forbidden', 403);
    }

    const [err, data] = await safeWrapAsync(() => readFile(targetPath));
    if (err) {
      return c.text('Not found', 404);
    }

    c.header('Content-Type', 'text/html');
    c.header('Cache-Control', 'no-store');
    return c.body(data, 200);
  });

  app.get('/assets/*', async (c) => {
    const pathname = c.req.path;
    const rel = pathname.replace(/^\/+/, '');
    const targetPath = resolve(join(browserDistDir, rel));
    if (!ensureInside(browserDistDir, targetPath)) {
      return c.text('Forbidden', 403);
    }

    const [err, data] = await safeWrapAsync(() => readFile(targetPath));
    if (err) {
      return c.text('Not found', 404);
    }

    c.header('Content-Type', contentTypeFor(extname(targetPath)));
    c.header('Cache-Control', 'no-store');
    return c.body(data, 200);
  });

  app.get('/dist/*', async (c) => {
    const pathname = c.req.path;
    const rel = pathname.replace(/^\/dist\/+/, '');
    const targetPath = resolve(join(distDir, rel));
    if (!ensureInside(distDir, targetPath)) {
      return c.text('Forbidden', 403);
    }

    const [err, data] = await safeWrapAsync(() => readFile(targetPath));
    if (err) {
      return c.text('Not found', 404);
    }

    c.header('Content-Type', contentTypeFor(extname(targetPath)));
    c.header('Cache-Control', 'no-store');
    return c.body(data, 200);
  });

  function registerOk(method) {
    const httpMethod = method === 'download' ? 'GET' : method.toUpperCase();
    const counterMethod = method.toUpperCase();

    app.on(httpMethod, '/ok/:integration', async (c) => {
      const schemas = okSchemas[method];
      if (!schemas) {
        return c.notFound();
      }

      const headers = c.req.header();
      if (headers['x-client'] !== 'e2e-scoped') {
        return c.json({ error: 'missing inlined header' }, 500);
      }

      if (headers['x-type'] !== 'e2e-global') {
        return c.json({ error: 'missing global header' }, 500);
      }

      const integration = c.req.param('integration');
      const counterPath = `/ok/${integration}`;
      increment(`${counterMethod} ${counterPath}`);

      const pathParams = { integration };
      const searchParams = c.req.query();

      if (schemas.$path) {
        const [errPath, validatedPath] = await validator(pathParams, schemas.$path);
        if (errPath) {
          return c.json({ error: 'invalid path params', details: errPath.message }, 400);
        }

        Object.assign(pathParams, validatedPath ?? {});
      }

      if (schemas.$search) {
        const [errSearch, validatedSearch] = await validator(searchParams, schemas.$search);
        if (errSearch) {
          return c.json({ error: 'invalid search params', details: errSearch.message }, 400);
        }

        Object.assign(searchParams, validatedSearch ?? {});
      }

      let requestBody;
      if ('request' in schemas && schemas.request) {
        const [err, parsed] = await safeWrapAsync(() => c.req.json());
        if (err) {
          return c.json({ error: 'invalid json', details: err?.message ?? String(err) }, 400);
        }

        const [errValidate, validated] = await validator(parsed, schemas.request);
        if (errValidate) {
          return c.json({ error: 'invalid request body', details: errValidate.message }, 400);
        }

        requestBody = validated;
      }

      if ('response' in schemas) {
        const responseData = requestBody ? { success: true, received: requestBody } : { success: true };
        const [errResponse, validatedResponse] = await validator(responseData, schemas.response);
        if (errResponse) {
          return c.json({ error: 'response failed validation', details: errResponse.message }, 500);
        }

        return c.json(validatedResponse);
      }

      return c.json({ error: 'missing schema' }, 500);
    });
  }

  app.get('/bad', (c) => {
    return c.json({ data: 'wrong-format', etc: 'test' }, 200);
  });

  app.get('/flaky', async (c) => {
    const schemas = flakySchemas.get;
    if (!schemas) {
      return c.json({ error: 'missing schema for flaky' }, 500);
    }

    const headers = c.req.header();
    if (headers['x-client'] !== 'e2e-scoped') {
      return c.json({ error: 'missing inlined header' }, 500);
    }

    if (headers['x-type'] !== 'e2e-global') {
      return c.json({ error: 'missing global header' }, 500);
    }

    const searchParams = c.req.query();
    const attempt = increment(`GET ${flakyEndpoint}`);

    const failTimes = Number(searchParams.failTimes ?? '1');
    const ok = attempt > failTimes;
    const responseData = { ok, attempt };
    const [errResponse, validatedResponse] = await validator(responseData, schemas.response);
    if (errResponse) {
      return c.json({ error: 'response failed validation', details: errResponse.message }, 500);
    }

    return c.json(validatedResponse, ok ? 200 : 500 + (attempt - 1));
  });

  app.get('/sse', (c) => {
    const schemas = sseSchemas.sse;
    if (!schemas) {
      return c.json({ error: 'missing schema for sse' }, 500);
    }

    increment(`SSE ${sseEndpoint}`);

    const searchParams = c.req.query();
    const mode = searchParams.error ?? 'never';

    return streamSSE(c, async (stream) => {
      for (let i = 1; i <= 3; i++) {
        if (mode === 'sometimes' && i === 2) {
          await stream.writeSSE({ data: 'not-json' });
          await sleep(1);
          continue;
        }

        const payload = { i };
        const [errValidate, validated] = await validator(payload, schemas.events.message);
        if (errValidate) {
          await stream.close();
          return;
        }

        await stream.writeSSE({ data: JSON.stringify(validated), ...(i === 1 ? { retry: 25 } : {}) });
        await sleep(1);
      }

      const statusPayload = { ok: true };
      const [errStatus, validatedStatus] = await validator(statusPayload, schemas.events.status);
      if (!errStatus) {
        await stream.writeSSE({ event: 'status', data: JSON.stringify(validatedStatus) });
      }

      await stream.writeSSE({ event: 'done', data: JSON.stringify('[DONE]') });
      await stream.close();
    });
  });

  for (const method of Object.keys(okSchemas)) {
    registerOk(method);
  }

  const [err, serverAndPort] = await safeWrapAsync(
    () =>
      new Promise((resolve) => {
        const port = Number.isFinite(opts.port) ? opts.port : 0;
        const hostname = typeof opts.hostname === 'string' ? opts.hostname : '127.0.0.1';
        const srv = serve({ fetch: app.fetch, port, hostname, autoCleanupIncoming: false }, (serverInfo) => {
          resolve([srv, serverInfo.port]);
        });
      }),
  );
  if (err) {
    return [new Error('error starting server', { cause: err }), null];
  }

  if (!serverAndPort) {
    return [new Error('error starting server'), null];
  }

  let [server, port] = serverAndPort;
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  const address = server.address();
  if (address && typeof address !== 'string') {
    port = address.port;
  }

  function close() {
    // Ensure we don't hang on lingering keep-alive / SSE connections.
    const [errCloseIdle] = safeWrap(() => server.closeIdleConnections?.());
    if (errCloseIdle) {
      console.error('err close-idle:', errCloseIdle);
    }

    const [errCloseAll] = safeWrap(() => server.closeAllConnections?.());
    if (errCloseAll) {
      console.error('err close-all:', errCloseAll);
    }

    for (const socket of sockets) {
      const [errDestroy] = safeWrap(() => socket.destroy());
      if (errDestroy) {
        console.error('err destroy:', errDestroy);
      }
    }

    return new Promise((resolve) =>
      server.close((err) => {
        if (err) {
          resolve(new Error('error closing server', { cause: err }));
          return;
        }

        resolve(null);
      }),
    );
  }

  return [
    null,
    {
      url: `http://127.0.0.1:${port}`,
      close,
    },
  ];
}

const { endpoints } = await import('./endpoints.mjs');
const hostname = process.env.E2E_HOST ?? '127.0.0.1';
const port = process.env.E2E_PORT ? Number(process.env.E2E_PORT) : 0;
const [err, server] = await startE2EServer(endpoints, { port, hostname });
if (err || !server) {
  console.error(err ?? new Error('failed to start e2e server'));
  process.exit(1);
}

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  await Promise.race([server.close(), new Promise((resolve) => setTimeout(resolve, 1000))]);
  process.exit(0);
};

process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());

setInterval(() => {}, 1 << 30);

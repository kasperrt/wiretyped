import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sleep } from '../dist/utils/sleep.mjs';
import { validator } from '../dist/utils/validator.mjs';
import { safeWrap, safeWrapAsync } from '../dist/utils/wrap.mjs';

const okEndpoint = '/ok/{integration}';
const flakyEndpoint = '/flaky';
const sseEndpoint = '/sse';

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {URL}
 */
function getRequestUrl(req) {
  const raw = req.url ?? '/';
  return new URL(raw, 'http://127.0.0.1');
}

/**
 * @param {string} root Absolute root directory.
 * @param {string} candidate Absolute file path.
 * @returns {boolean}
 */
function ensureInside(root, candidate) {
  const rel = relative(root, candidate);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

/**
 * @param {string} pathOrExt
 * @returns {string | undefined}
 */
function contentTypeFor(pathOrExt) {
  const ext = pathOrExt.startsWith('.') ? pathOrExt : extname(pathOrExt);
  switch (ext) {
    case '.js':
      return 'application/javascript';
    case '.html':
      return 'text/html';
  }
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {string} text
 * @param {Record<string, string>} [headers]
 * @returns {void}
 */
function sendText(res, status, text, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', headers['Content-Type'] ?? 'text/plain; charset=utf-8');
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === 'content-type') {
      continue;
    }
    res.setHeader(k, v);
  }
  res.end(text);
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} value
 * @param {Record<string, string>} [headers]
 * @returns {void}
 */
function json(res, status, value, headers = {}) {
  const [errStringify, body] = safeWrap(() => JSON.stringify(value));
  if (errStringify) {
    sendText(res, 500, 'error stringifying json', headers);
    return;
  }
  sendText(res, status, body, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<[Error | null, any | null]>}
 */
async function read(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const text = Buffer.concat(chunks).toString('utf8');
  const [errParse, value] = safeWrap(() => JSON.parse(text));
  if (errParse) {
    return [errParse, null];
  }

  return [null, value];
}

/**
 * Writes a Server-Sent Event (SSE) block to the response.
 *
 * @param {import('node:http').ServerResponse} res
 * @param {{ event?: string, data: string, id?: string, retry?: number }} message
 * @returns {void}
 */
function sse(res, { event, data, id, retry }) {
  if (id) {
    res.write(`id: ${id}\n`);
  }

  if (event) {
    res.write(`event: ${event}\n`);
  }

  if (typeof retry === 'number') {
    res.write(`retry: ${retry.toString()}\n`);
  }

  const str = typeof data === 'string' ? data : String(data);
  const lines = str.split(/\r?\n/);
  for (const line of lines) {
    res.write(`data: ${line}\n`);
  }

  res.write('\n');
}

/**
 * Starts an HTTP server implementing the endpoints used by the e2e suite.
 *
 * @param {Record<string, any>} endpoints
 * @param {{ port?: number, hostname?: string }} [opts]
 * @returns {Promise<[Error | null, Server | null]>}
 */
export async function startE2EServer(endpoints, opts = {}) {
  const counts = new Map();
  const okSchemas = endpoints?.[okEndpoint];
  const flakySchemas = endpoints?.[flakyEndpoint];
  const sseSchemas = endpoints?.[sseEndpoint];

  if (!okSchemas || !flakySchemas || !sseSchemas) {
    return [new Error('missing required endpoints for e2e server'), null];
  }

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-client, x-type, Last-Event-ID',
  };

  /**
   * @param {string} key
   * @returns {number}
   */
  function increment(key) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts.get(key);
  }

  function reset() {
    counts.clear();
  }

  const browserDistDir = fileURLToPath(new URL('./dist', import.meta.url));

  const server = createServer(async (req, res) => {
    for (const [k, v] of Object.entries(corsHeaders)) {
      res.setHeader(k, v);
    }

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    const url = getRequestUrl(req);
    const pathname = url.pathname;
    const method = (req.method ?? 'GET').toUpperCase();

    if (method === 'GET' && pathname === '/__counts') {
      json(res, 200, Object.fromEntries(counts.entries()));
      return;
    }

    if (method === 'POST' && pathname === '/__reset') {
      reset();
      json(res, 200, { ok: true });
      return;
    }

    if (method === 'GET' && pathname === '/browser-test.html') {
      const targetPath = resolve(join(browserDistDir, 'browser-test.html'));
      if (!ensureInside(browserDistDir, targetPath)) {
        sendText(res, 403, 'Forbidden');
        return;
      }

      const [err, data] = await safeWrapAsync(() => readFile(targetPath));
      if (err) {
        sendText(res, 404, 'Not found');
        return;
      }

      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.statusCode = 200;
      res.end(data);
      return;
    }

    if (method === 'GET' && pathname.startsWith('/assets/')) {
      const rel = pathname.replace(/^\/+/, '');
      const targetPath = resolve(join(browserDistDir, rel));
      if (!ensureInside(browserDistDir, targetPath)) {
        sendText(res, 403, 'Forbidden');
        return;
      }

      const [err, data] = await safeWrapAsync(() => readFile(targetPath));
      if (err) {
        sendText(res, 404, 'Not found');
        return;
      }

      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', `${contentTypeFor(targetPath)}; charset=utf-8`);
      res.statusCode = 200;
      res.end(data);
      return;
    }

    if (pathname === '/bad' && method === 'GET') {
      json(res, 200, { data: 'wrong-format', etc: 'test' });
      return;
    }

    if (pathname === '/flaky' && method === 'GET') {
      const schemas = flakySchemas.get;
      if (!schemas) {
        json(res, 500, { error: 'missing schema for flaky' });
        return;
      }

      const headers = req.headers ?? {};
      if (headers['x-client'] !== 'e2e-scoped') {
        json(res, 500, { error: 'missing inlined header' });
        return;
      }

      if (headers['x-type'] !== 'e2e-global') {
        json(res, 500, { error: 'missing global header' });
        return;
      }

      const attempt = increment(`GET ${flakyEndpoint}`);
      const failTimes = Number(url.searchParams.get('failTimes') ?? '1');
      const ok = attempt > failTimes;
      const responseData = { ok, attempt };
      const [errResponse, validatedResponse] = await validator(responseData, schemas.response);
      if (errResponse) {
        json(res, 500, { error: 'response failed validation', details: errResponse.message });
        return;
      }

      json(res, ok ? 200 : 500 + (attempt - 1), validatedResponse);
      return;
    }

    if (pathname === '/sse' && method === 'GET') {
      const schemas = sseSchemas.sse;
      if (!schemas) {
        json(res, 500, { error: 'missing schema for sse' });
        return;
      }

      increment(`SSE ${sseEndpoint}`);

      const mode = url.searchParams.get('error') ?? 'never';

      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      let closed = false;
      req.on('close', () => {
        closed = true;
      });

      for (let i = 1; i <= 3; i++) {
        if (closed) {
          return;
        }

        if (mode === 'sometimes' && i === 2) {
          sse(res, { data: 'not-json' });
          await sleep(1);
          continue;
        }

        const payload = { i };
        const [errValidate, validated] = await validator(payload, schemas.events.message);
        if (errValidate) {
          res.end();
          return;
        }

        sse(res, { data: JSON.stringify(validated), ...(i === 1 ? { retry: 25 } : {}) });
        await sleep(1);
      }

      const statusPayload = { ok: true };
      const [errStatus, validatedStatus] = await validator(statusPayload, schemas.events.status);
      if (!errStatus) {
        sse(res, { event: 'status', data: JSON.stringify(validatedStatus) });
      }

      sse(res, { event: 'done', data: JSON.stringify('[DONE]') });
      res.end();
      return;
    }

    const okMatch = pathname.match(/^\/ok\/([^/]+)$/);
    if (okMatch) {
      const integration = decodeURIComponent(okMatch[1]);
      const methodKey = method.toLowerCase();
      const schemas = okSchemas[methodKey];
      if (!schemas) {
        sendText(res, 404, 'Not found');
        return;
      }

      const headers = req.headers ?? {};
      if (headers['x-client'] !== 'e2e-scoped') {
        json(res, 500, { error: 'missing inlined header' });
        return;
      }

      if (headers['x-type'] !== 'e2e-global') {
        json(res, 500, { error: 'missing global header' });
        return;
      }

      const counterPath = `/ok/${integration}`;
      increment(`${method.toUpperCase()} ${counterPath}`);

      const pathParams = { integration };
      const searchParams = Object.fromEntries(url.searchParams.entries());

      if (schemas.$path) {
        const [errPath, validatedPath] = await validator(pathParams, schemas.$path);
        if (errPath) {
          json(res, 400, { error: 'invalid path params', details: errPath.message });
          return;
        }
        Object.assign(pathParams, validatedPath ?? {});
      }

      if (schemas.$search) {
        const [errSearch, validatedSearch] = await validator(searchParams, schemas.$search);
        if (errSearch) {
          json(res, 400, { error: 'invalid search params', details: errSearch.message });
          return;
        }
        Object.assign(searchParams, validatedSearch ?? {});
      }

      let requestBody;
      if ('request' in schemas && schemas.request) {
        const [errBody, parsed] = await read(req);
        if (errBody) {
          json(res, 400, { error: 'invalid json', details: errBody?.message ?? String(errBody) });
          return;
        }

        const [errValidate, validated] = await validator(parsed, schemas.request);
        if (errValidate) {
          json(res, 400, { error: 'invalid request body', details: errValidate.message });
          return;
        }

        requestBody = validated;
      }

      if ('response' in schemas) {
        const responseData = requestBody ? { success: true, received: requestBody } : { success: true };
        const [errResponse, validatedResponse] = await validator(responseData, schemas.response);
        if (errResponse) {
          json(res, 500, { error: 'response failed validation', details: errResponse.message });
          return;
        }
        json(res, 200, validatedResponse);
        return;
      }

      json(res, 500, { error: 'missing schema' });
      return;
    }

    sendText(res, 404, 'Not found');
  });

  const port = Number.isFinite(opts.port) ? opts.port : 0;
  const hostname = typeof opts.hostname === 'string' ? opts.hostname : '127.0.0.1';

  const [errListen] = await safeWrapAsync(
    () => new Promise((resolve) => server.listen(port, hostname, () => resolve(null))),
  );
  if (errListen) {
    return [new Error('error starting server', { cause: errListen }), null];
  }

  const address = server.address();
  const actualPort = address && typeof address !== 'string' ? address.port : port;

  /**
   * @returns {Promise<Error | null>}
   */
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
      url: `http://127.0.0.1:${actualPort}`,
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
/**
 * @returns {Promise<void>}
 */
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

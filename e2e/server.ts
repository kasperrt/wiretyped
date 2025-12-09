import { type ServerType, serve } from '@hono/node-server';
import { Hono } from 'hono';
import type { RequestDefinitions } from '../src/core/types';
import { validator } from '../src/utils/validator';
import { type SafeWrapAsync, safeWrapAsync } from '../src/utils/wrap';

export type E2EServer = {
  url: string;
  close: () => Promise<Error | null>;
  reset: () => void;
  getCounts: () => Record<string, number>;
};

const okEndpoint = '/ok/{integration}';
const flakyEndpoint = '/flaky';
const sseEndpoint = '/sse';

export async function startE2EServer(endpoints: RequestDefinitions): SafeWrapAsync<Error, E2EServer> {
  const counts: Record<string, number> = {};
  const okSchemas = endpoints[okEndpoint];
  const flakySchemas = endpoints[flakyEndpoint];
  const sseSchemas = endpoints[sseEndpoint];
  const app = new Hono();

  if (!okSchemas || !flakySchemas || !sseSchemas) {
    return [new Error('missing required endpoints for e2e server'), null];
  }

  function incremenet(key: string) {
    counts[key] = (counts[key] ?? 0) + 1;
    return counts[key];
  }

  function registerOk(method: string) {
    const httpMethod = method === 'download' ? 'GET' : method.toUpperCase();
    const counterMethod = method.toUpperCase();

    app.on(httpMethod, '/ok/:integration', async (c) => {
      const schemas = okSchemas[method as keyof typeof okSchemas];
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
      incremenet(`${counterMethod} ${counterPath}`);

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

      let requestBody: unknown;
      if ('request' in schemas && schemas.request) {
        const [errParse, parsed] = await safeWrapAsync(() => c.req.json());
        if (errParse) {
          return c.json({ error: 'invalid json', details: errParse.message }, 400);
        }

        const [errValidate, validated] = await validator(parsed, schemas.request);
        if (errValidate) {
          return c.json({ error: 'invalid request body', details: errValidate.message }, 400);
        }

        requestBody = validated;
      }

      const responseData = requestBody ? { success: true, received: requestBody } : { success: true };
      const [errResponse, validatedResponse] = await validator(responseData, schemas.response);
      if (errResponse) {
        return c.json({ error: 'response failed validation', details: errResponse.message }, 500);
      }

      return c.json(validatedResponse);
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
    const attempt = incremenet(`GET ${flakyEndpoint}`);

    const failTimes = Number(searchParams.failTimes ?? '1');
    const ok = attempt > failTimes;
    const responseData = { ok, attempt };
    const [errResponse, validatedResponse] = await validator(responseData, schemas.response);
    if (errResponse) {
      return c.json({ error: 'response failed validation', details: errResponse.message }, 500);
    }

    // @ts-expect-error
    return c.json(validatedResponse, ok ? 200 : 500 + (attempt - 1));
  });

  app.get('/sse', (c) => {
    const schemas = sseSchemas.sse;
    if (!schemas) {
      return c.json({ error: 'missing schema for sse' }, 500);
    }

    incremenet(`SSE ${sseEndpoint}`);

    const searchParams = c.req.query();
    const mode = (searchParams.error as string | undefined) ?? 'never';
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        let i = 0;
        const interval = setInterval(async () => {
          i++;

          if (mode === 'sometimes' && i === 2) {
            controller.enqueue(encoder.encode(`data: not-json\n\n`));
            return;
          }

          const payload = { i };
          const [errValidate, validated] = await validator(payload, schemas.response);
          if (errValidate) {
            controller.error(errValidate);
            clearInterval(interval);
            return;
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify(validated)}\n\n`));

          if (i < 3) {
            return;
          }

          clearInterval(interval);
          controller.close();
        }, 1);
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      },
    });
  });

  for (const method of Object.keys(okSchemas)) {
    registerOk(method);
  }

  const [errServer, serverAndPort] = await safeWrapAsync(
    () =>
      new Promise<[ServerType, number]>((resolve) => {
        const srv = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, (serverInfo) => {
          resolve([srv, serverInfo.port]);
        });
      }),
  );

  if (errServer || !serverAndPort) {
    return [new Error('error starting server', { cause: errServer ?? undefined }), null];
  }

  let [server, port] = serverAndPort;
  const address = server.address();
  if (address && typeof address !== 'string') {
    port = address.port;
  }

  return [
    null,
    {
      url: `http://127.0.0.1:${port}`,
      reset: () => {
        for (const k of Object.keys(counts)) {
          delete counts[k];
        }
      },
      getCounts: () => structuredClone(counts),
      close: () =>
        new Promise<Error | null>((resolve) =>
          server.close((err) => {
            if (err) {
              resolve(new Error('error closing server', { cause: err }));
              return;
            }

            resolve(null);
          }),
        ),
    },
  ];
}

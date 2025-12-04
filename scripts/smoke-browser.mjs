// Browser smoke: verify bundles load in a real browser (Chromium) via ESM imports
import assert from 'node:assert';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const distDir = fileURLToPath(new URL('../dist', import.meta.url));

const contentTypeFor = (ext) => {
  switch (ext) {
    case '.mjs':
    case '.js':
      return 'application/javascript';
    case '.cjs':
      return 'application/node';
    case '.json':
      return 'application/json';
    default:
      return 'text/plain';
  }
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const requestedPath = url.pathname === '/' ? '/index.mjs' : url.pathname;
  const targetPath = resolve(join(distDir, requestedPath.replace(/^\/+/, '')));

  if (!targetPath.startsWith(distDir)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  try {
    const data = await readFile(targetPath);
    res.statusCode = 200;
    res.setHeader('Content-Type', contentTypeFor(extname(targetPath)));
    res.setHeader('Cache-Control', 'no-store');
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
});

await new Promise((resolveServer) => server.listen(0, resolveServer));
const { port } = server.address();
const base = `http://localhost:${port}`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  const result = await page.evaluate(async (baseUrl) => {
    const root = await import(`${baseUrl}/index.mjs`);
    const core = await import(`${baseUrl}/core.mjs`);
    const error = await import(`${baseUrl}/error.mjs`);

    return {
      root: {
        requestClient: typeof root.RequestClient === 'function',
        httpError: typeof root.HTTPError === 'function',
        timeoutError: typeof root.TimeoutError === 'function',
        isHttpError: typeof root.isHttpError === 'function',
      },
      core: {
        requestClient: typeof core.RequestClient === 'function',
      },
      error: {
        unwrapErrorType: typeof error.unwrapErrorType === 'function',
        isErrorType: typeof error.isErrorType === 'function',
      },
    };
  }, base);

  assert.deepStrictEqual(result.root, {
    requestClient: true,
    httpError: true,
    timeoutError: true,
    isHttpError: true,
  });
  assert.deepStrictEqual(result.core, { requestClient: true });
  assert.deepStrictEqual(result.error, {
    unwrapErrorType: true,
    isErrorType: true,
  });

  console.log('Browser smoke passed');
} finally {
  await browser.close();
  server.close();
}

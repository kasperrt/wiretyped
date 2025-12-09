// Browser smoke: verify bundles load in a real browser (Chromium) via ESM imports
import assert from 'node:assert';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
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
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end('Forbidden');
    return;
  }

  try {
    const data = await readFile(targetPath);
    res.statusCode = 200;
    res.setHeader('Content-Type', contentTypeFor(extname(targetPath)));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.setHeader('Access-Control-Allow-Origin', '*');
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
        abortError: typeof root.AbortError === 'function',
        requestClient: typeof root.RequestClient === 'function',
        httpError: typeof root.HTTPError === 'function',
        timeoutError: typeof root.TimeoutError === 'function',
        retrySuppressedError: typeof root.RetrySuppressedError === 'function',
        isRetrySuppressedError: typeof root.isRetrySuppressedError === 'function',
        getRetrySuppressedError: typeof root.getRetrySuppressedError === 'function',
        retryExhaustedError: typeof root.RetryExhaustedError === 'function',
        isRetryExhaustedError: typeof root.isRetryExhaustedError === 'function',
        getRetryExhaustedError: typeof root.getRetryExhaustedError === 'function',
        getHttpError: typeof root.getHttpError === 'function',
        isAbortError: typeof root.isAbortError === 'function',
        isHttpError: typeof root.isHttpError === 'function',
        isTimeoutError: typeof root.isTimeoutError === 'function',
        validationError: typeof root.ValidationError === 'function',
        getValidationError: typeof root.getValidationError === 'function',
        isValidationError: typeof root.isValidationError === 'function',
      },
      core: {
        requestClient: typeof core.RequestClient === 'function',
      },
      error: {
        abortError: typeof error.AbortError === 'function',
        httpError: typeof error.HTTPError === 'function',
        timeoutError: typeof error.TimeoutError === 'function',
        getHttpError: typeof error.getHttpError === 'function',
        isAbortError: typeof error.isAbortError === 'function',
        isHttpError: typeof error.isHttpError === 'function',
        isTimeoutError: typeof error.isTimeoutError === 'function',
        unwrapErrorType: typeof error.unwrapErrorType === 'function',
        isErrorType: typeof error.isErrorType === 'function',
        retrySuppressedError: typeof error.RetrySuppressedError === 'function',
        isRetrySuppressedError: typeof error.isRetrySuppressedError === 'function',
        getRetrySuppressedError: typeof error.getRetrySuppressedError === 'function',
        retryExhaustedError: typeof error.RetryExhaustedError === 'function',
        isRetryExhaustedError: typeof error.isRetryExhaustedError === 'function',
        getRetryExhaustedError: typeof error.getRetryExhaustedError === 'function',
      },
    };
  }, base);

  assert.deepStrictEqual(result.root, {
    abortError: true,
    requestClient: true,
    httpError: true,
    timeoutError: true,
    getHttpError: true,
    isAbortError: true,
    isHttpError: true,
    isTimeoutError: true,
    validationError: true,
    getValidationError: true,
    isValidationError: true,
    retryExhaustedError: true,
    retrySuppressedError: true,
    isRetryExhaustedError: true,
    getRetryExhaustedError: true,
    isRetrySuppressedError: true,
    getRetrySuppressedError: true,
  });
  assert.deepStrictEqual(result.core, { requestClient: true });
  assert.deepStrictEqual(result.error, {
    abortError: true,
    httpError: true,
    timeoutError: true,
    getHttpError: true,
    isAbortError: true,
    isHttpError: true,
    isTimeoutError: true,
    unwrapErrorType: true,
    isErrorType: true,
    retryExhaustedError: true,
    retrySuppressedError: true,
    isRetryExhaustedError: true,
    getRetryExhaustedError: true,
    isRetrySuppressedError: true,
    getRetrySuppressedError: true,
  });

  console.log('Browser smoke passed');
} finally {
  await browser.close();
  server.close();
}

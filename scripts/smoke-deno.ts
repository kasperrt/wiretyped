// Deno smoke: load ESM bundles and assert key exports
const distIndex = new URL('../dist/index.mjs', import.meta.url);

const rootErrors = [
  'AbortError',
  'TimeoutError',
  'HTTPError',
  'getHttpError',
  'isAbortError',
  'isHttpError',
  'isTimeoutError',
  'ValidationError',
  'getValidationError',
  'isValidationError',
  'RetrySuppressedError',
  'RetryExhaustedError',
  'isRetrySuppressedError',
  'getRetrySuppressedError',
  'isRetryExhaustedError',
  'getRetryExhaustedError',
];

const checkRoot = (mod: Record<string, unknown>, label: string) => {
  if (typeof mod.RequestClient !== 'function') throw new Error(`${label} RequestClient missing`);
  for (const key of rootErrors) {
    if (!(key in mod)) throw new Error(`${label} ${key} missing`);
  }
};

const root = await import(distIndex.href);
checkRoot(root, 'root');

console.log('Deno smoke passed');

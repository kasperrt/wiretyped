---
title: Error Handling
outline: deep
---

# Error Handling

WireTyped returns `[error, data]` tuples; the `error` half is either `null`, one of the typed errors below, or a plain `Error` if the case is not covered by a custom class.

## Error types

- `HTTPError`: Non-2xx HTTP response; inspect `.response` (cloned) for status/body.
- `ValidationError`: Request/response validation failed; `.issues` lists Standard Schema issues.
- `TimeoutError`: Request exceeded the configured timeout (also used when opening SSE connections takes too long).
- `AbortError`: The request was deliberately aborted via `AbortController`/signal.
- `ConstructURLError`: URL building failed (bad/missing `$path` or `$search` values); `.url` holds the failing URL template/result.
- `RetrySuppressedError`: Retry loop stopped early (stop/ignore code/state); `.attempts` shows how many tries happened.
- `RetryExhaustedError`: Retry loop hit its limit; `.attempts` shows total tries.

Use `isX` / `getX` helpers (e.g., `isHttpError`, `getValidationError`) to safely narrow or unwrap errors, even when they are nested in `cause`.

## Utilities

### Helpers

`wiretyped` exports helpers for richer error handling:

```ts
import { getHttpError, isTimeoutError } from 'wiretyped';

const [err, user] = await client.get('/users/{id}', { $path: { id: '123' } });
if (err) {
  const httpError = getHttpError(err);
  if (httpError) {
    console.error('request failed with status', httpError.status);
    return;
  }
  if (isTimeoutError(err)) {
    console.error('request timed out');
    return;
  }
  return;
}
```

### `isErrorType`

Generic type guard that works for any error class and follows `error.cause` by default:

```ts
import { isErrorType, ValidationError } from 'wiretyped';

const [err] = await client.get('/users/{id}', { $path: { id: '123' } });
if (!err) {
  return;
}

if (isErrorType(ValidationError, err)) {
  // TypeScript now knows `err` is a ValidationError (even if it was wrapped in a cause chain)
  console.error(err.issues);
}
```

If you only want to match the top-level error (no `cause` traversal), pass `true` as the third arg: `isErrorType(ValidationError, err, true)` (or use `instanceof` directly).

### `unwrapErrorType`

Extract an error instance from an unknown error value, following nested causes:

```ts
import { unwrapErrorType, ValidationError } from 'wiretyped';

const [err] = await client.get('/users/{id}', { $path: { id: '123' } });
if (!err) {
  return;
}

const validation = unwrapErrorType(ValidationError, err);
if (validation) {
  console.error(validation.issues);
}
```

## What's next

- Check supported imports and entrypoints in [`/reference/entrypoints`](/reference/entrypoints).
- See provider interfaces in [`/reference/providers`](/reference/providers).
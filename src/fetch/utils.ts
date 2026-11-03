import type { HeaderOptions } from '../types/request.js';

/** Turns a header value into a string. Objects, functions, and symbols are dropped. */
function headerText<Value>(value: Value): string | null {
  const type = typeof value;
  return type === 'object' || type === 'function' || type === 'symbol' ? null : String(value);
}

/** Normalizes the different header container shapes into one iterable. */
function toEntries(headers?: HeaderOptions): Iterable<[string, string | null]> {
  if (!headers) {
    return [];
  }

  if (headers instanceof Headers) {
    return headers.entries();
  }

  if (Array.isArray(headers)) {
    return headers;
  }

  return Object.entries(headers);
}

/**
 * Merge global and local headers into a single `Headers` instance, normalizing keys.
 */
export function mergeHeaderOptions(globalHeaders?: HeaderOptions, localHeaders?: HeaderOptions): Headers {
  const merged = new Headers();

  for (const [key, value] of [...toEntries(globalHeaders), ...toEntries(localHeaders)]) {
    if (value == null) {
      merged.delete(key);
      continue;
    }

    const clean = headerText(value);
    if (clean !== null) {
      merged.set(key, clean);
    }
  }

  return merged;
}

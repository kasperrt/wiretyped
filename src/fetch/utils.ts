import type { HeaderOptions } from '../types/request.js';

/**
 * Filters out unsupported values and turns remaining into strings.
 */
function sanitize(value: unknown): string | null {
  const type = typeof value;
  return type === 'object' || type === 'function' || type === 'symbol' ? null : String(value);
}

/**
 * Normalizes the different header container shapes into a consistent iterable.
 */
function toEntries(headers?: HeaderOptions): Iterable<[string, unknown]> {
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

    const clean = sanitize(value);
    if (clean !== null) {
      merged.set(key, clean);
    }
  }

  return merged;
}

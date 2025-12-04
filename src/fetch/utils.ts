import type { HeaderOptions } from '../types/request';

function headerOptionsToObject(h?: HeaderOptions): Record<string, string> {
  if (!h) {
    return {};
  }

  if (h instanceof Headers) {
    return Object.fromEntries(h.entries());
  }

  if (Array.isArray(h)) {
    h = Object.fromEntries(h);
  }

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(h)) {
    if (
      typeof value !== 'string' &&
      typeof value !== 'bigint' &&
      typeof value !== 'boolean' &&
      typeof value !== 'number'
    ) {
      continue;
    }
    result[key.toLowerCase()] = `${value}`;
  }

  return result;
}

/**
 * Merge global and local headers into a single `Headers` instance, normalizing keys.
 */
export function mergeHeaderOptions(globalHeaders?: HeaderOptions, localHeaders?: HeaderOptions): Headers {
  const mergedObj = {
    ...headerOptionsToObject(globalHeaders),
    ...headerOptionsToObject(localHeaders),
  };

  return new Headers(mergedObj);
}

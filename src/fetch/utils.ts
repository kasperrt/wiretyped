import type { HeaderOptions } from '../types/request';

/**
 * Normalizes various header representations into a lowercase string map.
 */
function headerOptionsToObject(h?: HeaderOptions): Record<string, string | undefined> {
  if (!h) {
    return {};
  }

  if (h instanceof Headers) {
    const result: Record<string, string> = {};
    for (const [key, value] of h.entries()) {
      result[key.toLowerCase()] = value;
    }
    return result;
  }

  if (Array.isArray(h)) {
    h = Object.fromEntries(h);
  }

  const result: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(h)) {
    if (value === undefined || value === null) {
      result[key.toLowerCase()] = undefined;
      continue;
    }
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
  };

  for (const [key, value] of Object.entries(headerOptionsToObject(localHeaders))) {
    if (value === undefined) {
      delete mergedObj[key];
      continue;
    }
    mergedObj[key] = value;
  }

  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(mergedObj)) {
    if (value === undefined) {
      continue;
    }
    cleaned[key] = value;
  }

  return new Headers(cleaned);
}

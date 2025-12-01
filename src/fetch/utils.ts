import type { HeaderOptions } from './types';

function headerOptionsToObject(h?: HeaderOptions): Record<string, string> {
  if (!h) {
    return {};
  }

  if (h instanceof Headers) {
    return Object.fromEntries(h.entries());
  }

  if (Array.isArray(h)) {
    return Object.fromEntries(h);
  }

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(h)) {
    result[key.toLowerCase()] = value as string;
  }

  return result;
}

export function mergeHeaderOptions(globalHeaders?: HeaderOptions, localHeaders?: HeaderOptions): Headers {
  const mergedObj = {
    ...headerOptionsToObject(globalHeaders),
    ...headerOptionsToObject(localHeaders),
  };

  return new Headers(mergedObj);
}

import type { EndpointsWithMethod, HttpMethod, Params, RequestDefinitions } from '../core/types';
import { validator } from './validator';
import type { SafeWrapAsync } from './wrap';

/**
 * Constructs a relative URL by replacing path parameters and appending query parameters.
 * Handles strict validation of $path and $search if enabled.
 */
export async function constructUrl<
  Method extends HttpMethod,
  Schema extends RequestDefinitions,
  Endpoint extends EndpointsWithMethod<Method, Schema> & string,
>(
  path: Endpoint,
  params: Params<Schema, Endpoint, Method>,
  schema: Schema[Endpoint][Method],
  validation?: boolean,
): SafeWrapAsync<Error, string> {
  const searchParams = new URLSearchParams();
  let result = path.toString();

  if (!params) {
    if (result.startsWith('/')) {
      result = result.substring(1);
    }

    // Check for remaining unreplaced braces
    if (result.includes('{') || result.includes('}')) {
      return [new Error(`error constructing URL, path contains {} ${result}`), null];
    }

    return [null, result];
  }

  // 1. Handle Query Params ($search)
  if ('$search' in params && schema?.$search) {
    let data = params.$search;

    if (validation) {
      const [errParse, parsed] = await validator(params.$search, schema.$search);
      if (errParse) {
        return [new Error(`error extracting search params`, { cause: errParse }), null];
      }
      data = parsed;
    }

    if (data) {
      for (const [key, value] of Object.entries(data)) {
        if (value === undefined || value === null) {
          continue;
        }
        searchParams.set(key, String(value));
      }
    }
  }

  // 2. Handle $path Object Params
  if ('$path' in params && schema?.$path) {
    let data = params.$path;
    if (validation) {
      const [errParse, parsed] = await validator(params.$path, schema.$path);
      if (errParse) {
        return [new Error(`error $path validation failed`, { cause: errParse }), null];
      }
      data = parsed;
    }

    for (const [key, value] of Object.entries(data ?? {})) {
      result = result.replace(new RegExp(`{${key}}`, 'g'), encodeURIComponent(String(value)));
    }
  }

  // 3. Handle Direct Key Params (replacing {param} in URL)
  // We skip $search and $path as they are handled above
  for (const [key, value] of Object.entries(params)) {
    if (key === '$search' || key === '$path') {
      continue;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      result = result.replace(new RegExp(`{${key}}`, 'g'), encodeURIComponent(String(value)));
    }
  }

  // 4. Finalize URL
  if (searchParams.size > 0) {
    result += `?${searchParams.toString()}`;
  }

  // Check for remaining unreplaced braces
  if (result.includes('{') || result.includes('}')) {
    return [new Error(`error constructing URL, remaining contains {} still ${result}`), null];
  }

  // Strip leading slash for clean concatenation with baseUrl
  if (result.startsWith('/')) {
    return [null, result.substring(1)];
  }

  return [null, result];
}

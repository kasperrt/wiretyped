import type { EndpointsWithMethod, HttpMethod, Params, RequestDefinitions } from '../core/types';
import type { SafeWrap } from './wrap';

/**
 * Constructs a relative URL by replacing path parameters and appending query parameters.
 * Handles strict validation of $path and $search if enabled.
 */
export function constructUrl<
  Endpoint extends EndpointsWithMethod<Method, Schema> & string,
  Method extends HttpMethod,
  Schema extends RequestDefinitions,
>(
  path: Endpoint,
  params: Params<Endpoint, Method, Schema>,
  schema: Schema[Endpoint][Method],
  validate?: boolean,
): SafeWrap<Error, string> {
  const searchParams = new URLSearchParams();
  let result = path.toString();

  if (!params) {
    if (result.startsWith('/')) {
      result = result.substring(1);
    }
    return [null, result];
  }

  // 1. Handle Query Params ($search)
  if ('$search' in params && schema?.$search) {
    let data = params.$search as Record<string, unknown>;

    if (validate) {
      const parsed = schema.$search.safeParse(params.$search ?? {});
      if (parsed.error) {
        return [new Error(`error extracting search params`, { cause: parsed.error }), null];
      }
      data = parsed.data as Record<string, unknown>;
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
    let data = params.$path as Record<string, unknown>;
    if (validate) {
      const parsed = schema.$path.safeParse(params.$path);
      if (!parsed.success) {
        return [new Error(`error $path validation failed: ${parsed.error.message}`), null];
      }
      data = parsed.data as Record<string, unknown>;
    }

    for (const [key, value] of Object.entries(data ?? {})) {
      result = result.replace(new RegExp(`{${key}}`, 'g'), String(value));
    }
  }

  // 3. Handle Direct Key Params (replacing {param} in URL)
  // We skip $search and $path as they are handled above
  for (const [key, value] of Object.entries(params)) {
    if (key === '$search' || key === '$path') {
      continue;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      result = result.replace(new RegExp(`{${key}}`, 'g'), String(value));
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

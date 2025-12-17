import type { FetchResponse } from '../types/request.js';
import { type SafeWrapAsync, safeWrap, safeWrapAsync } from './wrap.js';

/**
 * Safely extracts and parses the response body into a tuple-style result.
 *
 * Behavior:
 * - If the response has status 204 (No Content), it returns `[null, null]`.
 * - If the `Content-Type` includes `application/json`, it tries to parse JSON via `response.json()`.
 *   - On JSON parse failure, it returns `[Error, null]` with the original error as `cause`.
 *   - On success, it returns `[null, parsedJson]`.
 * - For all other content types, it reads the body as text via `response.text()`.
 *   - On text read failure, it returns `[Error, null]` with the original error as `cause`.
 *   - If the text body is empty, it returns `[null, null]`.
 *   - Otherwise, it returns `[null, text]` cast to `ReturnValue`.
 *
 * @template ReturnValue
 * @param {FetchResponse} response - The HTTP response to extract data from.
 * @returns {Promise<SafeWrapAsync<Error, ReturnValue>>}
 *   A promise resolving to a tuple `[error, value]` where `error` is an `Error | null`
 *   and `value` is the parsed body (`ReturnValue | null`).
 */
export async function getResponseData<ReturnValue>(response: FetchResponse): SafeWrapAsync<Error, ReturnValue> {
  // Per HTTP spec, 204 + 205 shouldn't have a body
  if (response.status === 204 || response.status === 205) {
    return [null, null as ReturnValue];
  }

  // Use .text as reader, since double reads with text -> json would cause TypeError
  // due to the body being consumed already
  const [errText, text] = await safeWrapAsync(() => response.text());
  if (errText) {
    return [new Error('error reading response body in getResponseData', { cause: errText }), null];
  }

  if (!text) {
    return [null, null as ReturnValue];
  }

  const contentType = response?.headers?.get('Content-Type')?.toLowerCase();
  if (!contentType?.includes('application/json') && !contentType?.includes('+json')) {
    return [null, text as ReturnValue];
  }

  const [errJson, json] = safeWrap(() => JSON.parse(text));
  if (errJson) {
    return [new Error('error parsing json response body in getResponseData', { cause: errJson }), null];
  }

  return [null, json];
}

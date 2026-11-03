import type { FetchResponse } from '../types/request.js';
import { type SafeWrapAsync, safeWrap, safeWrapAsync } from './wrap.js';

/**
 * Safely extracts and parses the response body into a tuple-style result.
 *
 * Behavior:
 * - If the response has status 204 or 205, it returns `[null, null]`.
 * - If the `Content-Type` includes JSON, it parses the body with `JSON.parse`.
 *   - On parse failure, it returns `[Error, null]` with the original error as `cause`.
 *   - On success, it returns `[null, parsedJson]`.
 * - For all other content types, it reads the body via `response.text()`.
 *   - On text read failure, it returns `[Error, null]` with the original error as `cause`.
 *   - If the text body is empty, it returns `[null, null]`.
 *   - Otherwise, it returns `[null, text]`.
 *
 * @param response - The HTTP response to extract data from.
 * @returns A promise resolving to `[error, value]` where `value` is JSON, text, or `null`.
 */
export async function getResponseData<ReturnValue>(response: FetchResponse): SafeWrapAsync<Error, ReturnValue> {
  // Per HTTP spec, 204 + 205 shouldn't have a body
  if (response.status === 204 || response.status === 205) {
    return [null, null as ReturnValue];
  }

  // Read once with text(). A later JSON parse uses that string, because a second
  // body read would throw.
  const [errText, text] = await safeWrapAsync(() => response.text());
  if (errText) {
    return [new Error('error reading response body in getResponseData', { cause: errText }), null];
  }

  if (!text) {
    return [null, null as ReturnValue];
  }

  const contentType = response.headers.get('Content-Type')?.toLowerCase();
  if (!contentType?.includes('application/json') && !contentType?.includes('+json')) {
    return [null, text as ReturnValue];
  }

  const [errJson, json] = safeWrap(() => JSON.parse(text));
  if (errJson) {
    return [new Error('error parsing json response body in getResponseData', { cause: errJson }), null];
  }

  return [null, json];
}

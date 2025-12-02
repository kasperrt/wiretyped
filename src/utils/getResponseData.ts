import type { FetchResponse } from '../fetch/types';
import { type SafeWrapAsync, safeWrapAsync } from './wrap';

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
  if (response.status === 204) {
    return [null, null as ReturnValue];
  }

  const contentType = response.headers.get('Content-Type');
  if (contentType?.includes('application/json')) {
    const [errJson, json] = await safeWrapAsync(() => response.json());
    if (errJson) {
      return [new Error('error parsing json in getResponseData', { cause: errJson }), null];
    }
    return [null, json];
  }

  const [errText, text] = await safeWrapAsync(() => response.text());
  if (errText) {
    return [new Error('error parsing text in getResponseData', { cause: errText }), null];
  }
  if (text === '') {
    return [null, null as ReturnValue];
  }

  return [null, text as ReturnValue];
}

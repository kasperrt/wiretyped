import type { FetchResponse } from '../fetch/types';
import { type SafeWrapAsync, safeWrapAsync } from './wrap';

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

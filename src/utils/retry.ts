import type { SafeWrapAsync } from './wrap';

interface RetryOptions<R> {
  name: string;
  fn: () => SafeWrapAsync<Error, R>;
  attempts?: number;
  timeout?: number;
  errFn?: (e: Error) => boolean;
  log?: boolean;
}

/**
 * Retry-function to keep retrying a function that can error for X-number
 * attempts with wait-times between each attempt
 *
 * `This is for functions that catches their own errors and return them in a tuple strcture like [Error,Response] `
 *
 * @param fn function to retry with timeout
 * @param attempts number of retry-attempts we want to perform
 * @param timeout how long the wait-time should be
 * @param errorFunction optional errorFunction on whether we want to skip retrying and propagate the error
 */
export function retry<R>({
  name,
  fn,
  attempts = 10,
  timeout = 1000,
  errFn,
  log = true,
}: RetryOptions<R>): SafeWrapAsync<Error, R> {
  const retrier = async (fn: () => SafeWrapAsync<Error, R>, attempt = 1): SafeWrapAsync<Error, R> => {
    const [err, data] = await fn();

    if (!err) {
      return [null, data as R];
    }

    if (typeof errFn === 'function' && errFn(err)) {
      if (log) {
        console.debug(`${name} retrier: Didn't match error-condition for retrier, aborting subsequent retries.`);
      }
      return [err, null];
    }
    if (attempt > attempts) {
      if (log) {
        console.debug(`${name} retrier: Attempts exceeded allowed number of retries.`);
      }
      return [err, null];
    }
    return new Promise((resolve) =>
      setTimeout(() => {
        resolve(retrier(fn, attempt + 1));
      }, timeout),
    );
  };

  return retrier(fn);
}

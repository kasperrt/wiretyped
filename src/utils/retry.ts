import { RetryExhaustedError } from '../error/retryExhaustedError.js';
import { RetrySuppressedError } from '../error/retrySuppressedError.js';
import { sleep } from './sleep.js';
import type { SafeWrapAsync } from './wrap.js';

/** Options for retry-function */
export interface RetryOptions<R> {
  /** Function to execute; must return a tuple-style result. */
  fn: () => SafeWrapAsync<Error, R>;
  /**
   * Maximum number of retries after the initial attempt (total tries = attempts + 1).
   * Passing 0 means "try once, then stop."
   */
  attempts?: number;
  /** Milliseconds to wait between attempts. */
  timeout?: number;
  /**
   * Predicate that decides whether to stop retrying.
   * Return true to stop retrying and surface the error, false to continue.
   */
  errFn?: (e: Error) => boolean;
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
 * @param errFn optional errorFunction on whether we want to skip retrying and propagate the error (true = stop, false = retry and move on)
 */
export async function retry<R = unknown>({
  fn,
  attempts = 10,
  timeout = 1000,
  errFn,
}: RetryOptions<R>): SafeWrapAsync<Error, R> {
  for (let attempt = 1; ; attempt += 1) {
    const [err, data] = await fn();
    if (!err) {
      return [null, data];
    }

    if (typeof errFn === 'function' && errFn(err)) {
      return [new RetrySuppressedError(`error further retries suppressed`, attempt, { cause: err }), null];
    }

    if (attempt > attempts) {
      return [new RetryExhaustedError(`error retries exhausted`, attempt, { cause: err }), null];
    }

    await sleep(timeout);
  }
}

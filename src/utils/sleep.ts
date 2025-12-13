/**
 * Waits for the given number of milliseconds.
 *
 * Useful for delaying execution in async code (e.g. retries, backoff, throttling).
 *
 * @param ms - The number of milliseconds to sleep for.
 * @returns A Promise that resolves after `ms` milliseconds.
 *
 * @example
 * await sleep(250);
 */
export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

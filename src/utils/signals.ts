import { AbortError } from '../error/abortError';
import { TimeoutError } from '../error/timeoutError';

/**
 * Creates an {@link AbortSignal} that will automatically abort after
 * the specified timeout.
 *
 * When `timeoutMs` is `false` or `0`, no timeout signal is created.
 *
 * @param timeoutMs - Timeout in milliseconds, or `false` to disable.
 * @returns An `AbortSignal` that aborts after the timeout, or `null`.
 */
export function createTimeoutSignal(timeoutMs?: number | false): AbortSignal | null {
  if (!timeoutMs) {
    return null;
  }

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(new TimeoutError(`error request timed out after ${timeoutMs}ms`)),
    timeoutMs,
  );

  controller.signal.addEventListener('abort', () => clearTimeout(timeout), {
    once: true,
  });

  return controller.signal;
}

/**
 * Merges multiple {@link AbortSignal} instances into a single signal.
 *
 * Behavior:
 * - If no signals are provided, returns `null`.
 * - If a single signal is provided, it is returned as-is.
 * - If multiple signals are provided, a new `AbortController` is created
 *   and will abort when any of the source signals abort.
 * - Attempts to preserve the abort `reason` when available, otherwise
 *   aborts with an {@link AbortError}.
 *
 * @param signals - List of signals to merge (nullable/undefined allowed).
 * @returns A single `AbortSignal` or `null` if all inputs are nullish.
 */
export function mergeSignals(signals: Array<AbortSignal | null | undefined>): AbortSignal | null {
  const active: AbortSignal[] = signals.filter((s): s is AbortSignal => s !== null && s !== undefined);

  if (active.length === 0) {
    return null;
  }

  if (active.length === 1) {
    return active[0];
  }

  const controller = new AbortController();
  const listeners: VoidFunction[] = [];
  const abortFrom = (source: AbortSignal) => {
    if ('reason' in source) {
      controller.abort(source.reason);
      return;
    }

    controller.abort(new AbortError('error signal triggered with unknown reason'));
  };

  controller.signal.addEventListener('abort', () => {
    for (const remove of listeners) {
      remove();
    }
  });

  for (const signal of active) {
    if (signal.aborted) {
      abortFrom(signal);
      break;
    }

    const abort = () => abortFrom(signal);
    signal.addEventListener('abort', abort, { once: true });
    listeners.push(() => signal.removeEventListener('abort', abort));
  }

  return controller.signal;
}

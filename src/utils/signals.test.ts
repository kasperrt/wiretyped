import { afterEach, describe, expect, it, vi } from 'vitest';
import { AbortError } from '../error/abortError.js';
import { TimeoutError } from '../error/timeoutError.js';
import { createTimeoutSignal, mergeSignals } from './signals.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('createTimeoutSignal', () => {
  it('returns null when disabled', () => {
    expect(createTimeoutSignal()).toBeNull();
    expect(createTimeoutSignal(0)).toBeNull();
    expect(createTimeoutSignal(false)).toBeNull();
  });

  it('aborts after the configured timeout with a TimeoutError', async () => {
    vi.useFakeTimers();
    const signal = createTimeoutSignal(50);

    expect(signal).not.toBeNull();
    expect(signal?.aborted).toBe(false);

    const reasonPromise = new Promise<unknown>((resolve) => {
      signal?.addEventListener('abort', () => resolve(signal?.reason), { once: true });
    });

    await vi.advanceTimersByTimeAsync(50);
    const reason = await reasonPromise;

    expect(signal?.aborted).toBe(true);
    expect(reason).toBeInstanceOf(TimeoutError);
    expect((reason as TimeoutError).message).toBe('error request timed out after 50ms');
  });

  it('creates independent signals for separate invocations', () => {
    vi.useFakeTimers();

    const first = createTimeoutSignal(10);
    const second = createTimeoutSignal(20);

    expect(first).not.toBe(second);

    vi.advanceTimersByTime(15);

    expect(first?.aborted).toBe(true);
    expect(second?.aborted).toBe(false);
  });
});

describe('mergeSignals', () => {
  it('returns null when no signals are provided', () => {
    expect(mergeSignals([])).toBeNull();
    expect(mergeSignals([null, undefined])).toBeNull();
  });

  it('returns the single active signal when only one is provided', () => {
    const controller = new AbortController();
    expect(mergeSignals([controller.signal])).toBe(controller.signal);
  });

  it('propagates aborts and preserves the provided reason', () => {
    const controllerA = new AbortController();
    const controllerB = new AbortController();

    const merged = mergeSignals([controllerA.signal, controllerB.signal]);

    expect(merged).not.toBeNull();

    const abortReason = new AbortError('external abort');
    controllerB.abort(abortReason);

    expect(merged?.aborted).toBe(true);
    expect(merged?.reason).toBe(abortReason);
  });

  it('uses AbortError fallback when an already-aborted signal lacks a reason', () => {
    const fakeSignal = {
      aborted: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as AbortSignal;

    const merged = mergeSignals([fakeSignal, new AbortController().signal]);

    expect(merged).not.toBeNull();
    expect(merged?.aborted).toBe(true);

    const reason = merged?.reason as AbortError;
    expect(reason).toBeInstanceOf(AbortError);
    expect(reason.message).toBe('error signal triggered with unknown reason');
  });

  it('immediately aborts when merging an already-aborted signal with a reason', () => {
    const controller = new AbortController();
    const reason = new Error('existing abort');
    controller.abort(reason);

    const merged = mergeSignals([controller.signal, new AbortController().signal]);

    expect(merged?.aborted).toBe(true);
    expect(merged?.reason).toBe(reason);
  });

  it('cleans up listeners after the merged signal aborts', () => {
    const createFakeSignal = (reason?: unknown) => {
      let aborted = false;
      const listeners: VoidFunction[] = [];
      const signal = {
        get aborted() {
          return aborted;
        },
        reason,
        addEventListener: vi.fn((_: 'abort', listener: VoidFunction) => {
          listeners.push(listener);
        }),
        removeEventListener: vi.fn((_: 'abort', listener: VoidFunction) => {
          const idx = listeners.indexOf(listener);
          if (idx !== -1) {
            listeners.splice(idx, 1);
          }
        }),
      } as unknown as AbortSignal;

      const triggerAbort = () => {
        aborted = true;
        for (const listener of [...listeners]) {
          listener();
        }
      };

      return { signal, triggerAbort };
    };

    const sourceA = createFakeSignal(new AbortError('reason A'));
    const sourceB = createFakeSignal();

    const merged = mergeSignals([sourceA.signal, sourceB.signal]);

    expect(merged?.aborted).toBe(false);

    sourceA.triggerAbort();

    expect(merged?.aborted).toBe(true);
    expect(sourceA.signal.removeEventListener).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(sourceB.signal.removeEventListener).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});

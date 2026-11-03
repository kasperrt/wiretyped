/** Tuple-based result used throughout the client, `[error, data]`. */
export type SafeWrap<ErrorType extends Error = Error, DataType = never> =
  | [error: ErrorType, data: null]
  | [error: null, data: DataType];

/** Async variant of {@link SafeWrap}. */
export type SafeWrapAsync<ErrorType extends Error = Error, DataType = never> = Promise<SafeWrap<ErrorType, DataType>>;

/**
 * Gracefully handles a given Promise factory.
 * @example
 * const [error, data] = await safeWrapAsync(() => asyncAction());
 */
export async function safeWrapAsync<DataType>(promise: () => Promise<DataType>): SafeWrapAsync<Error, DataType> {
  try {
    const data = await promise();
    return [null, data];
  } catch (caught) {
    return [caught as Error, null];
  }
}

/** Wrap a synchronous function in a tuple-style result. */
export function safeWrap<DataType>(fn: () => DataType): SafeWrap<Error, DataType> {
  try {
    const data = fn();
    return [null, data];
  } catch (caught) {
    return [caught as Error, null];
  }
}

export type SafeWrap<ErrorType = Error, DataType = unknown> =
  | [error: ErrorType, data: null]
  | [error: null, data: DataType];

export type SafeWrapAsync<ErrorType = Error, DataType = unknown> = Promise<SafeWrap<ErrorType, DataType>>;

/**
 * Gracefully handles a given Promise factory.
 * @example
 * const [error, data] = await safeWrapAsync(() => asyncAction());
 */
export async function safeWrapAsync<ErrorType = Error, DataType = unknown>(
  promise: () => Promise<DataType>,
): SafeWrapAsync<ErrorType, DataType> {
  try {
    const data = await promise();
    return [null, data];
  } catch (error) {
    return [error as ErrorType, null];
  }
}

export function safeWrap<ErrorType = Error, DataType = unknown>(fn: () => DataType): SafeWrap<ErrorType, DataType> {
  try {
    const data = fn();
    return [null, data];
  } catch (error) {
    return [error as ErrorType, null];
  }
}

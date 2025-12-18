import { safeWrap } from './wrap.js';

/**
 * Attempts to parse a string as JSON.
 *
 * If parsing succeeds, returns the parsed value; otherwise returns the original input unchanged.
 * This function never throws.
 *
 * @param input - The string to parse.
 * @returns The parsed JSON value, or `input` if it isn't valid JSON.
 */
export function tryParse(input: string): unknown {
  const [errParsed, parsed] = safeWrap(() => JSON.parse(input));
  if (errParsed) {
    return input;
  }

  return parsed;
}

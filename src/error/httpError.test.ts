import { describe, expect, it } from 'vitest';
import { HTTPError, isHttpError } from './httpError';

describe('isErrorType', () => {
  it('expect shallow to correctly return true', () => {
    const err = new HTTPError(new Response(null, { status: 400 }));

    expect(isHttpError(err)).toEqual(true);
  });
});

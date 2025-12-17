import { describe, expect, it } from 'vitest';
import { getHttpError, HTTPError, isHttpError } from './httpError.js';

describe('HTTPError', () => {
  it('expect shallow to correctly return true', () => {
    const err = new HTTPError(new Response(null, { status: 400 }));

    expect(isHttpError(err)).toEqual(true);
  });

  it('expect weird shaped object to not crash', () => {
    const errorResponse = {
      ok: false,
      status: 401,
      json: async () => ({ error: true }),
    } as Response;
    const err = new HTTPError(errorResponse);
    expect(getHttpError(err)?.response.status).toBe(401);
  });
});
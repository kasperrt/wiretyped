import { describe, expect, it } from 'vitest';
import type { FetchResponse } from '../fetch/types';
import { getResponseData } from './getResponseData';

describe('getResponseData - JSON fallback', () => {
  it('returns an error when json() fails with TypeError and text() also fails', async () => {
    const textError = new Error('text broken');
    const response = {
      json: () => {
        throw new TypeError('parse error');
      },
      text: () => {
        throw textError;
      },
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
    } as unknown as FetchResponse;

    const [err, value] = await getResponseData(response);

    expect(value).toBeNull();
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toBe('error attempting string parse after json failed in getResponseData');
    expect(err?.cause).toBe(textError);
  });

  it('returns an error when json() fails with TypeError and string JSON.parse fails', async () => {
    const jsonError = new TypeError('json broken');
    const response = {
      json: () => {
        throw jsonError;
      },
      text: () => '{bad json}',
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
    } as unknown as FetchResponse;

    const [err, value] = await getResponseData(response);

    expect(value).toBeNull();
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toBe('error json-parse string after json failed in getResponseData');
    expect(err?.cause).toBeInstanceOf(SyntaxError);
  });

  it('falls back to parsing text when json() throws TypeError and text contains valid json', async () => {
    const jsonError = new TypeError('json broken');
    const response = {
      json: () => {
        throw jsonError;
      },
      text: () => '{"ok":true}',
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
    } as unknown as FetchResponse;

    const [err, value] = await getResponseData<{ ok: boolean }>(response);

    expect(err).toBeNull();
    expect(value).toEqual({ ok: true });
  });
});

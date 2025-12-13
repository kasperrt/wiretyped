import { describe, expect, it } from 'vitest';
import z from 'zod';
import type { RequestDefinitions } from '../core/types.js';
import { ConstructURLError, getConstructURLError, isConstructURLError } from '../error/constructUrlError.js';
import { constructUrl } from './constructUrl.js';

describe('constructUrl', () => {
  it('URI-encodes $path params, inline params, and $search params', async () => {
    const schema = {
      '/integrations/{integration}/files/{fileName}': {
        get: {
          $path: z.object({
            integration: z.literal('slack github'),
          }),
          $search: z.object({
            q: z.string(),
            tag: z.string(),
          }),
          response: z.string(),
        },
      },
    } satisfies RequestDefinitions;

    const [err, url] = await constructUrl<'get', typeof schema, '/integrations/{integration}/files/{fileName}'>(
      '/integrations/{integration}/files/{fileName}',
      {
        $path: { integration: 'slack github' },
        fileName: 'file/name',
        $search: { q: 'query param', tag: 'a+b' },
      },
      schema['/integrations/{integration}/files/{fileName}'].get,
      false,
    );

    expect(err).toBeNull();
    expect(url).toBe('integrations/slack%20github/files/file%2Fname?q=query+param&tag=a%2Bb');
  });

  it('errors when required path params are missing', async () => {
    const schema = {
      '/users/{id}': {
        get: {
          response: z.string(),
        },
      },
    } satisfies RequestDefinitions;

    const [err, url] = await constructUrl<'get', typeof schema, '/users/{id}'>(
      '/users/{id}',
      // @ts-expect-error
      null,
      schema['/users/{id}'].get,
      false,
    );

    expect(url).toBeNull();
    expect(err).toBeInstanceOf(ConstructURLError);
    expect(getConstructURLError(err)?.url).toBe('users/{id}');
    expect(isConstructURLError(err)).toBe(true);
    expect(err?.message).toContain('path contains {}');
  });

  it('errors when path params are wrong', async () => {
    const schema = {
      '/users/{id}': {
        get: {
          $path: z.object({
            id: z.number(),
          }),
          response: z.string(),
        },
      },
    } satisfies RequestDefinitions;

    const [err, url] = await constructUrl<'get', typeof schema, '/users/{id}'>(
      '/users/{id}',
      {
        $path:
          // @ts-expect-error
          { id: 'test' },
      },
      schema['/users/{id}'].get,
      true,
    );

    expect(url).toBeNull();
    expect(err).toBeInstanceOf(ConstructURLError);
    expect(getConstructURLError(err)?.url).toBe('users/{id}');
    expect(isConstructURLError(err)).toBe(true);
    expect(err?.message).toContain('error $path validation failed');
  });
});

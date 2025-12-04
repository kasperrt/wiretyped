import { describe, expect, it } from 'vitest';
import z from 'zod';
import type { RequestDefinitions } from '../core/types';
import { constructUrl } from './constructUrl';

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
});

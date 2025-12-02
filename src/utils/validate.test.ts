import type { StandardSchemaV1 } from '@standard-schema/spec';
import z from 'zod';
import { ValidationError } from '../error/validationError';
import { validate } from './validate';

describe('validate', () => {
  it('correct schema validates to correct', async () => {
    const data = { foo: 'bar' };
    const schema = z.object({ foo: z.string() });
    const [err, parsed] = await validate(data, schema);

    expect(err).toBeNull();
    expect(parsed).toEqual(data);
  });

  it('returns error when validation throws', async () => {
    const schema: StandardSchemaV1<unknown, string> = {
      // @ts-expect-error - minimal runtime shape for the test
      '~standard': {
        validate: async () => {
          await Promise.resolve();
          throw new Error('boom');
        },
      },
    };

    const [err, value] = await validate({}, schema);

    expect(value).toBeNull();
    expect(err).toBeInstanceOf(ValidationError);
    expect(err?.message).toBe('error validating async data; issues: []');
  });

  it('returns string when valid when validation throws', async () => {
    const schema: StandardSchemaV1<unknown, string> = {
      // @ts-expect-error - minimal runtime shape for the test
      '~standard': {
        validate: async (input) => {
          return (await Promise.resolve({ value: input })) as StandardSchemaV1.Result<string>;
        },
      },
    };

    const [err, value] = await validate('test', schema);

    expect(value).toBe('test');
    expect(err).toBeNull;
  });
});

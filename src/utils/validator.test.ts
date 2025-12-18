import type { StandardSchemaV1 } from '@standard-schema/spec';
import { describe, expect, it } from 'vitest';
import z from 'zod';
import { ValidationError } from '../error/validationError.js';
import { validator } from './validator.js';

describe('validate', () => {
  it('correct schema validates to correct', async () => {
    const data = { foo: 'bar' };
    const schema = z.object({ foo: z.string() });
    const [err, parsed] = await validator(data, schema);

    expect(err).toBeNull();
    expect(parsed).toEqual(data);
  });

  it('returns error when async validation throws', async () => {
    const schema: StandardSchemaV1<unknown, string> = {
      // @ts-expect-error - minimal runtime shape for the test
      '~standard': {
        // biome-ignore lint/suspicious/useAwait: Forcing this to throw directly
        validate: async () => {
          throw new Error('oops');
        },
      },
    };

    const [err, value] = await validator({}, schema);

    expect(value).toBeNull();
    expect(err).toBeInstanceOf(ValidationError);
    expect(err?.message).toBe('error validating async data; issues: []');
  });

  it('returns error when sync validation throws', async () => {
    const schema: StandardSchemaV1<unknown, string> = {
      // @ts-expect-error - minimal runtime shape for the test
      '~standard': {
        validate: () => {
          throw new Error('oops');
        },
      },
    };

    const [err, value] = await validator({}, schema);

    expect(value).toBeNull();
    expect(err).toBeInstanceOf(ValidationError);
    expect(err?.message).toBe('error validating on validation start; issues: []');
    expect((err?.cause as Error).message).toBe('oops');
  });

  it('returns error when validation returns empty result', async () => {
    const schema: StandardSchemaV1<unknown, string> = {
      '~standard': {
        // @ts-expect-error - deliberately violating the contract to hit defensive branch
        validate: () => null,
      },
    };

    const [err, value] = await validator('test', schema);

    expect(value).toBeNull();
    expect(err).toBeInstanceOf(ValidationError);
    expect(err?.message).toBe('error validation failed with empty results; issues: []');
  });

  it('returns error when validation returns truthy result', async () => {
    const schema: StandardSchemaV1<unknown, string> = {
      '~standard': {
        // @ts-expect-error - deliberately violating the contract to hit defensive branch
        validate: () => true,
      },
    };

    const [err, value] = await validator('test', schema);

    expect(value).toBeNull();
    expect(err).toBeInstanceOf(ValidationError);
    expect(err?.message).toBe('error validation failed with empty results; issues: []');
  });

  it('returns string when valid when async validation returns result', async () => {
    const schema: StandardSchemaV1<unknown, string> = {
      // @ts-expect-error - minimal runtime shape for the test
      '~standard': {
        validate: async (input) => {
          return (await Promise.resolve({ value: input })) as StandardSchemaV1.Result<string>;
        },
      },
    };

    const [err, value] = await validator('test', schema);

    expect(value).toBe('test');
    expect(err).toBeNull();
  });
});

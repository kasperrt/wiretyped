import z from 'zod';
import { validate } from './validate';

describe('validate', () => {
  it('correct schema validates to correct', async () => {
    const data = { foo: 'bar' };
    const schema = z.object({ foo: z.string() });
    const [err, parsed] = await validate(data, schema);

    expect(err).toBeNull();
    expect(parsed).toEqual(data);
  });
});

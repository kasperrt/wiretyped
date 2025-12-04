import { describe, expect, test } from 'vitest';
import { mergeHeaderOptions } from './utils';

describe('mergeHeaderOptions', () => {
  test('merge two-dimensional arrays', () => {
    const merged = mergeHeaderOptions([['a', 'b']], [['c', 'd']]);

    expect(merged).toEqual(new Headers({ a: 'b', c: 'd' }));
  });

  test('last array takes precedence', () => {
    const merged = mergeHeaderOptions([['a', 'b']], [['a', 'd']]);

    expect(merged).toEqual(new Headers({ a: 'd' }));
  });

  test('merge objects', () => {
    const merged = mergeHeaderOptions({ a: 'b' }, { c: 'd' });

    expect(merged).toEqual(new Headers({ a: 'b', c: 'd' }));
  });

  test('merge objects with bad values', () => {
    // @ts-expect-error
    const merged = mergeHeaderOptions({ a: 1 }, { c: true });

    expect(merged).toEqual(new Headers({ a: '1', c: 'true' }));
  });

  test('merge objects with bad values', () => {
    // @ts-expect-error
    const merged = mergeHeaderOptions({ a: 1 }, { c: true, badValue: { nested: 'data' } });

    expect(merged).toEqual(new Headers({ a: '1', c: 'true' }));
  });

  test('last objects takes presedence', () => {
    const merged = mergeHeaderOptions({ a: 'b' }, { a: 'd' });

    expect(merged).toEqual(new Headers({ a: 'd' }));
  });

  test('merge headers', () => {
    const merged = mergeHeaderOptions(new Headers({ a: 'b' }), new Headers({ c: 'd' }));

    expect(merged).toEqual(new Headers({ a: 'b', c: 'd' }));
  });

  test('last header takes presedence', () => {
    const merged = mergeHeaderOptions(new Headers({ a: 'b' }), new Headers({ a: 'd' }));

    expect(merged).toEqual(new Headers({ a: 'd' }));
  });

  test('drops headers explicitly set to undefined/null', () => {
    const merged = mergeHeaderOptions({ keep: '1', remove: null }, { added: '2' });

    expect(merged).toEqual(new Headers({ keep: '1', added: '2' }));
    expect(merged.get('remove')).toBeNull();
  });
});

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
});

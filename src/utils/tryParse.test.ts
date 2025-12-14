import { describe, expect, it } from 'vitest';
import { tryParse } from './tryParse.js';

describe('tryParse', () => {
  it('parses JSON objects', () => {
    expect(tryParse('{"a":1,"b":"c"}')).toEqual({ a: 1, b: 'c' });
  });

  it('parses JSON arrays', () => {
    expect(tryParse('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('parses JSON primitives', () => {
    expect(tryParse('"hello"')).toBe('hello');
    expect(tryParse('123')).toBe(123);
    expect(tryParse('true')).toBe(true);
    expect(tryParse('null')).toBeNull();
  });

  it('returns the original input when JSON is invalid', () => {
    expect(tryParse('{')).toBe('{');
    expect(tryParse('01')).toBe('01');
    expect(tryParse('not json')).toBe('not json');
  });

  it('does not throw (returns input on parse errors)', () => {
    expect(() => tryParse('{bad json}')).not.toThrow();
    expect(tryParse('{bad json}')).toBe('{bad json}');
  });

  it('treats whitespace-only as invalid JSON and returns input unchanged', () => {
    expect(tryParse('   ')).toBe('   ');
  });
});

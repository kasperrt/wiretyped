import { describe, expect, it } from 'vitest';
import { ConstructURLError, getConstructURLError, isConstructURLError } from './constructUrlError.js';

describe('ConstructURLError', () => {
  it('exposes url via getter', () => {
    const err = new ConstructURLError('bad url', 'https://example.com');
    expect(err.url).toBe('https://example.com');
  });
});

describe('isConstructURLError', () => {
  it('returns true for instances of ConstructURLError', () => {
    const err = new ConstructURLError('bad url', 'https://example.com');
    expect(isConstructURLError(err)).toBe(true);
  });

  it('returns false for non ConstructURLError errors', () => {
    expect(isConstructURLError(new Error('boom'))).toBe(false);
  });
});

describe('getConstructURLError', () => {
  it('returns the error when passed directly', () => {
    const err = new ConstructURLError('bad url', 'https://example.com');
    expect(getConstructURLError(err)).toBe(err);
  });

  it('unwraps nested causes', () => {
    const err = new ConstructURLError('bad url', 'https://example.com');
    const wrapped = new Error('outer', { cause: err });
    expect(getConstructURLError(wrapped)).toBe(err);
  });

  it('returns null when no ConstructURLError exists', () => {
    const wrapped = new Error('outer', { cause: new Error('inner') });
    expect(getConstructURLError(wrapped)).toBeNull();
  });
});

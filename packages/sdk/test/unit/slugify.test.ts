import { describe, it, expect } from 'vitest';
import { slugify } from '../../src/slugify.js';

describe('slugify', () => {
  it('produces unique slugs for duplicate titles', () => {
    const seen = new Set<string>();
    const slug1 = slugify('My Screen', 'id-aaa', seen);
    const slug2 = slugify('My Screen', 'id-bbb', seen);
    expect(slug1).not.toBe(slug2);
  });

  it('falls back to screenId when title is empty', () => {
    const seen = new Set<string>();
    expect(slugify('', 'screen-abc', seen)).toBe('screen-abc');
  });

  it('strips special characters', () => {
    const seen = new Set<string>();
    expect(slugify('Hello World!', 'id-1', seen)).toBe('hello_world');
  });

  it('handles undefined title', () => {
    const seen = new Set<string>();
    expect(slugify(undefined as any, 'fallback-id', seen)).toBe('fallback-id');
  });
});

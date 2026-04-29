import { describe, it, expect } from 'vitest';
import { parseResourceName } from '../../src/index.js';

describe('parseResourceName', () => {
  it('should extract the bare ID from a multi-segment resource name', () => {
    expect(parseResourceName('projects/123/screens/abc')).toBe('abc');
  });

  it('should extract the ID from a single collection/id pair', () => {
    expect(parseResourceName('projects/123')).toBe('123');
  });

  it('should pass through a bare ID unchanged', () => {
    expect(parseResourceName('abc123')).toBe('abc123');
  });

  it('should handle deeply nested resource names', () => {
    expect(parseResourceName('projects/123/screens/abc/variants/v1')).toBe('v1');
  });

  it('should handle empty string', () => {
    expect(parseResourceName('')).toBe('');
  });

  it('should handle a resource name with a trailing slash', () => {
    // Edge case: trailing slash should return empty string (last segment)
    expect(parseResourceName('projects/123/')).toBe('');
  });
});

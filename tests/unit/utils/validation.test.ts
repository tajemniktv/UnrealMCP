import { describe, it, expect } from 'vitest';
import { normalizeMountedAssetPath } from '../../../src/utils/validation.js';

describe('normalizeMountedAssetPath', () => {
  it('should return default root for empty, null, or undefined paths', () => {
    expect(normalizeMountedAssetPath('')).toBe('/Game');
    expect(normalizeMountedAssetPath(null as any)).toBe('/Game');
    expect(normalizeMountedAssetPath(undefined as any)).toBe('/Game');
    // non-string
    expect(normalizeMountedAssetPath(123 as any)).toBe('/Game');
  });

  it('should use custom default root if provided', () => {
    expect(normalizeMountedAssetPath('', '/CustomRoot')).toBe('/CustomRoot');
  });

  it('should trim whitespace from path', () => {
    expect(normalizeMountedAssetPath('  /Game/Asset  ')).toBe('/Game/Asset');
  });

  it('should convert backslashes to forward slashes', () => {
    expect(normalizeMountedAssetPath('\\Game\\Asset')).toBe('/Game/Asset');
  });

  it('should reduce multiple slashes to a single slash', () => {
    expect(normalizeMountedAssetPath('//Game///Asset////Name')).toBe('/Game/Asset/Name');
  });

  it('should ensure the path starts with a slash', () => {
    expect(normalizeMountedAssetPath('Game/Asset')).toBe('/Game/Asset');
  });

  it('should return default root if path becomes empty or just a slash after normalization', () => {
    expect(normalizeMountedAssetPath('///')).toBe('/Game');
    expect(normalizeMountedAssetPath('  /  ')).toBe('/Game');
  });
});

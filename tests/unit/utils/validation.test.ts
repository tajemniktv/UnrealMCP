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

  it('should return default root if path becomes empty after normalization', () => {
    expect(normalizeMountedAssetPath('///')).toBe('/Game');
    expect(normalizeMountedAssetPath('  /  ')).toBe('/Game');
  });

  it('should throw an error for path traversal attempts', () => {
    expect(() => normalizeMountedAssetPath('/Game/../Asset')).toThrow('Path traversal (..) is not allowed');
    expect(() => normalizeMountedAssetPath('/Game/./Asset')).toThrow('Path traversal (..) is not allowed');
  });

  it('should sanitize root segment and other segments correctly', () => {
    // Valid root
    expect(normalizeMountedAssetPath('/Valid_Root/Asset_Name')).toBe('/Valid_Root/Asset_Name');

    // Invalid root segment (starts with number) gets sanitized
    expect(normalizeMountedAssetPath('/1InvalidRoot/Asset')).toBe('/Asset_1InvalidRoot/Asset');

    // Invalid characters in segments
    expect(normalizeMountedAssetPath('/Game/Asset@Name!')).toBe('/Game/Asset_Name');

    // SQL injection patterns in segments
    expect(normalizeMountedAssetPath('/Game/DROP TABLE/Name')).toBe('/Game/TABLE/Name');
  });
});

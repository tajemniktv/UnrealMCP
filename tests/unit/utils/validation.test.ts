import { describe, it, expect } from 'vitest';
import { normalizeMountedAssetPath } from '../../../src/utils/validation.js';

describe('normalizeMountedAssetPath', () => {
  it('should return default root for null, undefined, or empty path', () => {
    // @ts-expect-error Testing invalid input
    expect(normalizeMountedAssetPath(null)).toBe('/Game');
    // @ts-expect-error Testing invalid input
    expect(normalizeMountedAssetPath(undefined)).toBe('/Game');
    expect(normalizeMountedAssetPath('')).toBe('/Game');
    expect(normalizeMountedAssetPath('   ')).toBe('/Game');
  });

  it('should return custom default root if provided for empty paths', () => {
    expect(normalizeMountedAssetPath('', '/Engine')).toBe('/Engine');
  });

  it('should replace backslashes with forward slashes', () => {
    expect(normalizeMountedAssetPath('\\Game\\MyFolder\\MyAsset')).toBe('/Game/MyFolder/MyAsset');
  });

  it('should remove duplicate slashes', () => {
    expect(normalizeMountedAssetPath('//Game///MyFolder////MyAsset')).toBe('/Game/MyFolder/MyAsset');
  });

  it('should add a leading slash if missing', () => {
    expect(normalizeMountedAssetPath('Game/MyFolder/MyAsset')).toBe('/Game/MyFolder/MyAsset');
  });

  it('should trim whitespace from the path', () => {
    expect(normalizeMountedAssetPath('  /Game/MyFolder/MyAsset  ')).toBe('/Game/MyFolder/MyAsset');
  });

  it('should throw an error if path contains traversal segments (. or ..)', () => {
    expect(() => normalizeMountedAssetPath('/Game/../MyFolder/MyAsset')).toThrow('Path traversal (..) is not allowed');
    expect(() => normalizeMountedAssetPath('/Game/./MyFolder/MyAsset')).toThrow('Path traversal (..) is not allowed');
  });

  it('should sanitize the root if it is not valid', () => {
    expect(normalizeMountedAssetPath('/123InvalidRoot/MyFolder/MyAsset')).toBe('/Asset_123InvalidRoot/MyFolder/MyAsset');
  });

  it('should sanitize the rest of the segments', () => {
    // sanitizeAssetName removes trailing underscores so My@Asset! -> My_Asset
    expect(normalizeMountedAssetPath('/Game/MyFolder/My@Asset!')).toBe('/Game/MyFolder/My_Asset');
  });
});

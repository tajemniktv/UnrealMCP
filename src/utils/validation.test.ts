/**
 * Unit tests for validation utility functions
 */
import { describe, it, expect } from 'vitest';
import {
    sanitizeAssetName,
    sanitizePath,
    normalizeMountedAssetPath,
    validatePathLength,
    validateAssetParams,
    ensureVector3,
    ensureRotation,
    normalizeMountedAssetPath
} from './validation.js';

describe('sanitizeAssetName', () => {
    it('removes invalid characters', () => {
        // ! is replaced with _, then trailing _ is stripped
        expect(sanitizeAssetName('My Asset!')).toBe('My_Asset');
    });

    it('removes leading/trailing whitespace', () => {
        expect(sanitizeAssetName('  MyAsset  ')).toBe('MyAsset');
    });

    it('preserves valid names', () => {
        expect(sanitizeAssetName('ValidName_123')).toBe('ValidName_123');
    });

    it('replaces spaces with underscores', () => {
        expect(sanitizeAssetName('My Cool Asset')).toBe('My_Cool_Asset');
    });

    it('handles empty strings', () => {
        const result = sanitizeAssetName('');
        expect(result.length).toBeGreaterThan(0);
    });

    it('removes consecutive underscores', () => {
        const result = sanitizeAssetName('My__Asset');
        expect(result).not.toContain('__');
    });
});

describe('sanitizePath', () => {
    it('normalizes forward slashes', () => {
        const result = sanitizePath('/Game/MyAsset');
        expect(result).toContain('/');
        expect(result).not.toContain('\\\\');
    });

    it('removes double slashes', () => {
        const result = sanitizePath('/Game//MyAsset');
        expect(result).not.toContain('//');
    });

    it('handles backslashes', () => {
        const result = sanitizePath('\\Game\\MyAsset');
        expect(result).toContain('/');
    });

    it('sanitizes path segments with dots', () => {
        expect(() => sanitizePath('/Game/../MyAsset')).toThrow(
            'Path traversal (..) is not allowed'
        );
    });
});

describe('validatePathLength', () => {
    it('accepts valid short paths', () => {
        const result = validatePathLength('/Game/MyAsset');
        expect(result.valid).toBe(true);
    });

    it('accepts empty paths (length 0 < 260)', () => {
        const result = validatePathLength('');
        // Empty string has length 0, which is < 260, so it's valid
        expect(result.valid).toBe(true);
    });

    it('rejects excessively long paths', () => {
        const longPath = '/Game/' + 'a'.repeat(300);
        const result = validatePathLength(longPath);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
    });
});

describe('validateAssetParams', () => {
    it('validates correct create params', () => {
        const result = validateAssetParams({
            action: 'create',
            name: 'MyAsset',
            path: '/Game/Assets'
        });
        expect(result.valid).toBe(true);
    });

    it('handles names that need sanitization', () => {
        const result = validateAssetParams({
            name: '',
            savePath: '/Game'
        });
        // Empty name gets sanitized to 'Asset', so this should be valid
        expect(result.valid).toBe(true);
    });

    it('validates path params', () => {
        const result = validateAssetParams({
            name: 'Target',
            savePath: '/Game/Source'
        });
        expect(result.valid).toBe(true);
    });
});


describe('ensureVector3', () => {
    it('accepts object format with x, y, z', () => {
        const result = ensureVector3({ x: 1, y: 2, z: 3 }, 'location');
        expect(result).toEqual([1, 2, 3]);
    });

    it('accepts array format', () => {
        const result = ensureVector3([1, 2, 3], 'location');
        expect(result).toEqual([1, 2, 3]);
    });

    it('throws on invalid object', () => {
        expect(() => ensureVector3({ x: 1 }, 'location')).toThrow();
    });

    it('throws on wrong array length', () => {
        expect(() => ensureVector3([1, 2], 'location')).toThrow();
    });

    it('throws on non-number values', () => {
        expect(() => ensureVector3({ x: 'a', y: 2, z: 3 }, 'location')).toThrow();
    });
});

describe('ensureRotation', () => {
    it('accepts object format with pitch, yaw, roll', () => {
        const result = ensureRotation({ pitch: 0, yaw: 90, roll: 0 }, 'rotation');
        expect(result).toEqual([0, 90, 0]);
    });

    it('accepts array format', () => {
        const result = ensureRotation([0, 90, 0], 'rotation');
        expect(result).toEqual([0, 90, 0]);
    });

    it('throws on invalid input', () => {
        expect(() => ensureRotation('invalid', 'rotation')).toThrow();
    });
});

describe('normalizeMountedAssetPath', () => {
    it('returns default root for empty or invalid paths', () => {
        expect(normalizeMountedAssetPath('')).toBe('/Game');
        expect(normalizeMountedAssetPath(null as any)).toBe('/Game');
        expect(normalizeMountedAssetPath(undefined as any)).toBe('/Game');
        expect(normalizeMountedAssetPath('   ')).toBe('/Game');
    });

    it('uses custom default root if provided', () => {
        expect(normalizeMountedAssetPath('', '/Engine')).toBe('/Engine');
        expect(normalizeMountedAssetPath('   ', '/Temp')).toBe('/Temp');
    });

    it('converts backslashes to forward slashes', () => {
        expect(normalizeMountedAssetPath('\\Game\\MyAsset')).toBe('/Game/MyAsset');
    });

    it('reduces multiple slashes to single slashes', () => {
        expect(normalizeMountedAssetPath('/Game///MyAsset//Path')).toBe('/Game/MyAsset/Path');
    });

    it('adds leading slash if missing', () => {
        expect(normalizeMountedAssetPath('Game/MyAsset')).toBe('/Game/MyAsset');
    });

    it('throws error for path traversal (.. or .)', () => {
        expect(() => normalizeMountedAssetPath('/Game/../MyAsset')).toThrow('Path traversal (..) is not allowed');
        expect(() => normalizeMountedAssetPath('/Game/./MyAsset')).toThrow('Path traversal (..) is not allowed');
    });

    it('sanitizes root segment if invalid', () => {
        // '123Game' is invalid root (doesn't start with letter/underscore), so it gets sanitized
        expect(normalizeMountedAssetPath('/123Game/MyAsset')).toBe('/Asset_123Game/MyAsset');
    });

    it('sanitizes other segments', () => {
        expect(normalizeMountedAssetPath('/Game/My Asset!/Folder')).toBe('/Game/My_Asset/Folder');
    });

    it('handles root only paths correctly', () => {
        expect(normalizeMountedAssetPath('/Game')).toBe('/Game');
        expect(normalizeMountedAssetPath('/Game/')).toBe('/Game');
    });
});

/**
 * Unit tests for validation utility functions
 */
import { describe, it, expect } from 'vitest';
import {
    normalizeMountedAssetPath,
    sanitizeAssetName,
    sanitizePath,
    validatePathLength,
    validateAssetParams,
    ensureVector3,
    ensureRotation
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
    it('returns default root for empty, null, or undefined paths', () => {
        expect(normalizeMountedAssetPath('')).toBe('/Game');
        expect(normalizeMountedAssetPath(null as any)).toBe('/Game');
        expect(normalizeMountedAssetPath(undefined as any)).toBe('/Game');
        expect(normalizeMountedAssetPath('   ')).toBe('/Game');
    });

    it('returns default root for paths that become empty after trimming and sanitization', () => {
        expect(normalizeMountedAssetPath('///')).toBe('/Game');
        expect(normalizeMountedAssetPath('  /  ')).toBe('/Game');
    });

    it('replaces backslashes with forward slashes', () => {
        expect(normalizeMountedAssetPath('\\Game\\Asset')).toBe('/Game/Asset');
        expect(normalizeMountedAssetPath('\\\\Game\\\\Asset')).toBe('/Game/Asset');
    });

    it('reduces consecutive slashes to a single slash', () => {
        expect(normalizeMountedAssetPath('//Game///Asset')).toBe('/Game/Asset');
    });

    it('adds a leading slash if missing', () => {
        expect(normalizeMountedAssetPath('Game/Asset')).toBe('/Game/Asset');
    });

    it('throws an Error for path traversal attempts', () => {
        expect(() => normalizeMountedAssetPath('/Game/../Asset')).toThrow('Path traversal (..) is not allowed');
        expect(() => normalizeMountedAssetPath('/Game/./Asset')).toThrow('Path traversal (..) is not allowed');
    });

    it('leaves a valid root untouched', () => {
        expect(normalizeMountedAssetPath('/Engine/Asset')).toBe('/Engine/Asset');
    });

    it('sanitizes an invalid root using sanitizeAssetName', () => {
        expect(normalizeMountedAssetPath('/Game!/Asset')).toBe('/Game/Asset');
        expect(normalizeMountedAssetPath('/123InvalidRoot/Asset')).toBe('/Asset_123InvalidRoot/Asset');
    });

    it('sanitizes path segments using sanitizeAssetName', () => {
        expect(normalizeMountedAssetPath('/Game/My Asset!/Mesh')).toBe('/Game/My_Asset/Mesh');
        expect(normalizeMountedAssetPath('/Game/Asset@Name')).toBe('/Game/Asset_Name');
    });

    it('supports a custom default root parameter', () => {
        expect(normalizeMountedAssetPath('', '/CustomRoot')).toBe('/CustomRoot');
        expect(normalizeMountedAssetPath('///', '/CustomRoot')).toBe('/CustomRoot');
    });
});

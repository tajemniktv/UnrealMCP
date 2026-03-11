/**
 * Unit tests for normalize utility functions
 */
import { describe, it, expect } from 'vitest';
import {
    toVec3Object,
    toRotObject,
    toVec3Tuple,
    toRotTuple,
    toFiniteNumber,
    normalizePartialVector,
    normalizeTransformInput
} from './normalize.js';

describe('toVec3Object', () => {
    it('converts object input to Vector3', () => {
        const result = toVec3Object({ x: 1, y: 2, z: 3 });
        expect(result).toEqual({ x: 1, y: 2, z: 3 });
    });

    it('converts array input to Vector3', () => {
        const result = toVec3Object([1, 2, 3]);
        expect(result).toEqual({ x: 1, y: 2, z: 3 });
    });

    it('returns null for invalid input', () => {
        expect(toVec3Object('invalid')).toBeNull();
        expect(toVec3Object(null)).toBeNull();
        expect(toVec3Object(undefined)).toBeNull();
    });

    it('returns null for incomplete object', () => {
        expect(toVec3Object({ x: 1, y: 2 })).toBeNull();
    });

    it('handles zero values', () => {
        const result = toVec3Object({ x: 0, y: 0, z: 0 });
        expect(result).toEqual({ x: 0, y: 0, z: 0 });
    });
});

describe('toRotObject', () => {
    it('converts object input to Rotator', () => {
        const result = toRotObject({ pitch: 10, yaw: 20, roll: 30 });
        expect(result).toEqual({ pitch: 10, yaw: 20, roll: 30 });
    });

    it('converts array input to Rotator', () => {
        const result = toRotObject([10, 20, 30]);
        expect(result).toEqual({ pitch: 10, yaw: 20, roll: 30 });
    });

    it('returns null for invalid input', () => {
        expect(toRotObject('invalid')).toBeNull();
        expect(toRotObject(null)).toBeNull();
    });
});

describe('toVec3Tuple', () => {
    it('converts object to tuple', () => {
        const result = toVec3Tuple({ x: 1, y: 2, z: 3 });
        expect(result).toEqual([1, 2, 3]);
    });

    it('passes through valid array', () => {
        const result = toVec3Tuple([1, 2, 3]);
        expect(result).toEqual([1, 2, 3]);
    });

    it('returns null for invalid input', () => {
        expect(toVec3Tuple([1, 2])).toBeNull();
        expect(toVec3Tuple(null)).toBeNull();
    });
});

describe('toRotTuple', () => {
    it('converts object to tuple', () => {
        const result = toRotTuple({ pitch: 10, yaw: 20, roll: 30 });
        expect(result).toEqual([10, 20, 30]);
    });

    it('passes through valid array', () => {
        const result = toRotTuple([10, 20, 30]);
        expect(result).toEqual([10, 20, 30]);
    });
});

describe('toFiniteNumber', () => {
    it('accepts valid numbers', () => {
        expect(toFiniteNumber(42)).toBe(42);
        expect(toFiniteNumber(0)).toBe(0);
        expect(toFiniteNumber(-5)).toBe(-5);
        expect(toFiniteNumber(3.14)).toBe(3.14);
    });

    it('parses string numbers', () => {
        expect(toFiniteNumber('42')).toBe(42);
        expect(toFiniteNumber('3.14')).toBe(3.14);
    });

    it('returns undefined for invalid input', () => {
        expect(toFiniteNumber('not a number')).toBeUndefined();
        expect(toFiniteNumber(NaN)).toBeUndefined();
        expect(toFiniteNumber(Infinity)).toBeUndefined();
        expect(toFiniteNumber(null)).toBeUndefined();
        expect(toFiniteNumber(undefined)).toBeUndefined();
    });
});

describe('normalizePartialVector', () => {
    it('normalizes complete vectors', () => {
        const result = normalizePartialVector({ x: 1, y: 2, z: 3 });
        expect(result).toEqual({ x: 1, y: 2, z: 3 });
    });

    it('handles partial vectors', () => {
        const result = normalizePartialVector({ x: 1 });
        expect(result).toBeDefined();
        expect(result?.x).toBe(1);
    });

    it('uses alternate keys for reading input', () => {
        const result = normalizePartialVector(
            { pitch: 10, yaw: 20, roll: 30 },
            ['pitch', 'yaw', 'roll']
        );
        // alternateKeys are used to READ from input, but output is still x/y/z
        expect(result).toEqual({ x: 10, y: 20, z: 30 });
    });

    it('returns undefined for invalid input', () => {
        expect(normalizePartialVector(null)).toBeUndefined();
        expect(normalizePartialVector('string')).toBeUndefined();
    });
});

describe('normalizeTransformInput', () => {
    it('normalizes complete transform from objects', () => {
        const result = normalizeTransformInput({
            location: { x: 1, y: 2, z: 3 },
            rotation: { pitch: 10, yaw: 20, roll: 30 },
            scale: { x: 1, y: 1, z: 1 }
        });
        expect(result).toEqual({
            location: { x: 1, y: 2, z: 3 },
            rotation: { x: 10, y: 20, z: 30 },
            scale: { x: 1, y: 1, z: 1 }
        });
    });

    it('normalizes complete transform from arrays', () => {
        const result = normalizeTransformInput({
            location: [1, 2, 3],
            rotation: [10, 20, 30],
            scale: [1, 1, 1]
        });
        expect(result).toEqual({
            location: { x: 1, y: 2, z: 3 },
            rotation: { x: 10, y: 20, z: 30 },
            scale: { x: 1, y: 1, z: 1 }
        });
    });

    it('handles partial transforms with location only', () => {
        const result = normalizeTransformInput({
            location: { x: 100, y: 200, z: 300 }
        });
        expect(result).toEqual({
            location: { x: 100, y: 200, z: 300 }
        });
    });

    it('handles partial transforms with rotation only', () => {
        const result = normalizeTransformInput({
            rotation: { yaw: 90 }
        });
        expect(result).toEqual({
            rotation: { y: 90 }
        });
    });

    it('handles partial transforms with scale only', () => {
        const result = normalizeTransformInput({
            scale: { z: 5 }
        });
        expect(result).toEqual({
            scale: { z: 5 }
        });
    });

    it('handles mixed partial transforms', () => {
        const result = normalizeTransformInput({
            location: { x: 1 },
            scale: { z: 5 }
        });
        expect(result).toEqual({
            location: { x: 1 },
            scale: { z: 5 }
        });
    });

    it('handles mixed formats (array and object)', () => {
        const result = normalizeTransformInput({
            location: [1, 2, 3],
            rotation: { pitch: 10, roll: 30 }
        });
        expect(result).toEqual({
            location: { x: 1, y: 2, z: 3 },
            rotation: { x: 10, z: 30 }
        });
    });

    it('handles partial arrays', () => {
        const result = normalizeTransformInput({
            location: [1],
            rotation: [10, 20],
            scale: [1, 1, 1, 4]
        });
        expect(result).toEqual({
            location: { x: 1 },
            rotation: { x: 10, y: 20 },
            scale: { x: 1, y: 1, z: 1 }
        });
    });

    it('handles primitive component input', () => {
        const result = normalizeTransformInput({
            location: 100
        });
        expect(result).toEqual({
            location: { x: 100 }
        });
    });

    it('normalizes string numbers in components', () => {
        const result = normalizeTransformInput({
            location: { x: '100', y: '200.5' }
        });
        expect(result).toEqual({
            location: { x: 100, y: 200.5 }
        });
    });

    it('filters out invalid numbers in components', () => {
        const result = normalizeTransformInput({
            location: { x: NaN, y: Infinity, z: 'abc' },
            scale: { x: 1 }
        });
        expect(result).toEqual({
            scale: { x: 1 }
        });
    });

    it('returns undefined for empty object', () => {
        expect(normalizeTransformInput({})).toBeUndefined();
    });

    it('returns undefined for object with unrelated keys', () => {
        expect(normalizeTransformInput({ foo: 'bar' })).toBeUndefined();
    });

    it('returns undefined for invalid input', () => {
        expect(normalizeTransformInput(null)).toBeUndefined();
        expect(normalizeTransformInput(undefined)).toBeUndefined();
        expect(normalizeTransformInput('invalid')).toBeUndefined();
        expect(normalizeTransformInput(123)).toBeUndefined();
    });
});

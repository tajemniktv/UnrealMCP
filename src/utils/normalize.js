"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toVec3Object = toVec3Object;
exports.toRotObject = toRotObject;
exports.toVec3Tuple = toVec3Tuple;
exports.toRotTuple = toRotTuple;
exports.toFiniteNumber = toFiniteNumber;
exports.normalizePartialVector = normalizePartialVector;
exports.normalizeTransformInput = normalizeTransformInput;
/**
 * Convert various input formats to a Vec3 object
 * @param input - Array, object with x/y/z or X/Y/Z properties
 */
function toVec3Object(input) {
    var _a, _b, _c;
    try {
        if (Array.isArray(input) && input.length === 3) {
            var x = input[0], y = input[1], z = input[2];
            if ([x, y, z].every(function (v) { return typeof v === 'number' && isFinite(v); })) {
                return { x: x, y: y, z: z };
            }
        }
        if (input && typeof input === 'object' && !Array.isArray(input)) {
            var obj = input;
            var x = Number((_a = obj.x) !== null && _a !== void 0 ? _a : obj.X);
            var y = Number((_b = obj.y) !== null && _b !== void 0 ? _b : obj.Y);
            var z = Number((_c = obj.z) !== null && _c !== void 0 ? _c : obj.Z);
            if ([x, y, z].every(function (v) { return typeof v === 'number' && !isNaN(v) && isFinite(v); })) {
                return { x: x, y: y, z: z };
            }
        }
    }
    catch (_d) { }
    return null;
}
/**
 * Convert various input formats to a Rotation object
 * @param input - Array, object with pitch/yaw/roll or Pitch/Yaw/Roll properties
 */
function toRotObject(input) {
    var _a, _b, _c;
    try {
        if (Array.isArray(input) && input.length === 3) {
            var pitch = input[0], yaw = input[1], roll = input[2];
            if ([pitch, yaw, roll].every(function (v) { return typeof v === 'number' && isFinite(v); })) {
                return { pitch: pitch, yaw: yaw, roll: roll };
            }
        }
        if (input && typeof input === 'object' && !Array.isArray(input)) {
            var obj = input;
            var pitch = Number((_a = obj.pitch) !== null && _a !== void 0 ? _a : obj.Pitch);
            var yaw = Number((_b = obj.yaw) !== null && _b !== void 0 ? _b : obj.Yaw);
            var roll = Number((_c = obj.roll) !== null && _c !== void 0 ? _c : obj.Roll);
            if ([pitch, yaw, roll].every(function (v) { return typeof v === 'number' && !isNaN(v) && isFinite(v); })) {
                return { pitch: pitch, yaw: yaw, roll: roll };
            }
        }
    }
    catch (_d) { }
    return null;
}
/**
 * Convert vector input to a tuple format [x, y, z]
 */
function toVec3Tuple(input) {
    var vec = toVec3Object(input);
    if (!vec) {
        return null;
    }
    var x = vec.x, y = vec.y, z = vec.z;
    return [x, y, z];
}
/**
 * Convert rotation input to a tuple format [pitch, yaw, roll]
 */
function toRotTuple(input) {
    var rot = toRotObject(input);
    if (!rot) {
        return null;
    }
    var pitch = rot.pitch, yaw = rot.yaw, roll = rot.roll;
    return [pitch, yaw, roll];
}
/**
 * Parse a raw value into a finite number when possible.
 * Accepts strings like "1.0" and returns number or undefined when invalid.
 */
function toFiniteNumber(raw) {
    if (typeof raw === 'number' && Number.isFinite(raw))
        return raw;
    if (typeof raw === 'string') {
        var trimmed = raw.trim();
        if (trimmed.length === 0)
            return undefined;
        var parsed = Number(trimmed);
        if (Number.isFinite(parsed))
            return parsed;
    }
    return undefined;
}
/**
 * Normalize a partial vector input. Unlike toVec3Object, this accepts
 * partial specifications and returns an object containing only present
 * components (x/y/z) when any are provided; otherwise returns undefined.
 */
function normalizePartialVector(value, alternateKeys) {
    var _a, _b, _c;
    if (alternateKeys === void 0) { alternateKeys = ['x', 'y', 'z']; }
    if (value === undefined || value === null)
        return undefined;
    var result = {};
    var assignIfPresent = function (component, raw) {
        var num = toFiniteNumber(raw);
        if (num !== undefined)
            result[component] = num;
    };
    if (Array.isArray(value)) {
        if (value.length > 0)
            assignIfPresent('x', value[0]);
        if (value.length > 1)
            assignIfPresent('y', value[1]);
        if (value.length > 2)
            assignIfPresent('z', value[2]);
    }
    else if (typeof value === 'object') {
        var obj = value;
        assignIfPresent('x', (_a = obj.x) !== null && _a !== void 0 ? _a : obj[alternateKeys[0]]);
        assignIfPresent('y', (_b = obj.y) !== null && _b !== void 0 ? _b : obj[alternateKeys[1]]);
        assignIfPresent('z', (_c = obj.z) !== null && _c !== void 0 ? _c : obj[alternateKeys[2]]);
    }
    else {
        assignIfPresent('x', value);
    }
    return Object.keys(result).length > 0 ? result : undefined;
}
/**
 * Normalize a transform-like input into a minimal object containing
 * location/rotation/scale partial descriptors when present.
 */
function normalizeTransformInput(transform) {
    if (!transform || typeof transform !== 'object')
        return undefined;
    var transformObj = transform;
    var result = {};
    var location = normalizePartialVector(transformObj.location);
    if (location)
        result.location = location;
    var rotation = normalizePartialVector(transformObj.rotation, ['pitch', 'yaw', 'roll']);
    if (rotation)
        result.rotation = rotation;
    var scale = normalizePartialVector(transformObj.scale);
    if (scale)
        result.scale = scale;
    return Object.keys(result).length > 0 ? result : undefined;
}

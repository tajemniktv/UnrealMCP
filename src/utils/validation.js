"use strict";
/**
 * Validation and sanitization utilities for Unreal Engine assets
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeMountedAssetPath = normalizeMountedAssetPath;
exports.sanitizeCommandArgument = sanitizeCommandArgument;
exports.sanitizeAssetName = sanitizeAssetName;
exports.sanitizePath = sanitizePath;
exports.validatePathLength = validatePathLength;
exports.validateAssetParams = validateAssetParams;
exports.ensureVector3 = ensureVector3;
exports.concurrencyDelay = concurrencyDelay;
exports.ensureColorRGB = ensureColorRGB;
exports.ensureRotation = ensureRotation;
exports.resolveSkeletalMeshPath = resolveSkeletalMeshPath;
var normalize_js_1 = require("./normalize.js");
/**
 * Maximum path length allowed in Unreal Engine
 */
var MAX_PATH_LENGTH = 260;
/**
 * Maximum asset name length
 */
var MAX_ASSET_NAME_LENGTH = 64;
/**
 * Invalid characters for Unreal Engine asset names
 * Note: Dashes are allowed in Unreal asset names
 * Includes SQL injection pattern protection (semicolons, quotes, double-dashes)
 */
// eslint-disable-next-line no-useless-escape
var INVALID_CHARS = /[@#%$&*()+=\[\]{}<>?|\\;:'"`,~!\s]/g;
/**
 * SQL injection patterns to reject in asset names
 * These patterns could be dangerous if passed to database queries or eval contexts
 */
var SQL_INJECTION_PATTERNS = /('|";|--|\bDROP\b|\bDELETE\b|\bINSERT\b|\bUPDATE\b|\bEXEC\b|\bEXECUTE\b)/gi;
/**
 * Reserved keywords that shouldn't be used as names
 */
var RESERVED_KEYWORDS = [
    'None', 'null', 'undefined', 'true', 'false',
    'class', 'struct', 'enum', 'interface',
    'default', 'transient', 'native'
];
var DEFAULT_MOUNTED_ROOT = '/Game';
var BUILTIN_MOUNTED_ROOTS = new Set(['Game', 'Engine', 'Script', 'Temp', 'Config']);
function normalizeMountedAssetPath(path, defaultRoot) {
    if (defaultRoot === void 0) { defaultRoot = DEFAULT_MOUNTED_ROOT; }
    if (!path || typeof path !== 'string') {
        return defaultRoot;
    }
    var normalized = path.trim().replace(/\\/g, '/');
    while (normalized.includes('//')) {
        normalized = normalized.replace(/\/\//g, '/');
    }
    if (normalized.length === 0) {
        return defaultRoot;
    }
    if (!normalized.startsWith('/')) {
        normalized = "/".concat(normalized);
    }
    var segments = normalized.split('/').filter(Boolean);
    if (segments.length === 0) {
        return defaultRoot;
    }
    if (segments.some(function (segment) { return segment === '.' || segment === '..'; })) {
        throw new Error('Path traversal (..) is not allowed');
    }
    var root = segments[0], rest = segments.slice(1);
    var normalizedRoot = /^[A-Za-z_][A-Za-z0-9_]*$/.test(root) ? root : sanitizeAssetName(root);
    var sanitizedSegments = rest.map(function (segment) { return sanitizeAssetName(segment); });
    return '/' + __spreadArray([normalizedRoot], sanitizedSegments, true).join('/');
}
/**
 * Sanitize a command argument to prevent injection attacks
 * @param arg The argument to sanitize
 * @returns Sanitized argument safe for command execution
 */
function sanitizeCommandArgument(arg) {
    if (!arg || typeof arg !== 'string') {
        return '';
    }
    // Remove leading/trailing whitespace
    var sanitized = arg.trim();
    // Remove null bytes and control characters
    // eslint-disable-next-line no-control-regex
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
    // SECURITY: Replace semicolons with underscores to prevent command injection
    // Semicolons can be used to chain commands (e.g., "MyLevel;Quit" would execute "Quit")
    sanitized = sanitized.replace(/;/g, '_');
    // Escape backslashes and quotes for command safety
    sanitized = sanitized.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    // Remove newlines and carriage returns that could allow command injection
    sanitized = sanitized.replace(/[\r\n]/g, ' ');
    return sanitized;
}
/**
 * Sanitize an asset name for Unreal Engine
 * @param name The name to sanitize
 * @returns Sanitized name
 */
function sanitizeAssetName(name) {
    if (!name || typeof name !== 'string') {
        return 'Asset';
    }
    // Remove leading/trailing whitespace
    var sanitized = name.trim();
    // Check for SQL injection patterns and reject early
    if (SQL_INJECTION_PATTERNS.test(sanitized)) {
        // Replace dangerous patterns with underscores instead of throwing
        sanitized = sanitized.replace(SQL_INJECTION_PATTERNS, '_');
    }
    // Replace invalid characters with underscores
    sanitized = sanitized.replace(INVALID_CHARS, '_');
    // Remove consecutive underscores
    sanitized = sanitized.replace(/_+/g, '_');
    // Remove leading/trailing underscores
    sanitized = sanitized.replace(/^_+|_+$/g, '');
    // If name is empty after sanitization, use default
    if (!sanitized) {
        return 'Asset';
    }
    // If name is a reserved keyword, append underscore
    if (RESERVED_KEYWORDS.includes(sanitized)) {
        sanitized = "".concat(sanitized, "_Asset");
    }
    // Ensure name starts with a letter
    if (!/^[A-Za-z]/.test(sanitized)) {
        sanitized = "Asset_".concat(sanitized);
    }
    // Truncate overly long names to reduce risk of hitting path length limits
    if (sanitized.length > MAX_ASSET_NAME_LENGTH) {
        sanitized = sanitized.slice(0, MAX_ASSET_NAME_LENGTH);
    }
    return sanitized;
}
/**
 * Sanitize a path for Unreal Engine
 * @param path The path to sanitize
 * @returns Sanitized path
 */
function sanitizePath(path) {
    var normalized = normalizeMountedAssetPath(path, DEFAULT_MOUNTED_ROOT);
    var _a = normalized.split('/'), root = _a[1];
    if (!BUILTIN_MOUNTED_ROOTS.has(root) && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(root)) {
        throw new Error("Invalid root segment '".concat(root, "'"));
    }
    return normalized;
}
/**
 * Validate path length
 * @param path The full path to validate
 * @returns Object with validation result
 */
function validatePathLength(path) {
    if (path.length > MAX_PATH_LENGTH) {
        return {
            valid: false,
            error: "Path too long (".concat(path.length, " characters). Maximum allowed is ").concat(MAX_PATH_LENGTH, " characters.")
        };
    }
    return { valid: true };
}
/**
 * Validate and sanitize asset parameters
 * @param params Object containing name and optionally savePath
 * @returns Sanitized parameters with validation result
 */
function validateAssetParams(params) {
    // Sanitize name
    var sanitizedName = sanitizeAssetName(params.name);
    // Sanitize path if provided
    var sanitizedPath = params.savePath
        ? sanitizePath(params.savePath)
        : params.savePath;
    // Construct full path for validation
    var fullPath = sanitizedPath
        ? "".concat(sanitizedPath, "/").concat(sanitizedName)
        : "/Game/".concat(sanitizedName);
    // Validate path length
    var pathValidation = validatePathLength(fullPath);
    if (!pathValidation.valid) {
        return {
            valid: false,
            sanitized: params,
            error: pathValidation.error
        };
    }
    return {
        valid: true,
        sanitized: __assign(__assign(__assign({}, params), { name: sanitizedName }), (sanitizedPath && { savePath: sanitizedPath }))
    };
}
/**
 * Validate an array (tuple) of finite numbers, preserving the original shape.
 * @throws if the tuple has the wrong length or contains invalid values
 */
function ensureVector3(value, label) {
    var tuple = (0, normalize_js_1.toVec3Tuple)(value);
    if (!tuple) {
        throw new Error("Invalid ".concat(label, ": expected an object with x,y,z or an array of 3 numbers"));
    }
    return tuple;
}
/**
 * Concurrency delay to prevent race conditions
 * @param ms Milliseconds to delay
 */
function concurrencyDelay() {
    return __awaiter(this, arguments, void 0, function (ms) {
        if (ms === void 0) { ms = 20; }
        return __generator(this, function (_a) {
            // Reduce the default per-operation delay to speed up test runs while
            // allowing a small pause for the editor to process changes. Tests
            // previously used 100ms which accumulates across 100+ test cases.
            return [2 /*return*/, new Promise(function (resolve) { return setTimeout(resolve, ms); })];
        });
    });
}
function ensureColorRGB(value, label) {
    return ensureVector3(value, label);
}
function ensureRotation(value, label) {
    var tuple = (0, normalize_js_1.toRotTuple)(value);
    if (!tuple) {
        throw new Error("Invalid ".concat(label, ": expected an object with pitch,yaw,roll or an array of 3 numbers"));
    }
    return tuple;
}
/**
 * Resolve a skeletal mesh path from a skeleton path or mesh name.
 * Maps common UE skeleton paths to their corresponding mesh paths.
 */
function resolveSkeletalMeshPath(input) {
    if (!input || typeof input !== 'string') {
        return null;
    }
    // Sanitize path if it contains slashes (indicates it's a path, not just a name)
    var normalizedInput = input;
    if (input.includes('/')) {
        try {
            normalizedInput = sanitizePath(input);
        }
        catch (_a) {
            // If sanitization fails, return null (invalid path)
            return null;
        }
    }
    // Common skeleton to mesh mappings
    var skeletonToMeshMap = {
        '/Game/Mannequin/Character/Mesh/UE4_Mannequin_Skeleton': '/Game/Characters/Mannequins/Meshes/SKM_Manny_Simple',
        '/Game/Characters/Mannequins/Meshes/SK_Mannequin': '/Game/Characters/Mannequins/Meshes/SKM_Manny_Simple',
        '/Game/Mannequin/Character/Mesh/SK_Mannequin': '/Game/Characters/Mannequins/Meshes/SKM_Manny_Simple',
        '/Game/Characters/Mannequin_UE4/Meshes/UE4_Mannequin_Skeleton': '/Game/Characters/Mannequins/Meshes/SKM_Quinn_Simple',
        '/Game/Characters/Mannequins/Skeletons/UE5_Mannequin_Skeleton': '/Game/Characters/Mannequins/Meshes/SKM_Manny_Simple',
        '/Game/Characters/Mannequins/Skeletons/UE5_Female_Mannequin_Skeleton': '/Game/Characters/Mannequins/Meshes/SKM_Quinn_Simple',
        '/Game/Characters/Mannequins/Skeletons/UE5_Manny_Skeleton': '/Game/Characters/Mannequins/Meshes/SKM_Manny_Simple',
        '/Game/Characters/Mannequins/Skeletons/UE5_Quinn_Skeleton': '/Game/Characters/Mannequins/Meshes/SKM_Quinn_Simple'
    };
    // Check if this is a known skeleton path
    if (skeletonToMeshMap[normalizedInput]) {
        return skeletonToMeshMap[normalizedInput];
    }
    // If it contains _Skeleton, try to convert to mesh name
    if (normalizedInput.includes('_Skeleton')) {
        // Try common replacements
        var meshPath = normalizedInput.replace('_Skeleton', '');
        // Mapping for replacements
        var replacements_1 = {
            '/SK_': '/SKM_',
            'UE4_Mannequin': 'SKM_Manny',
            'UE5_Mannequin': 'SKM_Manny',
            'UE5_Manny': 'SKM_Manny',
            'UE5_Quinn': 'SKM_Quinn'
        };
        // Apply all replacements using regex
        meshPath = meshPath.replace(new RegExp(Object.keys(replacements_1).join('|'), 'g'), function (match) { return replacements_1[match]; });
        return meshPath;
    }
    // Generic fallback: convert any /SK_ prefix to /SKM_ for skeletal mesh paths
    if (normalizedInput.includes('/SK_')) {
        return normalizedInput.replace('/SK_', '/SKM_');
    }
    return normalizedInput;
}

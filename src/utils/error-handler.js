"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorHandler = exports.ErrorType = void 0;
var logger_js_1 = require("./logger.js");
var log = new logger_js_1.Logger('ErrorHandler');
/**
 * Error types for categorization
 */
var ErrorType;
(function (ErrorType) {
    ErrorType["VALIDATION"] = "VALIDATION";
    ErrorType["CONNECTION"] = "CONNECTION";
    ErrorType["UNREAL_ENGINE"] = "UNREAL_ENGINE";
    ErrorType["PARAMETER"] = "PARAMETER";
    ErrorType["EXECUTION"] = "EXECUTION";
    ErrorType["TIMEOUT"] = "TIMEOUT";
    ErrorType["UNKNOWN"] = "UNKNOWN";
})(ErrorType || (exports.ErrorType = ErrorType = {}));
/**
 * Normalize any error type to ErrorLike interface
 */
function normalizeErrorToLike(error) {
    if (error instanceof Error) {
        return {
            message: error.message,
            stack: error.stack,
            code: error.code
        };
    }
    if (typeof error === 'object' && error !== null) {
        var obj = error;
        return {
            message: typeof obj.message === 'string' ? obj.message : undefined,
            code: typeof obj.code === 'string' ? obj.code : undefined,
            type: typeof obj.type === 'string' ? obj.type : undefined,
            errorType: typeof obj.errorType === 'string' ? obj.errorType : undefined,
            stack: typeof obj.stack === 'string' ? obj.stack : undefined,
            response: typeof obj.response === 'object' && obj.response !== null
                ? {
                    status: typeof obj.response.status === 'number'
                        ? obj.response.status
                        : undefined
                }
                : undefined
        };
    }
    return { message: String(error) };
}
/**
 * Consistent error handling for all tools
 */
var ErrorHandler = /** @class */ (function () {
    function ErrorHandler() {
    }
    /**
     * Create a standardized error response
     * @param error - The error object (can be Error, string, object with message, or unknown)
     * @param toolName - Name of the tool that failed
     * @param context - Optional additional context for debugging
     */
    ErrorHandler.createErrorResponse = function (error, toolName, context) {
        var errorObj = normalizeErrorToLike(error);
        var errorType = this.categorizeError(errorObj);
        var userMessage = this.getUserFriendlyMessage(errorType, errorObj);
        var retriable = this.isRetriable(errorObj);
        var scope = (context === null || context === void 0 ? void 0 : context.scope) || "tool-call/".concat(toolName);
        var errorMessage = errorObj.message || String(error);
        var errorStack = errorObj.stack;
        log.error("Tool ".concat(toolName, " failed:"), {
            type: errorType,
            message: errorMessage,
            retriable: retriable,
            scope: scope,
            context: context
        });
        var response = {
            success: false,
            error: userMessage,
            message: "Failed to execute ".concat(toolName, ": ").concat(userMessage),
            retriable: retriable,
            scope: scope
        };
        // Add debug info in development
        if (process.env.NODE_ENV === 'development') {
            response._debug = {
                errorType: errorType,
                originalError: errorMessage,
                stack: errorStack,
                context: context,
                retriable: retriable,
                scope: scope
            };
        }
        return response;
    };
    /**
     * Categorize error by type
     * @param error - The error to categorize
     */
    ErrorHandler.categorizeError = function (error) {
        var errorObj = typeof error === 'object' ? error : null;
        var explicitType = ((errorObj === null || errorObj === void 0 ? void 0 : errorObj.type) || (errorObj === null || errorObj === void 0 ? void 0 : errorObj.errorType) || '').toString().toUpperCase();
        if (explicitType && Object.values(ErrorType).includes(explicitType)) {
            return explicitType;
        }
        var errorMessage = ((errorObj === null || errorObj === void 0 ? void 0 : errorObj.message) || String(error)).toLowerCase();
        // Connection errors
        if (errorMessage.includes('econnrefused') ||
            errorMessage.includes('timeout') ||
            errorMessage.includes('connection') ||
            errorMessage.includes('network')) {
            return ErrorType.CONNECTION;
        }
        // Validation errors
        if (errorMessage.includes('invalid') ||
            errorMessage.includes('required') ||
            errorMessage.includes('must be') ||
            errorMessage.includes('validation')) {
            return ErrorType.VALIDATION;
        }
        // Unreal Engine specific errors
        if (errorMessage.includes('unreal') ||
            errorMessage.includes('connection failed') ||
            errorMessage.includes('blueprint') ||
            errorMessage.includes('actor') ||
            errorMessage.includes('asset')) {
            return ErrorType.UNREAL_ENGINE;
        }
        // Parameter errors
        if (errorMessage.includes('parameter') ||
            errorMessage.includes('argument') ||
            errorMessage.includes('missing')) {
            return ErrorType.PARAMETER;
        }
        // Timeout errors
        if (errorMessage.includes('timeout')) {
            return ErrorType.TIMEOUT;
        }
        return ErrorType.UNKNOWN;
    };
    /**
     * Get user-friendly error message
     * @param type - The categorized error type
     * @param error - The original error
     */
    ErrorHandler.getUserFriendlyMessage = function (type, error) {
        var originalMessage = (typeof error === 'object' && error !== null && 'message' in error)
            ? error.message || String(error)
            : String(error);
        switch (type) {
            case ErrorType.CONNECTION:
                return 'Failed to connect to Unreal Engine. Please ensure the Automation Bridge plugin is active and the editor is running.';
            case ErrorType.VALIDATION:
                return "Invalid input: ".concat(originalMessage);
            case ErrorType.UNREAL_ENGINE:
                return "Unreal Engine error: ".concat(originalMessage);
            case ErrorType.PARAMETER:
                return "Invalid parameters: ".concat(originalMessage);
            case ErrorType.TIMEOUT:
                return 'Operation timed out. Unreal Engine may be busy or unresponsive.';
            case ErrorType.EXECUTION:
                return "Execution failed: ".concat(originalMessage);
            default:
                return originalMessage;
        }
    };
    /**
     * Determine if an error is likely retriable
     * @param error - The error to check
     */
    ErrorHandler.isRetriable = function (error) {
        var _a;
        try {
            var errorObj = typeof error === 'object' ? error : null;
            var code = ((errorObj === null || errorObj === void 0 ? void 0 : errorObj.code) || '').toString().toUpperCase();
            var msg = ((errorObj === null || errorObj === void 0 ? void 0 : errorObj.message) || String(error) || '').toLowerCase();
            var status_1 = Number((_a = errorObj === null || errorObj === void 0 ? void 0 : errorObj.response) === null || _a === void 0 ? void 0 : _a.status);
            if (['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE'].includes(code))
                return true;
            if (/timeout|timed out|network|connection|closed|unavailable|busy|temporar/.test(msg))
                return true;
            if (!isNaN(status_1) && (status_1 === 429 || (status_1 >= 500 && status_1 < 600)))
                return true;
        }
        catch (err) {
            // Error checking retriability is uncommon; log at debug level
            log.debug('isRetriable check failed', err instanceof Error ? err.message : String(err));
        }
        return false;
    };
    /**
     * Retry a function with exponential backoff
     * @param fn - The async function to retry
     * @param options - Retry configuration options
     */
    ErrorHandler.retryWithBackoff = function (fn_1) {
        return __awaiter(this, arguments, void 0, function (fn, options) {
            var maxRetries, initialDelay, maxDelay, multiplier, shouldRetry, delay, attempt, error_1;
            var _this = this;
            var _a, _b, _c, _d, _e;
            if (options === void 0) { options = {}; }
            return __generator(this, function (_f) {
                switch (_f.label) {
                    case 0:
                        maxRetries = (_a = options.maxRetries) !== null && _a !== void 0 ? _a : 3;
                        initialDelay = (_b = options.initialDelay) !== null && _b !== void 0 ? _b : 1000;
                        maxDelay = (_c = options.maxDelay) !== null && _c !== void 0 ? _c : 10000;
                        multiplier = (_d = options.backoffMultiplier) !== null && _d !== void 0 ? _d : 2;
                        shouldRetry = (_e = options.shouldRetry) !== null && _e !== void 0 ? _e : (function (err) { return _this.isRetriable(err); });
                        delay = initialDelay;
                        attempt = 0;
                        _f.label = 1;
                    case 1:
                        if (!(attempt <= maxRetries)) return [3 /*break*/, 7];
                        _f.label = 2;
                    case 2:
                        _f.trys.push([2, 4, , 6]);
                        return [4 /*yield*/, fn()];
                    case 3: return [2 /*return*/, _f.sent()];
                    case 4:
                        error_1 = _f.sent();
                        if (attempt === maxRetries || !shouldRetry(error_1)) {
                            throw error_1;
                        }
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, delay); })];
                    case 5:
                        _f.sent();
                        delay = Math.min(delay * multiplier, maxDelay);
                        return [3 /*break*/, 6];
                    case 6:
                        attempt++;
                        return [3 /*break*/, 1];
                    case 7: throw new Error('Max retries exceeded');
                }
            });
        });
    };
    return ErrorHandler;
}());
exports.ErrorHandler = ErrorHandler;

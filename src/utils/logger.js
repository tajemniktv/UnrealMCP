"use strict";
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
exports.Logger = void 0;
var Logger = /** @class */ (function () {
    function Logger(scope, level) {
        if (level === void 0) { level = 'info'; }
        this.scope = scope;
        var envLevel = (process.env.LOG_LEVEL || process.env.LOGLEVEL || level).toString().toLowerCase();
        this.level = ['debug', 'info', 'warn', 'error'].includes(envLevel)
            ? envLevel
            : 'info';
    }
    Logger.prototype.shouldLog = function (level) {
        var order = ['debug', 'info', 'warn', 'error'];
        return order.indexOf(level) >= order.indexOf(this.level);
    };
    Logger.prototype.debug = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        if (!this.shouldLog('debug'))
            return;
        // Write to stderr to avoid corrupting MCP stdout stream
        console.error.apply(console, __spreadArray(["[".concat(this.scope, "]")], args, false));
    };
    Logger.prototype.info = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        if (!this.shouldLog('info'))
            return;
        // Write to stderr to avoid corrupting MCP stdout stream
        console.error.apply(console, __spreadArray(["[".concat(this.scope, "]")], args, false));
    };
    Logger.prototype.warn = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        if (!this.shouldLog('warn'))
            return;
        console.warn.apply(console, __spreadArray(["[".concat(this.scope, "]")], args, false));
    };
    Logger.prototype.error = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        if (this.shouldLog('error'))
            console.error.apply(console, __spreadArray(["[".concat(this.scope, "]")], args, false));
    };
    return Logger;
}());
exports.Logger = Logger;

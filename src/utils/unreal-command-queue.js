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
exports.UnrealCommandQueue = void 0;
var logger_js_1 = require("./logger.js");
var UnrealCommandQueue = /** @class */ (function () {
    function UnrealCommandQueue() {
        this.log = new logger_js_1.Logger('UnrealCommandQueue');
        this.queue = [];
        this.isProcessing = false;
        this.lastCommandTime = 0;
        this.lastStatCommandTime = 0;
        // Config
        this.MIN_COMMAND_DELAY = 100;
        this.MAX_COMMAND_DELAY = 500;
        this.STAT_COMMAND_DELAY = 300;
        this.startProcessor();
    }
    /**
     * Execute a command with priority-based throttling
     */
    UnrealCommandQueue.prototype.execute = function (command_1) {
        return __awaiter(this, arguments, void 0, function (command, priority) {
            var _this = this;
            if (priority === void 0) { priority = 5; }
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.queue.push({
                            command: command,
                            resolve: resolve,
                            reject: reject,
                            priority: priority
                        });
                        // Sort by priority (lower number = higher priority)
                        _this.queue.sort(function (a, b) { return a.priority - b.priority; });
                        // Process queue if not already processing
                        if (!_this.isProcessing) {
                            _this.processQueue();
                        }
                    })];
            });
        });
    };
    UnrealCommandQueue.prototype.processQueue = function () {
        return __awaiter(this, void 0, void 0, function () {
            var item, timeSinceLastCommand, requiredDelay, result, error_1, errObj, msgRaw, msg, isTransient, isDeterministicFailure;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (this.isProcessing || this.queue.length === 0) {
                            return [2 /*return*/];
                        }
                        this.isProcessing = true;
                        _b.label = 1;
                    case 1:
                        if (!(this.queue.length > 0)) return [3 /*break*/, 10];
                        item = this.queue.shift();
                        if (!item)
                            return [3 /*break*/, 1];
                        timeSinceLastCommand = Date.now() - this.lastCommandTime;
                        requiredDelay = this.calculateDelay(item.priority);
                        if (!(timeSinceLastCommand < requiredDelay)) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.delay(requiredDelay - timeSinceLastCommand)];
                    case 2:
                        _b.sent();
                        _b.label = 3;
                    case 3:
                        _b.trys.push([3, 5, , 9]);
                        return [4 /*yield*/, item.command()];
                    case 4:
                        result = _b.sent();
                        item.resolve(result);
                        return [3 /*break*/, 9];
                    case 5:
                        error_1 = _b.sent();
                        errObj = error_1;
                        msgRaw = (_a = errObj === null || errObj === void 0 ? void 0 : errObj.message) !== null && _a !== void 0 ? _a : String(error_1);
                        msg = String(msgRaw).toLowerCase();
                        if (item.retryCount === undefined)
                            item.retryCount = 0;
                        isTransient = (msg.includes('timeout') ||
                            msg.includes('timed out') ||
                            msg.includes('connect') ||
                            msg.includes('econnrefused') ||
                            msg.includes('econnreset') ||
                            msg.includes('broken pipe') ||
                            msg.includes('automation bridge') ||
                            msg.includes('not connected'));
                        isDeterministicFailure = (msg.includes('command not executed') ||
                            msg.includes('exec_failed') ||
                            msg.includes('invalid command') ||
                            msg.includes('invalid argument') ||
                            msg.includes('unknown_plugin_action') ||
                            msg.includes('unknown action'));
                        if (!(isTransient && item.retryCount < 3)) return [3 /*break*/, 7];
                        item.retryCount++;
                        this.log.warn("Command failed (transient), retrying (".concat(item.retryCount, "/3)"));
                        this.queue.unshift({
                            command: item.command,
                            resolve: item.resolve,
                            reject: item.reject,
                            priority: Math.max(1, item.priority - 1),
                            retryCount: item.retryCount
                        });
                        return [4 /*yield*/, this.delay(500)];
                    case 6:
                        _b.sent();
                        return [3 /*break*/, 8];
                    case 7:
                        if (isDeterministicFailure) {
                            this.log.warn("Command failed (non-retryable): ".concat(msgRaw));
                        }
                        item.reject(error_1);
                        _b.label = 8;
                    case 8: return [3 /*break*/, 9];
                    case 9:
                        this.lastCommandTime = Date.now();
                        return [3 /*break*/, 1];
                    case 10:
                        this.isProcessing = false;
                        return [2 /*return*/];
                }
            });
        });
    };
    UnrealCommandQueue.prototype.calculateDelay = function (priority) {
        if (priority <= 3) {
            return this.MAX_COMMAND_DELAY;
        }
        else if (priority <= 6) {
            return 200;
        }
        else if (priority === 8) {
            var timeSinceLastStat = Date.now() - this.lastStatCommandTime;
            if (timeSinceLastStat < this.STAT_COMMAND_DELAY) {
                return this.STAT_COMMAND_DELAY;
            }
            this.lastStatCommandTime = Date.now();
            return 150;
        }
        else {
            var baseDelay = this.MIN_COMMAND_DELAY;
            var jitter = Math.random() * 50;
            return baseDelay + jitter;
        }
    };
    UnrealCommandQueue.prototype.startProcessor = function () {
        var _this = this;
        // Fallback processor - primary processing is triggered directly from execute()
        // Reduced from 1000ms to 250ms for faster recovery if processor stalls
        this.processorInterval = setInterval(function () {
            if (!_this.isProcessing && _this.queue.length > 0) {
                _this.processQueue();
            }
        }, 250);
    };
    /**
     * Stop the command queue processor and clean up the interval.
     * Should be called during shutdown to allow clean process exit.
     */
    UnrealCommandQueue.prototype.stopProcessor = function () {
        if (this.processorInterval) {
            clearInterval(this.processorInterval);
            this.processorInterval = undefined;
        }
    };
    UnrealCommandQueue.prototype.delay = function (ms) {
        return new Promise(function (resolve) { return setTimeout(resolve, ms); });
    };
    return UnrealCommandQueue;
}());
exports.UnrealCommandQueue = UnrealCommandQueue;

"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnrealBridge = void 0;
var logger_js_1 = require("./utils/logger.js");
var error_handler_js_1 = require("./utils/error-handler.js");
var constants_js_1 = require("./constants.js");
var unreal_command_queue_js_1 = require("./utils/unreal-command-queue.js");
var command_validator_js_1 = require("./utils/command-validator.js");
var UnrealBridge = /** @class */ (function () {
    function UnrealBridge() {
        this.log = new logger_js_1.Logger('UnrealBridge');
        this.connected = false;
        // Command queue for throttling
        this.commandQueue = new unreal_command_queue_js_1.UnrealCommandQueue();
    }
    Object.defineProperty(UnrealBridge.prototype, "isConnected", {
        get: function () { return this.connected; },
        enumerable: false,
        configurable: true
    });
    UnrealBridge.prototype.setAutomationBridge = function (automationBridge) {
        var _this = this;
        if (this.automationBridge && this.automationBridgeListeners) {
            this.automationBridge.off('connected', this.automationBridgeListeners.connected);
            this.automationBridge.off('disconnected', this.automationBridgeListeners.disconnected);
            this.automationBridge.off('handshakeFailed', this.automationBridgeListeners.handshakeFailed);
        }
        this.automationBridge = automationBridge;
        this.automationBridgeListeners = undefined;
        if (!automationBridge) {
            this.connected = false;
            return;
        }
        var onConnected = function (info) {
            _this.connected = true;
            _this.log.debug('Automation bridge connected', info);
        };
        var onDisconnected = function (info) {
            _this.connected = false;
            _this.log.debug('Automation bridge disconnected', info);
        };
        var onHandshakeFailed = function (info) {
            _this.connected = false;
            _this.log.warn('Automation bridge handshake failed', info);
        };
        automationBridge.on('connected', onConnected);
        automationBridge.on('disconnected', onDisconnected);
        automationBridge.on('handshakeFailed', onHandshakeFailed);
        this.automationBridgeListeners = {
            connected: onConnected,
            disconnected: onDisconnected,
            handshakeFailed: onHandshakeFailed
        };
        this.connected = automationBridge.isConnected();
    };
    /**
     * Get the automation bridge instance safely.
     * Throws if not configured, but does not check connection status (use isConnected for that).
     */
    UnrealBridge.prototype.getAutomationBridge = function () {
        if (!this.automationBridge) {
            throw new Error('Automation bridge is not configured');
        }
        return this.automationBridge;
    };
    UnrealBridge.prototype.tryConnect = function () {
        return __awaiter(this, arguments, void 0, function (maxAttempts, timeoutMs, retryDelayMs) {
            var err_1;
            var _this = this;
            var _a, _b, _c;
            if (maxAttempts === void 0) { maxAttempts = 3; }
            if (timeoutMs === void 0) { timeoutMs = 15000; }
            if (retryDelayMs === void 0) { retryDelayMs = 3000; }
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        if (process.env.MOCK_UNREAL_CONNECTION === 'true') {
                            this.log.info('🔌 MOCK MODE: Simulating active connection');
                            this.connected = true;
                            return [2 /*return*/, true];
                        }
                        if (this.connected && ((_a = this.automationBridge) === null || _a === void 0 ? void 0 : _a.isConnected())) {
                            return [2 /*return*/, true];
                        }
                        if (!this.automationBridge) {
                            this.log.warn('Automation bridge is not configured; cannot establish connection.');
                            return [2 /*return*/, false];
                        }
                        if (this.automationBridge.isConnected()) {
                            this.connected = true;
                            return [2 /*return*/, true];
                        }
                        if (!this.connectPromise) return [3 /*break*/, 5];
                        _d.label = 1;
                    case 1:
                        _d.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.connectPromise];
                    case 2:
                        _d.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        err_1 = _d.sent();
                        this.log.debug('Existing connect promise rejected', err_1 instanceof Error ? err_1.message : String(err_1));
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/, this.connected];
                    case 5:
                        this.connectPromise = error_handler_js_1.ErrorHandler.retryWithBackoff(function () {
                            var envTimeout = process.env.UNREAL_CONNECTION_TIMEOUT ? parseInt(process.env.UNREAL_CONNECTION_TIMEOUT, 10) : 30000;
                            var actualTimeout = envTimeout > 0 ? envTimeout : timeoutMs;
                            return _this.connect(actualTimeout);
                        }, {
                            maxRetries: Math.max(0, maxAttempts - 1),
                            initialDelay: retryDelayMs,
                            maxDelay: 10000,
                            backoffMultiplier: 1.5,
                            shouldRetry: function (error) {
                                var _a;
                                var msg = ((_a = error === null || error === void 0 ? void 0 : error.message) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || '';
                                return msg.includes('timeout') || msg.includes('connect') || msg.includes('automation');
                            }
                        }).catch(function (err) {
                            var _a;
                            var errObj = err;
                            _this.log.warn("Automation bridge connection failed after ".concat(maxAttempts, " attempts:"), String((_a = errObj === null || errObj === void 0 ? void 0 : errObj.message) !== null && _a !== void 0 ? _a : err));
                            _this.log.warn('⚠️  Ensure Unreal Editor is running with MCP Automation Bridge plugin enabled');
                            _this.log.warn("\u26A0\uFE0F  Plugin should listen on ws://".concat(constants_js_1.DEFAULT_AUTOMATION_HOST, ":").concat(constants_js_1.DEFAULT_AUTOMATION_PORT, " for MCP server connections"));
                        });
                        _d.label = 6;
                    case 6:
                        _d.trys.push([6, , 8, 9]);
                        return [4 /*yield*/, this.connectPromise];
                    case 7:
                        _d.sent();
                        return [3 /*break*/, 9];
                    case 8:
                        this.connectPromise = undefined;
                        return [7 /*endfinally*/];
                    case 9:
                        this.connected = (_c = (_b = this.automationBridge) === null || _b === void 0 ? void 0 : _b.isConnected()) !== null && _c !== void 0 ? _c : false;
                        return [2 /*return*/, this.connected];
                }
            });
        });
    };
    UnrealBridge.prototype.connect = function () {
        return __awaiter(this, arguments, void 0, function (timeoutMs) {
            var automationBridge, success;
            if (timeoutMs === void 0) { timeoutMs = 15000; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        automationBridge = this.automationBridge;
                        if (!automationBridge) {
                            throw new Error('Automation bridge not configured');
                        }
                        if (automationBridge.isConnected()) {
                            this.connected = true;
                            return [2 /*return*/];
                        }
                        // Start the bridge connection if it's not active
                        // This supports lazy connection where the bridge doesn't start until a tool is used
                        automationBridge.start();
                        return [4 /*yield*/, this.waitForAutomationConnection(timeoutMs)];
                    case 1:
                        success = _a.sent();
                        if (!success) {
                            throw new Error('Automation bridge connection timeout');
                        }
                        this.connected = true;
                        return [2 /*return*/];
                }
            });
        });
    };
    UnrealBridge.prototype.waitForAutomationConnection = function (timeoutMs) {
        return __awaiter(this, void 0, void 0, function () {
            var automationBridge;
            var _this = this;
            return __generator(this, function (_a) {
                automationBridge = this.automationBridge;
                if (!automationBridge) {
                    return [2 /*return*/, false];
                }
                if (automationBridge.isConnected()) {
                    return [2 /*return*/, true];
                }
                return [2 /*return*/, new Promise(function (resolve) {
                        var settled = false;
                        var cleanup = function () {
                            if (settled) {
                                return;
                            }
                            settled = true;
                            automationBridge.off('connected', onConnected);
                            automationBridge.off('handshakeFailed', onHandshakeFailed);
                            automationBridge.off('error', onError);
                            automationBridge.off('disconnected', onDisconnected);
                            clearTimeout(timer);
                        };
                        var onConnected = function (info) {
                            cleanup();
                            _this.log.debug('Automation bridge connected while waiting', info);
                            resolve(true);
                        };
                        var onHandshakeFailed = function (info) {
                            _this.log.warn('Automation bridge handshake failed while waiting', info);
                            // We don't resolve false immediately here? The original code didn't.
                            // But handshake failed usually means we should stop waiting.
                            cleanup();
                            resolve(false);
                        };
                        var onError = function (err) {
                            _this.log.warn('Automation bridge error while waiting', err);
                            cleanup();
                            resolve(false);
                        };
                        var onDisconnected = function (info) {
                            _this.log.warn('Automation bridge disconnected while waiting', info);
                            cleanup();
                            resolve(false);
                        };
                        var timer = setTimeout(function () {
                            cleanup();
                            resolve(false);
                        }, Math.max(0, timeoutMs));
                        automationBridge.on('connected', onConnected);
                        automationBridge.on('handshakeFailed', onHandshakeFailed);
                        automationBridge.on('error', onError);
                        automationBridge.on('disconnected', onDisconnected);
                    })];
            });
        });
    };
    UnrealBridge.prototype.getObjectProperty = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var objectPath, propertyName, timeoutMs, bridge, response, success, rawResult, value, err_2, message;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        objectPath = params.objectPath, propertyName = params.propertyName, timeoutMs = params.timeoutMs;
                        if (!objectPath || typeof objectPath !== 'string') {
                            throw new Error('Invalid objectPath: must be a non-empty string');
                        }
                        if (!propertyName || typeof propertyName !== 'string') {
                            throw new Error('Invalid propertyName: must be a non-empty string');
                        }
                        bridge = this.automationBridge;
                        if (process.env.MOCK_UNREAL_CONNECTION === 'true') {
                            return [2 /*return*/, {
                                    success: true,
                                    objectPath: objectPath,
                                    propertyName: propertyName,
                                    value: 'MockValue',
                                    propertyValue: 'MockValue',
                                    transport: 'mock_bridge',
                                    message: 'Mock property read successful'
                                }];
                        }
                        if (!bridge || typeof bridge.sendAutomationRequest !== 'function') {
                            return [2 /*return*/, {
                                    success: false,
                                    objectPath: objectPath,
                                    propertyName: propertyName,
                                    error: 'Automation bridge not connected',
                                    transport: 'automation_bridge'
                                }];
                        }
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, bridge.sendAutomationRequest('get_object_property', {
                                objectPath: objectPath,
                                propertyName: propertyName
                            }, timeoutMs ? { timeoutMs: timeoutMs } : undefined)];
                    case 2:
                        response = _c.sent();
                        success = response.success !== false;
                        rawResult = response.result && typeof response.result === 'object'
                            ? __assign({}, response.result) : undefined;
                        value = (_b = (_a = rawResult === null || rawResult === void 0 ? void 0 : rawResult.value) !== null && _a !== void 0 ? _a : rawResult === null || rawResult === void 0 ? void 0 : rawResult.propertyValue) !== null && _b !== void 0 ? _b : (success ? rawResult : undefined);
                        if (success) {
                            return [2 /*return*/, {
                                    success: true,
                                    objectPath: objectPath,
                                    propertyName: propertyName,
                                    value: value,
                                    propertyValue: value,
                                    transport: 'automation_bridge',
                                    message: response.message,
                                    warnings: Array.isArray(rawResult === null || rawResult === void 0 ? void 0 : rawResult.warnings)
                                        ? rawResult.warnings
                                        : undefined,
                                    raw: rawResult,
                                    bridge: {
                                        requestId: response.requestId,
                                        success: true,
                                        error: response.error
                                    }
                                }];
                        }
                        return [2 /*return*/, {
                                success: false,
                                objectPath: objectPath,
                                propertyName: propertyName,
                                error: response.error || response.message || 'AUTOMATION_BRIDGE_FAILURE',
                                transport: 'automation_bridge',
                                raw: rawResult,
                                bridge: {
                                    requestId: response.requestId,
                                    success: false,
                                    error: response.error
                                }
                            }];
                    case 3:
                        err_2 = _c.sent();
                        message = err_2 instanceof Error ? err_2.message : String(err_2);
                        return [2 /*return*/, {
                                success: false,
                                objectPath: objectPath,
                                propertyName: propertyName,
                                error: message,
                                transport: 'automation_bridge'
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    UnrealBridge.prototype.setObjectProperty = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var objectPath, propertyName, value, markDirty, timeoutMs, bridge, payload, response, success, rawResult, err_3, message;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        objectPath = params.objectPath, propertyName = params.propertyName, value = params.value, markDirty = params.markDirty, timeoutMs = params.timeoutMs;
                        if (!objectPath || typeof objectPath !== 'string') {
                            throw new Error('Invalid objectPath: must be a non-empty string');
                        }
                        if (!propertyName || typeof propertyName !== 'string') {
                            throw new Error('Invalid propertyName: must be a non-empty string');
                        }
                        bridge = this.automationBridge;
                        if (process.env.MOCK_UNREAL_CONNECTION === 'true') {
                            return [2 /*return*/, {
                                    success: true,
                                    objectPath: objectPath,
                                    propertyName: propertyName,
                                    message: 'Mock property set successful',
                                    transport: 'mock_bridge'
                                }];
                        }
                        if (!bridge || typeof bridge.sendAutomationRequest !== 'function') {
                            return [2 /*return*/, {
                                    success: false,
                                    objectPath: objectPath,
                                    propertyName: propertyName,
                                    error: 'Automation bridge not connected',
                                    transport: 'automation_bridge'
                                }];
                        }
                        payload = {
                            objectPath: objectPath,
                            propertyName: propertyName,
                            value: value
                        };
                        if (markDirty !== undefined) {
                            payload.markDirty = Boolean(markDirty);
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, bridge.sendAutomationRequest('set_object_property', payload, timeoutMs ? { timeoutMs: timeoutMs } : undefined)];
                    case 2:
                        response = _a.sent();
                        success = response.success !== false;
                        rawResult = response.result && typeof response.result === 'object'
                            ? __assign({}, response.result) : undefined;
                        if (success) {
                            return [2 /*return*/, {
                                    success: true,
                                    objectPath: objectPath,
                                    propertyName: propertyName,
                                    message: response.message ||
                                        (typeof (rawResult === null || rawResult === void 0 ? void 0 : rawResult.message) === 'string' ? rawResult.message : undefined),
                                    transport: 'automation_bridge',
                                    raw: rawResult,
                                    bridge: {
                                        requestId: response.requestId,
                                        success: true,
                                        error: response.error
                                    }
                                }];
                        }
                        return [2 /*return*/, {
                                success: false,
                                objectPath: objectPath,
                                propertyName: propertyName,
                                error: response.error || response.message || 'AUTOMATION_BRIDGE_FAILURE',
                                transport: 'automation_bridge',
                                raw: rawResult,
                                bridge: {
                                    requestId: response.requestId,
                                    success: false,
                                    error: response.error
                                }
                            }];
                    case 3:
                        err_3 = _a.sent();
                        message = err_3 instanceof Error ? err_3.message : String(err_3);
                        return [2 /*return*/, {
                                success: false,
                                objectPath: objectPath,
                                propertyName: propertyName,
                                error: message,
                                transport: 'automation_bridge'
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    // Execute a console command safely with validation and throttling
    UnrealBridge.prototype.executeConsoleCommand = function (command) {
        return __awaiter(this, void 0, void 0, function () {
            var automationAvailable, cmdTrimmed, priority, executeCommand, result, error_1;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        automationAvailable = Boolean(this.automationBridge && typeof this.automationBridge.sendAutomationRequest === 'function');
                        if (!automationAvailable) {
                            throw new Error('Automation bridge not connected');
                        }
                        // Validate command
                        command_validator_js_1.CommandValidator.validate(command);
                        cmdTrimmed = command.trim();
                        if (cmdTrimmed.length === 0) {
                            return [2 /*return*/, { success: true, message: 'Empty command ignored' }];
                        }
                        if (command_validator_js_1.CommandValidator.isLikelyInvalid(cmdTrimmed)) {
                            this.log.warn("Command appears invalid: ".concat(cmdTrimmed));
                        }
                        priority = command_validator_js_1.CommandValidator.getPriority(cmdTrimmed);
                        executeCommand = function () { return __awaiter(_this, void 0, void 0, function () {
                            var pluginResp, errMsg;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        if (process.env.MOCK_UNREAL_CONNECTION === 'true') {
                                            this.log.info("[MOCK] Executing console command: ".concat(cmdTrimmed));
                                            return [2 /*return*/, { success: true, message: "Mock execution of '".concat(cmdTrimmed, "' successful"), transport: 'mock_bridge' }];
                                        }
                                        if (!this.automationBridge || !this.automationBridge.isConnected()) {
                                            throw new Error('Automation bridge not connected');
                                        }
                                        return [4 /*yield*/, this.automationBridge.sendAutomationRequest('console_command', { command: cmdTrimmed }, { timeoutMs: constants_js_1.CONSOLE_COMMAND_TIMEOUT_MS })];
                                    case 1:
                                        pluginResp = _a.sent();
                                        if (pluginResp && pluginResp.success) {
                                            return [2 /*return*/, __assign(__assign({ success: true }, pluginResp), { transport: 'automation_bridge' })];
                                        }
                                        errMsg = (pluginResp === null || pluginResp === void 0 ? void 0 : pluginResp.message) || (pluginResp === null || pluginResp === void 0 ? void 0 : pluginResp.error) || 'Plugin execution failed';
                                        throw new Error(errMsg);
                                }
                            });
                        }); };
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.executeThrottledCommand(executeCommand, priority)];
                    case 2:
                        result = _a.sent();
                        return [2 /*return*/, result];
                    case 3:
                        error_1 = _a.sent();
                        this.log.error("Console command failed: ".concat(cmdTrimmed), error_1);
                        throw error_1;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    UnrealBridge.prototype.executeConsoleCommands = function (commands_1) {
        return __awaiter(this, arguments, void 0, function (commands, options) {
            var _a, continueOnError, _b, delayMs, results, _i, commands_2, rawCommand, descriptor, command, result, error_2;
            var _c;
            if (options === void 0) { options = {}; }
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        _a = options.continueOnError, continueOnError = _a === void 0 ? false : _a, _b = options.delayMs, delayMs = _b === void 0 ? 0 : _b;
                        results = [];
                        _i = 0, commands_2 = commands;
                        _d.label = 1;
                    case 1:
                        if (!(_i < commands_2.length)) return [3 /*break*/, 8];
                        rawCommand = commands_2[_i];
                        descriptor = typeof rawCommand === 'string' ? { command: rawCommand } : rawCommand;
                        command = (_c = descriptor.command) === null || _c === void 0 ? void 0 : _c.trim();
                        if (!command) {
                            return [3 /*break*/, 7];
                        }
                        _d.label = 2;
                    case 2:
                        _d.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, this.executeConsoleCommand(command)];
                    case 3:
                        result = _d.sent();
                        results.push(result);
                        return [3 /*break*/, 5];
                    case 4:
                        error_2 = _d.sent();
                        if (!continueOnError) {
                            throw error_2;
                        }
                        this.log.warn("Console batch command failed: ".concat(command), error_2);
                        results.push(error_2);
                        return [3 /*break*/, 5];
                    case 5:
                        if (!(delayMs > 0)) return [3 /*break*/, 7];
                        return [4 /*yield*/, this.delay(delayMs)];
                    case 6:
                        _d.sent();
                        _d.label = 7;
                    case 7:
                        _i++;
                        return [3 /*break*/, 1];
                    case 8: return [2 /*return*/, results];
                }
            });
        });
    };
    UnrealBridge.prototype.executeEditorFunction = function (functionName, params, _options) {
        return __awaiter(this, void 0, void 0, function () {
            var resp, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (process.env.MOCK_UNREAL_CONNECTION === 'true') {
                            return [2 /*return*/, { success: true, result: { status: 'mock_success', function: functionName } }];
                        }
                        if (!this.automationBridge || typeof this.automationBridge.sendAutomationRequest !== 'function') {
                            return [2 /*return*/, { success: false, error: 'AUTOMATION_BRIDGE_UNAVAILABLE' }];
                        }
                        return [4 /*yield*/, this.automationBridge.sendAutomationRequest('execute_editor_function', {
                                functionName: functionName,
                                params: params !== null && params !== void 0 ? params : {}
                            }, (_options === null || _options === void 0 ? void 0 : _options.timeoutMs) ? { timeoutMs: _options.timeoutMs } : undefined)];
                    case 1:
                        resp = _a.sent();
                        if (resp && resp.success !== false) {
                            result = resp.result;
                            return [2 /*return*/, result ? __assign({ success: true }, result) : resp];
                        }
                        return [2 /*return*/, resp];
                }
            });
        });
    };
    /** Get Unreal Engine version */
    UnrealBridge.prototype.getEngineVersion = function () {
        return __awaiter(this, void 0, void 0, function () {
            var bridge, resp, raw, version, major, minor, patch, isUE56OrAbove, error_3;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (process.env.MOCK_UNREAL_CONNECTION === 'true') {
                            return [2 /*return*/, { version: '5.6.0-Mock', major: 5, minor: 6, patch: 0, isUE56OrAbove: true }];
                        }
                        bridge = this.getAutomationBridge();
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, bridge.sendAutomationRequest('system_control', { action: 'get_engine_version' }, { timeoutMs: constants_js_1.ENGINE_QUERY_TIMEOUT_MS })];
                    case 2:
                        resp = _c.sent();
                        raw = resp && typeof resp.result === 'object'
                            ? resp.result
                            : (_b = (_a = resp === null || resp === void 0 ? void 0 : resp.result) !== null && _a !== void 0 ? _a : resp) !== null && _b !== void 0 ? _b : {};
                        version = typeof raw.version === 'string' ? raw.version : 'unknown';
                        major = typeof raw.major === 'number' ? raw.major : 0;
                        minor = typeof raw.minor === 'number' ? raw.minor : 0;
                        patch = typeof raw.patch === 'number' ? raw.patch : 0;
                        isUE56OrAbove = typeof raw.isUE56OrAbove === 'boolean'
                            ? raw.isUE56OrAbove
                            : (major > 5 || (major === 5 && minor >= 6));
                        return [2 /*return*/, { version: version, major: major, minor: minor, patch: patch, isUE56OrAbove: isUE56OrAbove }];
                    case 3:
                        error_3 = _c.sent();
                        this.log.warn('getEngineVersion failed', error_3);
                        return [2 /*return*/, {
                                version: 'unknown',
                                major: 0,
                                minor: 0,
                                patch: 0,
                                isUE56OrAbove: false
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /** Query feature flags */
    UnrealBridge.prototype.getFeatureFlags = function () {
        return __awaiter(this, void 0, void 0, function () {
            var bridge, resp, raw, subs, error_4;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (process.env.MOCK_UNREAL_CONNECTION === 'true') {
                            return [2 /*return*/, {
                                    subsystems: {
                                        unrealEditor: true,
                                        levelEditor: true,
                                        editorActor: true
                                    }
                                }];
                        }
                        bridge = this.getAutomationBridge();
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, bridge.sendAutomationRequest('system_control', { action: 'get_feature_flags' }, { timeoutMs: constants_js_1.ENGINE_QUERY_TIMEOUT_MS })];
                    case 2:
                        resp = _c.sent();
                        raw = resp && typeof resp.result === 'object'
                            ? resp.result
                            : (_b = (_a = resp === null || resp === void 0 ? void 0 : resp.result) !== null && _a !== void 0 ? _a : resp) !== null && _b !== void 0 ? _b : {};
                        subs = raw && typeof raw.subsystems === 'object'
                            ? raw.subsystems
                            : {};
                        return [2 /*return*/, {
                                subsystems: {
                                    unrealEditor: Boolean(subs.unrealEditor),
                                    levelEditor: Boolean(subs.levelEditor),
                                    editorActor: Boolean(subs.editorActor)
                                }
                            }];
                    case 3:
                        error_4 = _c.sent();
                        this.log.warn('getFeatureFlags failed', error_4);
                        return [2 /*return*/, {
                                subsystems: {
                                    unrealEditor: false,
                                    levelEditor: false,
                                    editorActor: false
                                }
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * SOLUTION 3: Command Throttling and Queueing
     * Prevent rapid command execution that can overwhelm the engine
     */
    UnrealBridge.prototype.executeThrottledCommand = function (command_1) {
        return __awaiter(this, arguments, void 0, function (command, priority) {
            if (priority === void 0) { priority = 5; }
            return __generator(this, function (_a) {
                return [2 /*return*/, this.commandQueue.execute(command, priority)];
            });
        });
    };
    /**
     * Helper delay function
     */
    UnrealBridge.prototype.delay = function (ms) {
        return new Promise(function (resolve) { return setTimeout(resolve, ms); });
    };
    UnrealBridge.prototype.dispose = function () {
        try {
            this.commandQueue.stopProcessor();
        }
        catch (error) {
            this.log.debug('Failed to stop command queue processor', error);
        }
    };
    return UnrealBridge;
}());
exports.UnrealBridge = UnrealBridge;

"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
exports.AutomationBridge = void 0;
var node_events_1 = require("node:events");
var node_net_1 = require("node:net");
var ws_1 = require("ws");
var logger_js_1 = require("../utils/logger.js");
var constants_js_1 = require("../constants.js");
var node_module_1 = require("node:module");
var connection_manager_js_1 = require("./connection-manager.js");
var request_tracker_js_1 = require("./request-tracker.js");
var handshake_js_1 = require("./handshake.js");
var message_handler_js_1 = require("./message-handler.js");
var message_schema_js_1 = require("./message-schema.js");
var config_js_1 = require("../config.js");
var require = (0, node_module_1.createRequire)(import.meta.url);
var packageInfo = (function () {
    try {
        return require('../../package.json');
    }
    catch (error) {
        var log = new logger_js_1.Logger('AutomationBridge');
        log.debug('Unable to read package.json for version info', error);
        return {};
    }
})();
var AutomationBridge = /** @class */ (function (_super) {
    __extends(AutomationBridge, _super);
    function AutomationBridge(options) {
        if (options === void 0) { options = {}; }
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7;
        var _this = _super.call(this) || this;
        _this.log = new logger_js_1.Logger('AutomationBridge');
        _this.queuedRequestItems = [];
        _this.connectionLock = false;
        // Check if non-loopback binding is allowed (opt-in for LAN access)
        var allowNonLoopback = (_a = options.allowNonLoopback) !== null && _a !== void 0 ? _a : (((_b = process.env.MCP_AUTOMATION_ALLOW_NON_LOOPBACK) === null || _b === void 0 ? void 0 : _b.toLowerCase()) === 'true');
        var normalizeHost = function (value, label) {
            var stringValue = typeof value === 'string'
                ? value
                : value === undefined || value === null
                    ? ''
                    : String(value);
            var trimmed = stringValue.trim();
            if (trimmed.length === 0) {
                return constants_js_1.DEFAULT_AUTOMATION_HOST;
            }
            var lower = trimmed.toLowerCase();
            // Always allow loopback addresses
            if (lower === 'localhost' || lower === '127.0.0.1') {
                return '127.0.0.1';
            }
            if (lower === '::1' || lower === '[::1]') {
                return '::1';
            }
            // Non-loopback: check if allowed
            if (allowNonLoopback) {
                // Strip brackets from IPv6 if present
                var addressToValidate = trimmed;
                if (addressToValidate.startsWith('[') && addressToValidate.endsWith(']')) {
                    addressToValidate = addressToValidate.slice(1, -1);
                }
                // Strip zone ID if present (e.g., fe80::1%eth0 -> fe80::1)
                var zoneIndex = addressToValidate.indexOf('%');
                var addressWithoutZone = zoneIndex >= 0
                    ? addressToValidate.slice(0, zoneIndex)
                    : addressToValidate;
                // Use Node.js net module for validation (IPv4 and IPv6)
                var ipVersion = node_net_1.default.isIP(addressWithoutZone);
                if (ipVersion === 4 || ipVersion === 6) {
                    _this.log.warn("SECURITY: ".concat(label, " set to non-loopback address '").concat(trimmed, "'. ") +
                        'The automation bridge will be accessible from your local network.');
                    // Return address without brackets (consistent with loopback handling)
                    // Brackets will be re-added by formatHostForUrl if needed
                    return addressToValidate;
                }
                // Check if it's a valid hostname (domain name)
                // Allow hostnames like "example.com", "server.local", "unreal-pc"
                // Must contain at least one letter (to distinguish from IPs)
                var hasLetters = /[a-zA-Z]/.test(trimmed);
                if (hasLetters) {
                    // Robust hostname validation: split into labels and validate each
                    // Each label must: not be empty, start/end with alphanumeric, allow hyphens in middle
                    var labels = trimmed.split('.');
                    var isValidHostname = labels.every(function (label) { return label.length > 0 && /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label); });
                    if (isValidHostname) {
                        _this.log.warn("SECURITY: ".concat(label, " set to hostname '").concat(trimmed, "'. ") +
                            'The automation bridge will be accessible from your local network.');
                        return trimmed;
                    }
                }
                // Invalid IP format or hostname
                _this.log.error("".concat(label, " '").concat(trimmed, "' is not a valid IPv4/IPv6 address or hostname. ") +
                    "Falling back to ".concat(constants_js_1.DEFAULT_AUTOMATION_HOST, "."));
                return constants_js_1.DEFAULT_AUTOMATION_HOST;
            }
            // Default: loopback-only mode
            _this.log.warn("".concat(label, " '").concat(trimmed, "' is not a loopback address and MCP_AUTOMATION_ALLOW_NON_LOOPBACK is not set. ") +
                "Falling back to ".concat(constants_js_1.DEFAULT_AUTOMATION_HOST, ". Set MCP_AUTOMATION_ALLOW_NON_LOOPBACK=true for LAN access."));
            return constants_js_1.DEFAULT_AUTOMATION_HOST;
        };
        var rawHost = (_e = (_d = (_c = options.host) !== null && _c !== void 0 ? _c : process.env.MCP_AUTOMATION_WS_HOST) !== null && _d !== void 0 ? _d : process.env.MCP_AUTOMATION_HOST) !== null && _e !== void 0 ? _e : constants_js_1.DEFAULT_AUTOMATION_HOST;
        _this.host = normalizeHost(rawHost, 'Automation bridge host');
        var sanitizePort = function (value) {
            if (typeof value === 'number' && Number.isInteger(value)) {
                return value > 0 && value <= 65535 ? value : null;
            }
            if (typeof value === 'string' && value.trim().length > 0) {
                var parsed = Number.parseInt(value.trim(), 10);
                return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : null;
            }
            return null;
        };
        var defaultPort = (_g = sanitizePort((_f = options.port) !== null && _f !== void 0 ? _f : process.env.MCP_AUTOMATION_WS_PORT)) !== null && _g !== void 0 ? _g : constants_js_1.DEFAULT_AUTOMATION_PORT;
        var configuredPortValues = options.ports
            ? options.ports
            : (_h = process.env.MCP_AUTOMATION_WS_PORTS) === null || _h === void 0 ? void 0 : _h.split(',').map(function (token) { return token.trim(); }).filter(function (token) { return token.length > 0; });
        var sanitizedPorts = Array.isArray(configuredPortValues)
            ? configuredPortValues
                .map(function (value) { return sanitizePort(value); })
                .filter(function (port) { return port !== null; })
            : [];
        if (!sanitizedPorts.includes(defaultPort)) {
            sanitizedPorts.unshift(defaultPort);
        }
        if (sanitizedPorts.length === 0) {
            sanitizedPorts.push(constants_js_1.DEFAULT_AUTOMATION_PORT);
        }
        _this.ports = Array.from(new Set(sanitizedPorts));
        var defaultProtocols = constants_js_1.DEFAULT_NEGOTIATED_PROTOCOLS;
        var userProtocols = Array.isArray(options.protocols)
            ? options.protocols.filter(function (proto) { return typeof proto === 'string' && proto.trim().length > 0; })
            : [];
        var envProtocols = process.env.MCP_AUTOMATION_WS_PROTOCOLS
            ? process.env.MCP_AUTOMATION_WS_PROTOCOLS.split(',')
                .map(function (token) { return token.trim(); })
                .filter(function (token) { return token.length > 0; })
            : [];
        _this.negotiatedProtocols = Array.from(new Set(__spreadArray(__spreadArray(__spreadArray([], userProtocols, true), envProtocols, true), defaultProtocols, true)));
        _this.port = _this.ports[0];
        _this.serverLegacyEnabled =
            (_j = options.serverLegacyEnabled) !== null && _j !== void 0 ? _j : process.env.MCP_AUTOMATION_SERVER_LEGACY !== 'false';
        _this.capabilityToken =
            (_l = (_k = options.capabilityToken) !== null && _k !== void 0 ? _k : process.env.MCP_AUTOMATION_CAPABILITY_TOKEN) !== null && _l !== void 0 ? _l : undefined;
        _this.enabled = (_m = options.enabled) !== null && _m !== void 0 ? _m : process.env.MCP_AUTOMATION_BRIDGE_ENABLED !== 'false';
        _this.serverName = (_q = (_p = (_o = options.serverName) !== null && _o !== void 0 ? _o : process.env.MCP_SERVER_NAME) !== null && _p !== void 0 ? _p : packageInfo.name) !== null && _q !== void 0 ? _q : 'unreal-engine-mcp';
        _this.serverVersion = (_u = (_t = (_s = (_r = options.serverVersion) !== null && _r !== void 0 ? _r : process.env.MCP_SERVER_VERSION) !== null && _s !== void 0 ? _s : packageInfo.version) !== null && _t !== void 0 ? _t : process.env.npm_package_version) !== null && _u !== void 0 ? _u : '0.0.0';
        var heartbeatIntervalMs = ((_v = options.heartbeatIntervalMs) !== null && _v !== void 0 ? _v : constants_js_1.DEFAULT_HEARTBEAT_INTERVAL_MS) > 0
            ? ((_w = options.heartbeatIntervalMs) !== null && _w !== void 0 ? _w : constants_js_1.DEFAULT_HEARTBEAT_INTERVAL_MS)
            : 0;
        var parseNonNegativeInt = function (value, fallback) {
            if (typeof value === 'number' && Number.isInteger(value)) {
                return value >= 0 ? value : fallback;
            }
            if (typeof value === 'string' && value.trim().length > 0) {
                var parsed = Number.parseInt(value.trim(), 10);
                return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
            }
            return fallback;
        };
        var parseBoolean = function (value, defaultValue) {
            if (typeof value === 'boolean') {
                return value;
            }
            if (typeof value === 'string') {
                var normalized = value.trim().toLowerCase();
                if (normalized === 'true')
                    return true;
                if (normalized === 'false')
                    return false;
            }
            return defaultValue;
        };
        var maxPendingRequests = Math.max(1, (_x = options.maxPendingRequests) !== null && _x !== void 0 ? _x : constants_js_1.DEFAULT_MAX_PENDING_REQUESTS);
        var maxConcurrentConnections = Math.max(1, (_y = options.maxConcurrentConnections) !== null && _y !== void 0 ? _y : 10);
        _this.maxQueuedRequests = Math.max(0, (_z = options.maxQueuedRequests) !== null && _z !== void 0 ? _z : constants_js_1.DEFAULT_MAX_QUEUED_REQUESTS);
        _this.useTls = parseBoolean((_0 = options.useTls) !== null && _0 !== void 0 ? _0 : process.env.MCP_AUTOMATION_USE_TLS, false);
        var maxInboundMessagesPerMinute = parseNonNegativeInt((_1 = options.maxInboundMessagesPerMinute) !== null && _1 !== void 0 ? _1 : process.env.MCP_AUTOMATION_MAX_MESSAGES_PER_MINUTE, constants_js_1.DEFAULT_MAX_INBOUND_MESSAGES_PER_MINUTE);
        var maxInboundAutomationRequestsPerMinute = parseNonNegativeInt((_2 = options.maxInboundAutomationRequestsPerMinute) !== null && _2 !== void 0 ? _2 : process.env.MCP_AUTOMATION_MAX_AUTOMATION_REQUESTS_PER_MINUTE, constants_js_1.DEFAULT_MAX_INBOUND_AUTOMATION_REQUESTS_PER_MINUTE);
        var rawClientHost = (_5 = (_4 = (_3 = options.clientHost) !== null && _3 !== void 0 ? _3 : process.env.MCP_AUTOMATION_CLIENT_HOST) !== null && _4 !== void 0 ? _4 : process.env.MCP_AUTOMATION_HOST) !== null && _5 !== void 0 ? _5 : constants_js_1.DEFAULT_AUTOMATION_HOST;
        _this.clientHost = normalizeHost(rawClientHost, 'Automation bridge client host');
        _this.clientPort = (_7 = (_6 = options.clientPort) !== null && _6 !== void 0 ? _6 : sanitizePort(process.env.MCP_AUTOMATION_CLIENT_PORT)) !== null && _7 !== void 0 ? _7 : constants_js_1.DEFAULT_AUTOMATION_PORT;
        _this.maxConcurrentConnections = maxConcurrentConnections;
        // Initialize components
        _this.connectionManager = new connection_manager_js_1.ConnectionManager(heartbeatIntervalMs, maxInboundMessagesPerMinute, maxInboundAutomationRequestsPerMinute);
        _this.requestTracker = new request_tracker_js_1.RequestTracker(maxPendingRequests);
        _this.handshakeHandler = new handshake_js_1.HandshakeHandler(_this.capabilityToken);
        _this.messageHandler = new message_handler_js_1.MessageHandler(_this.requestTracker);
        return _this;
        // Forward events from connection manager
        // Note: ConnectionManager doesn't emit 'connected'/'disconnected' directly in the same way,
        // we handle socket events here and use ConnectionManager to track state.
    }
    AutomationBridge.prototype.on = function (event, listener) {
        return _super.prototype.on.call(this, event, listener);
    };
    AutomationBridge.prototype.once = function (event, listener) {
        return _super.prototype.once.call(this, event, listener);
    };
    AutomationBridge.prototype.off = function (event, listener) {
        return _super.prototype.off.call(this, event, listener);
    };
    AutomationBridge.prototype.start = function () {
        if (!this.enabled) {
            this.log.info('Automation bridge disabled by configuration.');
            return;
        }
        var url = this.getClientUrl();
        this.log.info("Automation bridge connecting to Unreal server at ".concat(url));
        this.startClient();
    };
    AutomationBridge.prototype.startClient = function () {
        try {
            var url = this.getClientUrl();
            this.log.info("Connecting to Unreal Engine automation server at ".concat(url));
            this.log.debug("Negotiated protocols: ".concat(JSON.stringify(this.negotiatedProtocols)));
            var protocols = this.negotiatedProtocols.length === 1
                ? this.negotiatedProtocols[0]
                : this.negotiatedProtocols;
            this.log.debug("Using WebSocket protocols arg: ".concat(JSON.stringify(protocols)));
            var headers = this.capabilityToken
                ? {
                    'X-MCP-Capability': this.capabilityToken,
                    'X-MCP-Capability-Token': this.capabilityToken
                }
                : undefined;
            var socket = new ws_1.WebSocket(url, protocols, {
                headers: headers,
                perMessageDeflate: false
            });
            this.handleClientConnection(socket);
        }
        catch (error) {
            var errorObj = error instanceof Error ? error : new Error(String(error));
            this.lastError = { message: errorObj.message, at: new Date() };
            this.log.error('Failed to create WebSocket client connection', errorObj);
            var errorWithPort = Object.assign(errorObj, { port: this.clientPort });
            this.emitAutomation('error', errorWithPort);
        }
    };
    AutomationBridge.prototype.handleClientConnection = function (socket) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                socket.on('open', function () { return __awaiter(_this, void 0, void 0, function () {
                    var metadata, socketWithInternal, underlying, remoteAddr, remotePort, getRawDataByteLength_1, rawDataToUtf8String_1, error_1, err;
                    var _this = this;
                    var _a, _b;
                    return __generator(this, function (_c) {
                        switch (_c.label) {
                            case 0:
                                this.log.info('Automation bridge client connected, starting handshake');
                                _c.label = 1;
                            case 1:
                                _c.trys.push([1, 3, , 4]);
                                return [4 /*yield*/, this.handshakeHandler.initiateHandshake(socket)];
                            case 2:
                                metadata = _c.sent();
                                this.lastHandshakeAt = new Date();
                                this.lastHandshakeMetadata = metadata;
                                this.lastHandshakeFailure = undefined;
                                this.connectionManager.updateLastMessageTime();
                                socketWithInternal = socket;
                                underlying = socketWithInternal._socket || socketWithInternal.socket;
                                remoteAddr = (_a = underlying === null || underlying === void 0 ? void 0 : underlying.remoteAddress) !== null && _a !== void 0 ? _a : undefined;
                                remotePort = (_b = underlying === null || underlying === void 0 ? void 0 : underlying.remotePort) !== null && _b !== void 0 ? _b : undefined;
                                this.connectionManager.registerSocket(socket, this.clientPort, metadata, remoteAddr, remotePort);
                                this.connectionManager.startHeartbeat();
                                this.emitAutomation('connected', {
                                    socket: socket,
                                    metadata: metadata,
                                    port: this.clientPort,
                                    protocol: socket.protocol || null
                                });
                                getRawDataByteLength_1 = function (data) {
                                    if (typeof data === 'string') {
                                        return Buffer.byteLength(data, 'utf8');
                                    }
                                    if (Buffer.isBuffer(data)) {
                                        return data.length;
                                    }
                                    if (Array.isArray(data)) {
                                        return data.reduce(function (total, item) { return total + (Buffer.isBuffer(item) ? item.length : 0); }, 0);
                                    }
                                    if (data instanceof ArrayBuffer) {
                                        return data.byteLength;
                                    }
                                    if (ArrayBuffer.isView(data)) {
                                        return data.byteLength;
                                    }
                                    return 0;
                                };
                                rawDataToUtf8String_1 = function (data, byteLengthHint) {
                                    if (typeof data === 'string') {
                                        return data;
                                    }
                                    if (Buffer.isBuffer(data)) {
                                        return data.toString('utf8');
                                    }
                                    if (Array.isArray(data)) {
                                        var buffers = data.filter(function (item) { return Buffer.isBuffer(item); });
                                        var totalLength = typeof byteLengthHint === 'number'
                                            ? byteLengthHint
                                            : buffers.reduce(function (total, item) { return total + item.length; }, 0);
                                        return Buffer.concat(buffers, totalLength).toString('utf8');
                                    }
                                    if (data instanceof ArrayBuffer) {
                                        return Buffer.from(data).toString('utf8');
                                    }
                                    if (ArrayBuffer.isView(data)) {
                                        return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
                                    }
                                    return '';
                                };
                                socket.on('message', function (data) {
                                    try {
                                        var byteLength = getRawDataByteLength_1(data);
                                        if (byteLength > constants_js_1.MAX_WS_MESSAGE_SIZE_BYTES) {
                                            _this.log.error("Received oversized message (".concat(byteLength, " bytes, max: ").concat(constants_js_1.MAX_WS_MESSAGE_SIZE_BYTES, "). Dropping."));
                                            return;
                                        }
                                        var text = rawDataToUtf8String_1(data, byteLength);
                                        _this.log.debug("[AutomationBridge Client] Received message: ".concat(text.substring(0, 1000)));
                                        var parsed = JSON.parse(text);
                                        // Check rate limit BEFORE schema validation to prevent DoS via invalid messages
                                        if (!_this.connectionManager.recordInboundMessage(socket, false)) {
                                            _this.log.warn('Inbound message rate limit exceeded; closing connection.');
                                            socket.close(4008, 'Rate limit exceeded');
                                            return;
                                        }
                                        var validation = message_schema_js_1.automationMessageSchema.safeParse(parsed);
                                        if (!validation.success) {
                                            _this.log.warn('Dropped invalid automation message', validation.error.format());
                                            return;
                                        }
                                        _this.connectionManager.updateLastMessageTime();
                                        _this.messageHandler.handleMessage(validation.data);
                                        _this.emitAutomation('message', validation.data);
                                    }
                                    catch (error) {
                                        _this.log.error('Error handling message', error);
                                    }
                                });
                                return [3 /*break*/, 4];
                            case 3:
                                error_1 = _c.sent();
                                err = error_1 instanceof Error ? error_1 : new Error(String(error_1));
                                this.lastHandshakeFailure = { reason: err.message, at: new Date() };
                                this.emitAutomation('handshakeFailed', { reason: err.message, port: this.clientPort });
                                return [3 /*break*/, 4];
                            case 4: return [2 /*return*/];
                        }
                    });
                }); });
                socket.on('error', function (error) {
                    _this.log.error('Automation bridge client socket error', error);
                    var errObj = error instanceof Error ? error : new Error(String(error));
                    _this.lastError = { message: errObj.message, at: new Date() };
                    var errWithPort = Object.assign(errObj, { port: _this.clientPort });
                    _this.emitAutomation('error', errWithPort);
                });
                socket.on('close', function (code, reasonBuffer) {
                    var reason = reasonBuffer.toString('utf8');
                    var socketInfo = _this.connectionManager.removeSocket(socket);
                    if (socketInfo) {
                        _this.lastDisconnect = { code: code, reason: reason, at: new Date() };
                        _this.emitAutomation('disconnected', {
                            code: code,
                            reason: reason,
                            port: socketInfo.port,
                            protocol: socketInfo.protocol || null
                        });
                        _this.log.info("Automation bridge client socket closed (code=".concat(code, ", reason=").concat(reason, ")"));
                        if (!_this.connectionManager.isConnected()) {
                            _this.requestTracker.rejectAll(new Error(reason || 'Connection lost'));
                        }
                    }
                });
                return [2 /*return*/];
            });
        });
    };
    AutomationBridge.prototype.formatHostForUrl = function (host) {
        if (!host.includes(':')) {
            return host;
        }
        // Strip zone ID if present (e.g., fe80::1%eth0 -> fe80::1)
        // Zone IDs are not supported by Node.js URL parser and are only
        // meaningful for link-local addresses on the local machine
        var zoneIndex = host.indexOf('%');
        var hostWithoutZone = zoneIndex >= 0 ? host.slice(0, zoneIndex) : host;
        return "[".concat(hostWithoutZone, "]");
    };
    AutomationBridge.prototype.getClientUrl = function () {
        var scheme = this.useTls ? 'wss' : 'ws';
        return "".concat(scheme, "://").concat(this.formatHostForUrl(this.clientHost), ":").concat(this.clientPort);
    };
    AutomationBridge.prototype.stop = function () {
        if (this.isConnected()) {
            this.broadcast({
                type: 'bridge_shutdown',
                timestamp: new Date().toISOString(),
                reason: 'Server shutting down'
            });
        }
        this.connectionManager.closeAll(1001, 'Server shutdown');
        this.lastHandshakeAck = undefined;
        this.requestTracker.rejectAll(new Error('Automation bridge server stopped'));
    };
    AutomationBridge.prototype.isConnected = function () {
        return this.connectionManager.isConnected();
    };
    AutomationBridge.prototype.getStatus = function () {
        var _this = this;
        var _a, _b, _c, _d, _e, _f, _g, _h;
        var connectionInfos = Array.from(this.connectionManager.getActiveSockets().entries()).map(function (_a) {
            var _b, _c, _d;
            var socket = _a[0], info = _a[1];
            return ({
                connectionId: info.connectionId,
                sessionId: (_b = info.sessionId) !== null && _b !== void 0 ? _b : null,
                remoteAddress: (_c = info.remoteAddress) !== null && _c !== void 0 ? _c : null,
                remotePort: (_d = info.remotePort) !== null && _d !== void 0 ? _d : null,
                port: info.port,
                connectedAt: info.connectedAt.toISOString(),
                protocol: info.protocol || null,
                readyState: socket.readyState,
                isPrimary: socket === _this.connectionManager.getPrimarySocket()
            });
        });
        return {
            enabled: this.enabled,
            host: this.host,
            port: this.port,
            configuredPorts: __spreadArray([], this.ports, true),
            listeningPorts: [], // We are client-only now
            connected: this.isConnected(),
            connectedAt: connectionInfos.length > 0 ? connectionInfos[0].connectedAt : null,
            activePort: connectionInfos.length > 0 ? connectionInfos[0].port : null,
            negotiatedProtocol: connectionInfos.length > 0 ? connectionInfos[0].protocol : null,
            supportedProtocols: __spreadArray([], this.negotiatedProtocols, true),
            supportedOpcodes: ['automation_request'],
            expectedResponseOpcodes: ['automation_response'],
            capabilityTokenRequired: Boolean(this.capabilityToken),
            lastHandshakeAt: (_b = (_a = this.lastHandshakeAt) === null || _a === void 0 ? void 0 : _a.toISOString()) !== null && _b !== void 0 ? _b : null,
            lastHandshakeMetadata: (_c = this.lastHandshakeMetadata) !== null && _c !== void 0 ? _c : null,
            lastHandshakeAck: (_d = this.lastHandshakeAck) !== null && _d !== void 0 ? _d : null,
            lastHandshakeFailure: this.lastHandshakeFailure
                ? { reason: this.lastHandshakeFailure.reason, at: this.lastHandshakeFailure.at.toISOString() }
                : null,
            lastDisconnect: this.lastDisconnect
                ? { code: this.lastDisconnect.code, reason: this.lastDisconnect.reason, at: this.lastDisconnect.at.toISOString() }
                : null,
            lastError: this.lastError
                ? { message: this.lastError.message, at: this.lastError.at.toISOString() }
                : null,
            lastMessageAt: (_f = (_e = this.connectionManager.getLastMessageTime()) === null || _e === void 0 ? void 0 : _e.toISOString()) !== null && _f !== void 0 ? _f : null,
            lastRequestSentAt: (_h = (_g = this.requestTracker.getLastRequestSentAt()) === null || _g === void 0 ? void 0 : _g.toISOString()) !== null && _h !== void 0 ? _h : null,
            pendingRequests: this.requestTracker.getPendingCount(),
            pendingRequestDetails: this.requestTracker.getPendingDetails(),
            connections: connectionInfos,
            webSocketListening: false,
            serverLegacyEnabled: this.serverLegacyEnabled,
            serverName: this.serverName,
            serverVersion: this.serverVersion,
            maxConcurrentConnections: this.maxConcurrentConnections,
            maxPendingRequests: this.requestTracker.getMaxPendingRequests(),
            heartbeatIntervalMs: this.connectionManager.getHeartbeatIntervalMs()
        };
    };
    AutomationBridge.prototype.sendAutomationRequest = function (action_1) {
        return __awaiter(this, arguments, void 0, function (action, payload, options) {
            var connectTimeout_1, timeoutId_1, timeoutPromise, err_1, errObj;
            var _this = this;
            var _a;
            if (payload === void 0) { payload = {}; }
            if (options === void 0) { options = {}; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!!this.isConnected()) return [3 /*break*/, 9];
                        if (!this.enabled) return [3 /*break*/, 8];
                        this.log.info('Automation bridge not connected, attempting lazy connection...');
                        // Avoid multiple simultaneous connection attempts using lock
                        if (!this.connectionPromise && !this.connectionLock) {
                            this.connectionLock = true;
                            this.connectionPromise = new Promise(function (resolve, reject) {
                                var onConnect = function () {
                                    cleanup();
                                    resolve();
                                };
                                // We map errors to rejects, but we should be careful about which errors.
                                // A socket error might happen during connection.
                                var onError = function (err) {
                                    cleanup();
                                    reject(err);
                                };
                                // Also listen for handshake failure
                                var onHandshakeFail = function (err) {
                                    cleanup();
                                    reject(new Error("Handshake failed: ".concat(String(err.reason))));
                                };
                                var cleanup = function () {
                                    _this.off('connected', onConnect);
                                    _this.off('error', onError);
                                    _this.off('handshakeFailed', onHandshakeFail);
                                    // Clear lock and promise so next attempt can try again
                                    _this.connectionLock = false;
                                    _this.connectionPromise = undefined;
                                };
                                _this.once('connected', onConnect);
                                _this.once('error', onError);
                                _this.once('handshakeFailed', onHandshakeFail);
                                try {
                                    _this.startClient();
                                }
                                catch (e) {
                                    onError(e);
                                }
                            });
                        }
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 6, , 7]);
                        connectTimeout_1 = 5000;
                        timeoutPromise = new Promise(function (_, reject) {
                            timeoutId_1 = setTimeout(function () { return reject(new Error('Lazy connection timeout')); }, connectTimeout_1);
                        });
                        _b.label = 2;
                    case 2:
                        _b.trys.push([2, , 4, 5]);
                        return [4 /*yield*/, Promise.race([this.connectionPromise, timeoutPromise])];
                    case 3:
                        _b.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        if (timeoutId_1)
                            clearTimeout(timeoutId_1);
                        return [7 /*endfinally*/];
                    case 5: return [3 /*break*/, 7];
                    case 6:
                        err_1 = _b.sent();
                        this.log.error('Lazy connection failed', err_1);
                        errObj = err_1;
                        throw new Error("Failed to establish connection to Unreal Engine: ".concat(String((_a = errObj === null || errObj === void 0 ? void 0 : errObj.message) !== null && _a !== void 0 ? _a : err_1)));
                    case 7: return [3 /*break*/, 9];
                    case 8: throw new Error('Automation bridge disabled');
                    case 9:
                        if (!this.isConnected()) {
                            throw new Error('Automation bridge not connected');
                        }
                        if (this.requestTracker.getPendingCount() >= this.requestTracker.getMaxPendingRequests()) {
                            if (this.queuedRequestItems.length >= this.maxQueuedRequests) {
                                throw new Error("Automation bridge request queue is full (max: ".concat(this.maxQueuedRequests, "). Please retry later."));
                            }
                            return [2 /*return*/, new Promise(function (resolve, reject) {
                                    _this.queuedRequestItems.push({
                                        resolve: resolve,
                                        reject: reject,
                                        action: action,
                                        payload: payload,
                                        options: options
                                    });
                                })];
                        }
                        return [2 /*return*/, this.sendRequestInternal(action, payload, options)];
                }
            });
        });
    };
    AutomationBridge.prototype.sendRequestInternal = function (action, payload, options) {
        return __awaiter(this, void 0, void 0, function () {
            var timeoutMs, coalesceKey, existing, _a, requestId, promise, message, resultPromise;
            var _this = this;
            var _b;
            return __generator(this, function (_c) {
                timeoutMs = (_b = options.timeoutMs) !== null && _b !== void 0 ? _b : config_js_1.config.MCP_REQUEST_TIMEOUT_MS;
                coalesceKey = this.requestTracker.createCoalesceKey(action, payload);
                if (coalesceKey) {
                    existing = this.requestTracker.getCoalescedRequest(coalesceKey);
                    if (existing) {
                        return [2 /*return*/, existing];
                    }
                }
                _a = this.requestTracker.createRequest(action, payload, timeoutMs), requestId = _a.requestId, promise = _a.promise;
                if (coalesceKey) {
                    this.requestTracker.setCoalescedRequest(coalesceKey, promise);
                }
                message = {
                    type: 'automation_request',
                    requestId: requestId,
                    action: action,
                    payload: payload
                };
                resultPromise = promise;
                // Ensure we process the queue when this request finishes
                resultPromise.finally(function () {
                    _this.processRequestQueue();
                }).catch(function () { }); // catch to prevent unhandled rejection during finally chain? no, finally returns new promise
                if (this.send(message)) {
                    this.requestTracker.updateLastRequestSentAt();
                    return [2 /*return*/, resultPromise];
                }
                else {
                    this.requestTracker.rejectRequest(requestId, new Error('Failed to send request'));
                    throw new Error('Failed to send request');
                }
                return [2 /*return*/];
            });
        });
    };
    AutomationBridge.prototype.processRequestQueue = function () {
        if (this.queuedRequestItems.length === 0)
            return;
        // while we have capacity and items
        while (this.queuedRequestItems.length > 0 &&
            this.requestTracker.getPendingCount() < this.requestTracker.getMaxPendingRequests()) {
            var item = this.queuedRequestItems.shift();
            if (item) {
                this.sendRequestInternal(item.action, item.payload, item.options)
                    .then(item.resolve)
                    .catch(item.reject);
            }
        }
    };
    AutomationBridge.prototype.send = function (payload) {
        var primarySocket = this.connectionManager.getPrimarySocket();
        if (!primarySocket || primarySocket.readyState !== ws_1.WebSocket.OPEN) {
            this.log.warn('Attempted to send automation message without an active primary connection');
            return false;
        }
        try {
            primarySocket.send(JSON.stringify(payload));
            return true;
        }
        catch (error) {
            this.log.error('Failed to send automation message', error);
            var errObj = error instanceof Error ? error : new Error(String(error));
            var primaryInfo = this.connectionManager.getActiveSockets().get(primarySocket);
            var errorWithPort = Object.assign(errObj, { port: primaryInfo === null || primaryInfo === void 0 ? void 0 : primaryInfo.port });
            this.emitAutomation('error', errorWithPort);
            return false;
        }
    };
    AutomationBridge.prototype.broadcast = function (payload) {
        var sockets = this.connectionManager.getActiveSockets();
        if (sockets.size === 0) {
            this.log.warn('Attempted to broadcast automation message without any active connections');
            return false;
        }
        var sentCount = 0;
        for (var _i = 0, sockets_1 = sockets; _i < sockets_1.length; _i++) {
            var socket = sockets_1[_i][0];
            if (socket.readyState === ws_1.WebSocket.OPEN) {
                try {
                    socket.send(JSON.stringify(payload));
                    sentCount++;
                }
                catch (error) {
                    this.log.error('Failed to broadcast automation message to socket', error);
                }
            }
        }
        return sentCount > 0;
    };
    AutomationBridge.prototype.emitAutomation = function (event) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        this.emit.apply(this, __spreadArray([event], args, false));
    };
    return AutomationBridge;
}(node_events_1.EventEmitter));
exports.AutomationBridge = AutomationBridge;

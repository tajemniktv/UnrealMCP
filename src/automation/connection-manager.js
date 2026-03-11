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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionManager = void 0;
var ws_1 = require("ws");
var logger_js_1 = require("../utils/logger.js");
var node_crypto_1 = require("node:crypto");
var node_events_1 = require("node:events");
var ConnectionManager = /** @class */ (function (_super) {
    __extends(ConnectionManager, _super);
    function ConnectionManager(heartbeatIntervalMs, maxMessagesPerMinute, maxAutomationRequestsPerMinute) {
        var _this = _super.call(this) || this;
        _this.heartbeatIntervalMs = heartbeatIntervalMs;
        _this.maxMessagesPerMinute = maxMessagesPerMinute;
        _this.maxAutomationRequestsPerMinute = maxAutomationRequestsPerMinute;
        _this.activeSockets = new Map();
        _this.log = new logger_js_1.Logger('ConnectionManager');
        _this.rateLimitState = new Map();
        return _this;
    }
    /**
     * Get the configured heartbeat interval in milliseconds.
     * @returns The heartbeat interval or 0 if disabled
     */
    ConnectionManager.prototype.getHeartbeatIntervalMs = function () {
        return this.heartbeatIntervalMs;
    };
    ConnectionManager.prototype.registerSocket = function (socket, port, metadata, remoteAddress, remotePort) {
        var _this = this;
        var connectionId = (0, node_crypto_1.randomUUID)();
        var sessionId = metadata && typeof metadata.sessionId === 'string' ? metadata.sessionId : undefined;
        var socketInfo = {
            connectionId: connectionId,
            port: port,
            connectedAt: new Date(),
            protocol: socket.protocol || undefined,
            sessionId: sessionId,
            remoteAddress: remoteAddress !== null && remoteAddress !== void 0 ? remoteAddress : undefined,
            remotePort: typeof remotePort === 'number' ? remotePort : undefined
        };
        this.activeSockets.set(socket, socketInfo);
        this.rateLimitState.set(socket, { windowStartMs: Date.now(), messageCount: 0, automationCount: 0 });
        // Set as primary socket if this is the first connection
        if (!this.primarySocket) {
            this.primarySocket = socket;
        }
        // Handle WebSocket pong frames for heartbeat tracking
        socket.on('pong', function () {
            _this.lastMessageAt = new Date();
        });
        // Auto-cleanup on close or error
        socket.once('close', function () {
            _this.removeSocket(socket);
        });
        socket.once('error', function (error) {
            _this.log.error('Socket error in ConnectionManager', error);
            _this.removeSocket(socket);
        });
    };
    ConnectionManager.prototype.removeSocket = function (socket) {
        var info = this.activeSockets.get(socket);
        if (info) {
            this.activeSockets.delete(socket);
            this.rateLimitState.delete(socket);
            if (socket === this.primarySocket) {
                this.primarySocket = this.activeSockets.size > 0 ? this.activeSockets.keys().next().value : undefined;
                if (this.activeSockets.size === 0) {
                    this.stopHeartbeat();
                }
            }
        }
        return info;
    };
    ConnectionManager.prototype.recordInboundMessage = function (socket, isAutomationRequest) {
        var _a;
        if (this.maxMessagesPerMinute <= 0 && this.maxAutomationRequestsPerMinute <= 0) {
            return true;
        }
        var nowMs = Date.now();
        var state = (_a = this.rateLimitState.get(socket)) !== null && _a !== void 0 ? _a : { windowStartMs: nowMs, messageCount: 0, automationCount: 0 };
        var windowElapsedMs = nowMs - state.windowStartMs;
        if (windowElapsedMs >= 60000) {
            state.windowStartMs = nowMs;
            state.messageCount = 0;
            state.automationCount = 0;
        }
        state.messageCount += 1;
        if (isAutomationRequest) {
            state.automationCount += 1;
        }
        this.rateLimitState.set(socket, state);
        if (this.maxMessagesPerMinute > 0 && state.messageCount >= this.maxMessagesPerMinute) {
            this.log.warn("Inbound message rate exceeded (".concat(state.messageCount, "/").concat(this.maxMessagesPerMinute, " per minute)."));
            return false;
        }
        if (isAutomationRequest && this.maxAutomationRequestsPerMinute > 0 && state.automationCount >= this.maxAutomationRequestsPerMinute) {
            this.log.warn("Inbound automation request rate exceeded (".concat(state.automationCount, "/").concat(this.maxAutomationRequestsPerMinute, " per minute)."));
            return false;
        }
        return true;
    };
    ConnectionManager.prototype.getActiveSockets = function () {
        return this.activeSockets;
    };
    ConnectionManager.prototype.getPrimarySocket = function () {
        return this.primarySocket;
    };
    ConnectionManager.prototype.isConnected = function () {
        return this.activeSockets.size > 0;
    };
    ConnectionManager.prototype.startHeartbeat = function () {
        var _this = this;
        if (this.heartbeatIntervalMs <= 0)
            return;
        if (this.heartbeatTimer)
            clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = setInterval(function () {
            if (_this.activeSockets.size === 0) {
                _this.stopHeartbeat();
                return;
            }
            var pingPayload = JSON.stringify({
                type: 'bridge_ping',
                timestamp: new Date().toISOString()
            });
            for (var _i = 0, _a = _this.activeSockets; _i < _a.length; _i++) {
                var socket = _a[_i][0];
                if (socket.readyState === ws_1.WebSocket.OPEN) {
                    try {
                        socket.ping();
                        socket.send(pingPayload);
                    }
                    catch (error) {
                        _this.log.error('Failed to send heartbeat', error);
                    }
                }
            }
        }, this.heartbeatIntervalMs);
    };
    ConnectionManager.prototype.stopHeartbeat = function () {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = undefined;
        }
    };
    ConnectionManager.prototype.updateLastMessageTime = function () {
        this.lastMessageAt = new Date();
    };
    ConnectionManager.prototype.getLastMessageTime = function () {
        return this.lastMessageAt;
    };
    ConnectionManager.prototype.closeAll = function (code, reason) {
        this.stopHeartbeat();
        for (var _i = 0, _a = this.activeSockets; _i < _a.length; _i++) {
            var socket = _a[_i][0];
            socket.removeAllListeners();
            socket.close(code, reason);
        }
        this.activeSockets.clear();
        this.rateLimitState.clear();
        this.primarySocket = undefined;
    };
    return ConnectionManager;
}(node_events_1.EventEmitter));
exports.ConnectionManager = ConnectionManager;

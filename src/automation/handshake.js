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
Object.defineProperty(exports, "__esModule", { value: true });
exports.HandshakeHandler = void 0;
var ws_1 = require("ws");
var logger_js_1 = require("../utils/logger.js");
var message_schema_js_1 = require("./message-schema.js");
var node_events_1 = require("node:events");
var HandshakeHandler = /** @class */ (function (_super) {
    __extends(HandshakeHandler, _super);
    function HandshakeHandler(capabilityToken) {
        var _this = _super.call(this) || this;
        _this.capabilityToken = capabilityToken;
        _this.log = new logger_js_1.Logger('HandshakeHandler');
        _this.DEFAULT_HANDSHAKE_TIMEOUT_MS = 5000;
        return _this;
    }
    HandshakeHandler.prototype.initiateHandshake = function (socket, timeoutMs) {
        var _this = this;
        if (timeoutMs === void 0) { timeoutMs = this.DEFAULT_HANDSHAKE_TIMEOUT_MS; }
        return new Promise(function (resolve, reject) {
            var handshakeComplete = false;
            var timeout = setTimeout(function () {
                if (!handshakeComplete) {
                    _this.log.warn('Automation bridge client handshake timed out');
                    socket.close(4002, 'Handshake timeout');
                    reject(new Error('Handshake timeout'));
                }
            }, timeoutMs);
            var onMessage = function (data) {
                var parsed;
                var text = typeof data === 'string' ? data : data.toString('utf8');
                try {
                    parsed = JSON.parse(text);
                }
                catch (error) {
                    _this.log.error('Received non-JSON automation message during handshake', error);
                    socket.close(4003, 'Invalid JSON payload');
                    cleanup();
                    reject(new Error('Invalid JSON payload'));
                    return;
                }
                var validation = message_schema_js_1.bridgeAckSchema.safeParse(parsed);
                if (validation.success) {
                    handshakeComplete = true;
                    cleanup();
                    var metadata = _this.sanitizeHandshakeMetadata(validation.data);
                    resolve(metadata);
                    return;
                }
                var typeHint = typeof parsed.type === 'string' ? parsed.type : 'unknown';
                _this.log.warn("Expected bridge_ack handshake, received ".concat(typeHint), validation.error.format());
                socket.close(4004, 'Handshake expected bridge_ack');
                cleanup();
                reject(new Error("Handshake expected bridge_ack, got ".concat(typeHint)));
            };
            var onError = function (error) {
                cleanup();
                reject(error);
            };
            var onClose = function () {
                cleanup();
                reject(new Error('Socket closed during handshake'));
            };
            var cleanup = function () {
                clearTimeout(timeout);
                socket.off('message', onMessage);
                socket.off('error', onError);
                socket.off('close', onClose);
            };
            socket.on('message', onMessage);
            socket.on('error', onError);
            socket.on('close', onClose);
            // Send bridge_hello with a slight delay to ensure the server has registered its handlers
            setTimeout(function () {
                if (socket.readyState === ws_1.WebSocket.OPEN) {
                    var helloPayload = {
                        type: 'bridge_hello',
                        capabilityToken: _this.capabilityToken || undefined
                    };
                    _this.log.debug("Sending bridge_hello (delayed): ".concat(JSON.stringify(helloPayload)));
                    socket.send(JSON.stringify(helloPayload));
                }
                else {
                    _this.log.warn('Socket closed before bridge_hello could be sent');
                }
            }, 500);
        });
    };
    HandshakeHandler.prototype.sanitizeHandshakeMetadata = function (payload) {
        var sanitized = __assign({}, payload);
        delete sanitized.type;
        if ('capabilityToken' in sanitized) {
            sanitized.capabilityToken = 'REDACTED';
        }
        return sanitized;
    };
    return HandshakeHandler;
}(node_events_1.EventEmitter));
exports.HandshakeHandler = HandshakeHandler;

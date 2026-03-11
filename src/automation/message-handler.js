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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageHandler = void 0;
var logger_js_1 = require("../utils/logger.js");
function FStringSafe(val) {
    try {
        if (val === undefined || val === null)
            return '';
        if (typeof val === 'string')
            return val;
        return JSON.stringify(val);
    }
    catch (_a) {
        try {
            return String(val);
        }
        catch (_b) {
            return '';
        }
    }
}
var MessageHandler = /** @class */ (function () {
    function MessageHandler(requestTracker) {
        this.requestTracker = requestTracker;
        this.log = new logger_js_1.Logger('MessageHandler');
    }
    MessageHandler.prototype.handleMessage = function (message) {
        switch (message.type) {
            case 'automation_response':
                this.handleAutomationResponse(message);
                break;
            case 'bridge_ping':
                // Handled by connection manager or ignored if client
                break;
            case 'bridge_pong':
                // Handled by connection manager
                break;
            case 'bridge_goodbye':
                this.log.info('Automation bridge client initiated shutdown.', message);
                break;
            case 'automation_event':
                this.handleAutomationEvent(message);
                break;
            case 'progress_update':
                this.handleProgressUpdate(message);
                break;
            default:
                this.log.debug('Received automation bridge message with no handler', message);
                break;
        }
    };
    MessageHandler.prototype.handleAutomationResponse = function (response) {
        var _this = this;
        var requestId = response.requestId;
        if (!requestId) {
            this.log.warn('Received automation_response without requestId');
            return;
        }
        var pending = this.requestTracker.getPendingRequest(requestId);
        if (!pending) {
            this.log.debug("No pending automation request found for requestId=".concat(requestId));
            return;
        }
        // Enforce action match logic
        var enforcedResponse = this.enforceActionMatch(response, pending.action);
        if (pending.waitForEvent) {
            if (!pending.initialResponse) {
                // Store initial response and wait for event
                pending.initialResponse = enforcedResponse;
                // If the initial response indicates failure, resolve immediately
                if (enforcedResponse.success === false) {
                    this.requestTracker.resolveRequest(requestId, enforcedResponse);
                    return;
                }
                // If the response indicates it's already saved/done, resolve immediately
                var result = enforcedResponse.result;
                if (result && result.saved === true) {
                    this.requestTracker.resolveRequest(requestId, enforcedResponse);
                    return;
                }
                // Set event timeout
                var eventTimeoutMs = pending.eventTimeoutMs || 30000; // Default 30s for event
                pending.eventTimeout = setTimeout(function () {
                    _this.requestTracker.rejectRequest(requestId, new Error("Timed out waiting for completion event for ".concat(pending.action)));
                }, eventTimeoutMs);
                this.log.debug("Received initial response for ".concat(pending.action, ", waiting for completion event..."));
            }
            else {
                // Second response, treat as completion
                this.requestTracker.resolveRequest(requestId, enforcedResponse);
            }
        }
        else {
            this.requestTracker.resolveRequest(requestId, enforcedResponse);
        }
    };
    MessageHandler.prototype.handleAutomationEvent = function (message) {
        var _a, _b, _c, _d;
        var evt = message;
        var reqId = typeof evt.requestId === 'string' ? evt.requestId : undefined;
        if (reqId) {
            var pending = this.requestTracker.getPendingRequest(reqId);
            if (pending) {
                try {
                    var baseSuccess = (pending.initialResponse && typeof pending.initialResponse.success === 'boolean') ? pending.initialResponse.success : undefined;
                    var evtSuccess = (evt.result && typeof evt.result.success === 'boolean') ? !!evt.result.success : undefined;
                    var synthetic = {
                        type: 'automation_response',
                        requestId: reqId,
                        success: evtSuccess !== undefined ? evtSuccess : baseSuccess,
                        message: typeof ((_a = evt.result) === null || _a === void 0 ? void 0 : _a.message) === 'string' ? evt.result.message : (typeof evt.message === 'string' ? evt.message : FStringSafe(evt.event)),
                        error: typeof ((_b = evt.result) === null || _b === void 0 ? void 0 : _b.error) === 'string' ? evt.result.error : undefined,
                        result: (_d = (_c = evt.result) !== null && _c !== void 0 ? _c : evt.payload) !== null && _d !== void 0 ? _d : undefined
                    };
                    this.log.info("automation_event resolved pending request ".concat(reqId, " (event=").concat(String(evt.event || ''), ")"));
                    this.requestTracker.resolveRequest(reqId, synthetic);
                }
                catch (e) {
                    this.log.warn("Failed to resolve pending automation request from automation_event ".concat(reqId, ": ").concat(String(e)));
                }
                return;
            }
        }
        this.log.debug('Received automation_event (no pending request):', message);
    };
    /**
     * Handle progress update messages from UE during long-running operations.
     * Extends the request timeout to keep the connection alive.
     */
    MessageHandler.prototype.handleProgressUpdate = function (message) {
        var requestId = message.requestId, percent = message.percent, statusMsg = message.message, stillWorking = message.stillWorking;
        if (!requestId) {
            this.log.debug('Received progress_update without requestId');
            return;
        }
        var pending = this.requestTracker.getPendingRequest(requestId);
        if (!pending) {
            this.log.debug("No pending request for progress_update requestId=".concat(requestId));
            return;
        }
        // Log the progress update
        var progressStr = percent !== undefined ? " (".concat(percent.toFixed(1), "%)") : '';
        var msgStr = statusMsg ? ": ".concat(statusMsg) : '';
        this.log.debug("Progress update for ".concat(pending.action).concat(progressStr).concat(msgStr));
        // If stillWorking is explicitly false, operation may be completing soon
        if (stillWorking === false) {
            this.log.debug("Progress update indicates operation completing for ".concat(pending.action));
        }
        // Extend the timeout - this also handles deadlock detection
        var extended = this.requestTracker.extendTimeout(requestId, percent, statusMsg);
        if (!extended) {
            this.log.warn("Timeout extension rejected for ".concat(pending.action, " - possible deadlock detected"));
        }
    };
    MessageHandler.prototype.enforceActionMatch = function (response, expectedAction) {
        try {
            var expected = (expectedAction || '').toString().toLowerCase();
            var echoed = (function () {
                var r = response;
                var resultObj = response.result;
                var candidate = (typeof r.action === 'string' && r.action) || (typeof (resultObj === null || resultObj === void 0 ? void 0 : resultObj.action) === 'string' && resultObj.action);
                return candidate || undefined;
            })();
            if (expected && echoed && typeof echoed === 'string') {
                var got = echoed.toLowerCase();
                var consolidatedToolActions = new Set([
                    'animation_physics',
                    'create_effect',
                    'build_environment',
                    'system_control',
                    'manage_ui',
                    'inspect'
                ]);
                if (consolidatedToolActions.has(expected) && got !== expected) {
                    return response;
                }
                var startsEitherWay = got.startsWith(expected) || expected.startsWith(got);
                if (!startsEitherWay) {
                    var mutated = __assign({}, response);
                    mutated.success = false;
                    if (!mutated.error)
                        mutated.error = 'ACTION_PREFIX_MISMATCH';
                    var msgBase = typeof mutated.message === 'string' ? mutated.message + ' ' : '';
                    mutated.message = "".concat(msgBase, "Response action mismatch (expected~='").concat(expected, "', got='").concat(echoed, "')");
                    return mutated;
                }
            }
        }
        catch (e) {
            this.log.debug('enforceActionMatch check skipped', e instanceof Error ? e.message : String(e));
        }
        return response;
    };
    return MessageHandler;
}());
exports.MessageHandler = MessageHandler;

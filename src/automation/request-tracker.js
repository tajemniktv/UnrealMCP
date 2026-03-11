"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestTracker = void 0;
var node_crypto_1 = require("node:crypto");
var constants_js_1 = require("../constants.js");
// Note: The two-phase event pattern was disabled because C++ handlers send a single response,
// not request+event. All actions now use simple request-response. The PendingRequest interface
// retains waitForEvent/eventTimeout fields for potential future use.
var RequestTracker = /** @class */ (function () {
    function RequestTracker(maxPendingRequests) {
        this.maxPendingRequests = maxPendingRequests;
        this.pendingRequests = new Map();
        this.coalescedRequests = new Map();
    }
    /**
     * Get the maximum number of pending requests allowed.
     * @returns The configured maximum pending requests limit
     */
    RequestTracker.prototype.getMaxPendingRequests = function () {
        return this.maxPendingRequests;
    };
    /**
     * Get the timestamp of when the last request was sent.
     * @returns The Date of last request or undefined if no requests sent yet
     */
    RequestTracker.prototype.getLastRequestSentAt = function () {
        return this.lastRequestSentAt;
    };
    /**
     * Update the last request sent timestamp.
     * Called when a new request is dispatched.
     */
    RequestTracker.prototype.updateLastRequestSentAt = function () {
        this.lastRequestSentAt = new Date();
    };
    /**
     * Create a new pending request with timeout handling.
     * @param action - The action name being requested
     * @param payload - The request payload
     * @param timeoutMs - Timeout in milliseconds before the request fails
     * @returns Object containing the requestId and a promise that resolves with the response
     * @throws Error if max pending requests limit is reached
     */
    RequestTracker.prototype.createRequest = function (action, payload, timeoutMs) {
        var _this = this;
        if (this.pendingRequests.size >= this.maxPendingRequests) {
            throw new Error("Max pending requests limit reached (".concat(this.maxPendingRequests, ")"));
        }
        var requestId = (0, node_crypto_1.randomUUID)();
        var promise = new Promise(function (resolve, reject) {
            var timeout = setTimeout(function () {
                if (_this.pendingRequests.has(requestId)) {
                    _this.pendingRequests.delete(requestId);
                    reject(new Error("Request ".concat(requestId, " timed out after ").concat(timeoutMs, "ms")));
                }
            }, timeoutMs);
            // Set up absolute timeout cap to prevent indefinite extension
            var absoluteTimeout = setTimeout(function () {
                if (_this.pendingRequests.has(requestId)) {
                    _this.pendingRequests.delete(requestId);
                    var totalMs = constants_js_1.ABSOLUTE_MAX_TIMEOUT_MS;
                    reject(new Error("Request ".concat(requestId, " exceeded absolute max timeout (").concat(totalMs, "ms)")));
                }
            }, constants_js_1.ABSOLUTE_MAX_TIMEOUT_MS);
            _this.pendingRequests.set(requestId, {
                resolve: resolve,
                reject: reject,
                timeout: timeout,
                action: action,
                payload: payload,
                requestedAt: new Date(),
                // Note: waitForEvent and eventTimeoutMs are preserved for potential future use
                // but currently all actions use simple request-response pattern
                waitForEvent: false,
                eventTimeoutMs: timeoutMs,
                // Progress tracking initialization
                extensionCount: 0,
                lastProgressPercent: undefined,
                staleCount: 0,
                absoluteTimeout: absoluteTimeout,
                totalExtensionMs: 0
            });
        });
        return { requestId: requestId, promise: promise };
    };
    /**
     * Extend the timeout for a pending request based on progress update.
     * Implements safeguards against deadlock from false "alive" signals:
     * 1. Max extensions limit (MAX_PROGRESS_EXTENSIONS)
     * 2. Stale detection (percent unchanged for PROGRESS_STALE_THRESHOLD updates)
     * 3. Absolute max timeout cap (ABSOLUTE_MAX_TIMEOUT_MS)
     *
     * @param requestId - The request ID to extend
     * @param percent - Current progress percent (0-100)
     * @param message - Optional progress message
     * @returns True if timeout was extended, false if rejected (deadlock prevention)
     */
    RequestTracker.prototype.extendTimeout = function (requestId, percent, _message) {
        var _this = this;
        var pending = this.pendingRequests.get(requestId);
        if (!pending) {
            return false;
        }
        // Check 1: Max extensions limit
        if (pending.extensionCount !== undefined && pending.extensionCount >= constants_js_1.MAX_PROGRESS_EXTENSIONS) {
            pending.reject(new Error("Request ".concat(requestId, " exceeded max progress extensions (").concat(constants_js_1.MAX_PROGRESS_EXTENSIONS, ") - possible deadlock detected")));
            this.cleanupRequest(requestId);
            return false;
        }
        // Check 2: Stale detection - same percent for too many updates
        if (percent !== undefined && pending.lastProgressPercent === percent) {
            pending.staleCount = (pending.staleCount || 0) + 1;
            if (pending.staleCount >= constants_js_1.PROGRESS_STALE_THRESHOLD) {
                pending.reject(new Error("Request ".concat(requestId, " stalled - progress unchanged at ").concat(percent, "% for ").concat(constants_js_1.PROGRESS_STALE_THRESHOLD, " updates")));
                this.cleanupRequest(requestId);
                return false;
            }
        }
        else {
            // Reset stale count on progress change
            pending.staleCount = 0;
        }
        // Clear existing timeout and set new one
        clearTimeout(pending.timeout);
        var newTimeout = setTimeout(function () {
            if (_this.pendingRequests.has(requestId)) {
                _this.pendingRequests.delete(requestId);
                pending.reject(new Error("Request ".concat(requestId, " timed out after extension")));
            }
        }, constants_js_1.PROGRESS_EXTENSION_MS);
        pending.timeout = newTimeout;
        pending.extensionCount = (pending.extensionCount || 0) + 1;
        pending.lastProgressPercent = percent;
        pending.totalExtensionMs = (pending.totalExtensionMs || 0) + constants_js_1.PROGRESS_EXTENSION_MS;
        return true;
    };
    /**
     * Clean up request timers and remove from map.
     */
    RequestTracker.prototype.cleanupRequest = function (requestId) {
        var pending = this.pendingRequests.get(requestId);
        if (pending) {
            clearTimeout(pending.timeout);
            if (pending.eventTimeout)
                clearTimeout(pending.eventTimeout);
            if (pending.absoluteTimeout)
                clearTimeout(pending.absoluteTimeout);
            this.pendingRequests.delete(requestId);
        }
    };
    RequestTracker.prototype.getPendingRequest = function (requestId) {
        return this.pendingRequests.get(requestId);
    };
    RequestTracker.prototype.resolveRequest = function (requestId, response) {
        var pending = this.pendingRequests.get(requestId);
        if (pending) {
            clearTimeout(pending.timeout);
            if (pending.eventTimeout)
                clearTimeout(pending.eventTimeout);
            if (pending.absoluteTimeout)
                clearTimeout(pending.absoluteTimeout);
            this.pendingRequests.delete(requestId);
            pending.resolve(response);
        }
    };
    RequestTracker.prototype.rejectRequest = function (requestId, error) {
        var pending = this.pendingRequests.get(requestId);
        if (pending) {
            clearTimeout(pending.timeout);
            if (pending.eventTimeout)
                clearTimeout(pending.eventTimeout);
            if (pending.absoluteTimeout)
                clearTimeout(pending.absoluteTimeout);
            this.pendingRequests.delete(requestId);
            pending.reject(error);
        }
    };
    RequestTracker.prototype.rejectAll = function (error) {
        for (var _i = 0, _a = this.pendingRequests; _i < _a.length; _i++) {
            var _b = _a[_i], pending = _b[1];
            clearTimeout(pending.timeout);
            if (pending.eventTimeout)
                clearTimeout(pending.eventTimeout);
            if (pending.absoluteTimeout)
                clearTimeout(pending.absoluteTimeout);
            pending.reject(error);
        }
        this.pendingRequests.clear();
    };
    RequestTracker.prototype.getPendingCount = function () {
        return this.pendingRequests.size;
    };
    RequestTracker.prototype.getPendingDetails = function () {
        var now = Date.now();
        return Array.from(this.pendingRequests.entries()).map(function (_a) {
            var id = _a[0], pending = _a[1];
            return ({
                requestId: id,
                action: pending.action,
                ageMs: Math.max(0, now - pending.requestedAt.getTime())
            });
        });
    };
    RequestTracker.prototype.getCoalescedRequest = function (key) {
        return this.coalescedRequests.get(key);
    };
    RequestTracker.prototype.setCoalescedRequest = function (key, promise) {
        var _this = this;
        this.coalescedRequests.set(key, promise);
        // Remove from map when settled
        promise.finally(function () {
            if (_this.coalescedRequests.get(key) === promise) {
                _this.coalescedRequests.delete(key);
            }
        });
    };
    RequestTracker.prototype.createCoalesceKey = function (action, payload) {
        // Only coalesce read-only operations
        var readOnlyActions = ['list', 'get_', 'exists', 'search', 'find'];
        if (!readOnlyActions.some(function (a) { return action.startsWith(a); }))
            return '';
        // Create a stable hash of the payload
        var stablePayload = JSON.stringify(payload, Object.keys(payload).sort());
        return "".concat(action, ":").concat((0, node_crypto_1.createHash)('md5').update(stablePayload).digest('hex'));
    };
    return RequestTracker;
}());
exports.RequestTracker = RequestTracker;

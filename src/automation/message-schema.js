"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.automationMessageSchema = exports.progressUpdateSchema = exports.bridgeGoodbyeSchema = exports.bridgePongSchema = exports.bridgePingSchema = exports.bridgeErrorSchema = exports.bridgeAckSchema = exports.automationEventSchema = exports.automationResponseSchema = void 0;
var zod_1 = require("zod");
var stringArray = zod_1.z.array(zod_1.z.string());
exports.automationResponseSchema = zod_1.z.object({
    type: zod_1.z.literal('automation_response'),
    requestId: zod_1.z.string().min(1),
    success: zod_1.z.boolean().optional(),
    message: zod_1.z.string().optional(),
    error: zod_1.z.string().optional(),
    result: zod_1.z.unknown().optional(),
    action: zod_1.z.string().optional()
}).passthrough();
exports.automationEventSchema = zod_1.z.object({
    type: zod_1.z.literal('automation_event'),
    requestId: zod_1.z.string().optional(),
    event: zod_1.z.string().optional(),
    payload: zod_1.z.unknown().optional(),
    result: zod_1.z.unknown().optional(),
    message: zod_1.z.string().optional()
}).passthrough();
exports.bridgeAckSchema = zod_1.z.object({
    type: zod_1.z.literal('bridge_ack'),
    message: zod_1.z.string().optional(),
    serverName: zod_1.z.string().optional(),
    serverVersion: zod_1.z.string().optional(),
    sessionId: zod_1.z.string().optional(),
    protocolVersion: zod_1.z.number().optional(),
    supportedOpcodes: stringArray.optional(),
    expectedResponseOpcodes: stringArray.optional(),
    capabilities: stringArray.optional(),
    heartbeatIntervalMs: zod_1.z.number().optional()
}).passthrough();
exports.bridgeErrorSchema = zod_1.z.object({
    type: zod_1.z.literal('bridge_error'),
    error: zod_1.z.string().optional(),
    message: zod_1.z.string().optional()
}).passthrough();
exports.bridgePingSchema = zod_1.z.object({
    type: zod_1.z.literal('bridge_ping'),
    timestamp: zod_1.z.string().optional()
}).passthrough();
exports.bridgePongSchema = zod_1.z.object({
    type: zod_1.z.literal('bridge_pong'),
    timestamp: zod_1.z.string().optional()
}).passthrough();
exports.bridgeGoodbyeSchema = zod_1.z.object({
    type: zod_1.z.literal('bridge_goodbye'),
    reason: zod_1.z.string().optional(),
    timestamp: zod_1.z.string().optional()
}).passthrough();
// Progress update message - sent by UE during long operations to keep request alive
exports.progressUpdateSchema = zod_1.z.object({
    type: zod_1.z.literal('progress_update'),
    requestId: zod_1.z.string().min(1),
    percent: zod_1.z.number().min(0).max(100).optional(),
    message: zod_1.z.string().optional(),
    timestamp: zod_1.z.string().optional(),
    stillWorking: zod_1.z.boolean().optional() // True if operation is still in progress
}).passthrough();
exports.automationMessageSchema = zod_1.z.discriminatedUnion('type', [
    exports.automationResponseSchema,
    exports.automationEventSchema,
    exports.bridgeAckSchema,
    exports.bridgeErrorSchema,
    exports.bridgePingSchema,
    exports.bridgePongSchema,
    exports.bridgeGoodbyeSchema,
    exports.progressUpdateSchema
]);

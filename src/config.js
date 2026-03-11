"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = exports.EnvSchema = void 0;
var zod_1 = require("zod");
var logger_js_1 = require("./utils/logger.js");
var dotenv_1 = require("dotenv");
// Suppress dotenv output to avoid corrupting MCP stdout stream
var originalWrite = process.stdout.write;
process.stdout.write = function () { return true; };
try {
    dotenv_1.default.config();
}
finally {
    process.stdout.write = originalWrite;
}
var log = new logger_js_1.Logger('Config');
var stringToBoolean = function (val) {
    if (typeof val === 'boolean')
        return val;
    if (typeof val === 'string') {
        var lower = val.toLowerCase().trim();
        return lower === 'true' || lower === '1' || lower === 'on';
    }
    return false;
};
var stringToNumber = function (val, defaultVal) {
    if (typeof val === 'number')
        return val;
    if (typeof val === 'string') {
        var parsed = parseInt(val, 10);
        return isNaN(parsed) ? defaultVal : parsed;
    }
    return defaultVal;
};
exports.EnvSchema = zod_1.z.object({
    // Server Settings
    NODE_ENV: zod_1.z.enum(['development', 'production', 'test']).default('development'),
    LOG_LEVEL: zod_1.z.enum(['debug', 'info', 'warn', 'error']).default('debug'),
    MCP_ROUTE_STDOUT_LOGS: zod_1.z.preprocess(stringToBoolean, zod_1.z.boolean().default(true)),
    // Unreal Settings
    UE_PROJECT_PATH: zod_1.z.string().optional(),
    UE_EDITOR_EXE: zod_1.z.string().optional(),
    // Connection Settings
    MCP_AUTOMATION_PORT: zod_1.z.preprocess(function (v) { return stringToNumber(v, 8091); }, zod_1.z.number().default(8091)),
    MCP_AUTOMATION_HOST: zod_1.z.string().default('127.0.0.1'),
    MCP_AUTOMATION_CLIENT_MODE: zod_1.z.preprocess(stringToBoolean, zod_1.z.boolean().default(false)),
    // Timeouts
    MCP_CONNECTION_TIMEOUT_MS: zod_1.z.preprocess(function (v) { return stringToNumber(v, 5000); }, zod_1.z.number().default(5000)),
    MCP_REQUEST_TIMEOUT_MS: zod_1.z.preprocess(function (v) { return stringToNumber(v, 30000); }, zod_1.z.number().default(30000)),
    // Tool Categories (comma-separated: core,world,authoring,gameplay,utility,all)
    MCP_DEFAULT_CATEGORIES: zod_1.z.string().default('core'),
});
var config;
try {
    exports.config = config = exports.EnvSchema.parse(process.env);
    log.debug('Configuration loaded successfully');
}
catch (error) {
    if (error instanceof zod_1.z.ZodError) {
        log.error('❌ Invalid configuration:', error.format());
        log.warn('⚠️ Falling back to safe defaults.');
        // Fallback to parsing an empty object to get all defaults
        exports.config = config = exports.EnvSchema.parse({});
    }
    else {
        throw error;
    }
}

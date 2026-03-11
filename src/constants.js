"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_WS_MESSAGE_SIZE_BYTES = exports.ABSOLUTE_MAX_TIMEOUT_MS = exports.PROGRESS_STALE_THRESHOLD = exports.MAX_PROGRESS_EXTENSIONS = exports.PROGRESS_EXTENSION_MS = exports.CONNECTION_TIMEOUT_MS = exports.ENGINE_QUERY_TIMEOUT_MS = exports.CONSOLE_COMMAND_TIMEOUT_MS = exports.LONG_RUNNING_OP_TIMEOUT_MS = exports.EXTENDED_ASSET_OP_TIMEOUT_MS = exports.DEFAULT_ASSET_OP_TIMEOUT_MS = exports.DEFAULT_OPERATION_TIMEOUT_MS = exports.DEFAULT_SCREENSHOT_RESOLUTION = exports.DEFAULT_SKYLIGHT_INTENSITY = exports.DEFAULT_SUN_INTENSITY = exports.DEFAULT_TIME_OF_DAY = exports.DEFAULT_MAX_INBOUND_AUTOMATION_REQUESTS_PER_MINUTE = exports.DEFAULT_MAX_INBOUND_MESSAGES_PER_MINUTE = exports.DEFAULT_MAX_QUEUED_REQUESTS = exports.DEFAULT_MAX_PENDING_REQUESTS = exports.DEFAULT_HANDSHAKE_TIMEOUT_MS = exports.DEFAULT_HEARTBEAT_INTERVAL_MS = exports.DEFAULT_NEGOTIATED_PROTOCOLS = exports.DEFAULT_AUTOMATION_PORTS = exports.DEFAULT_AUTOMATION_PORT = exports.DEFAULT_AUTOMATION_HOST = void 0;
// Shared runtime defaults and protocol constants
exports.DEFAULT_AUTOMATION_HOST = '127.0.0.1';
exports.DEFAULT_AUTOMATION_PORT = 8090;
exports.DEFAULT_AUTOMATION_PORTS = [8090, 8091];
exports.DEFAULT_NEGOTIATED_PROTOCOLS = ['mcp-automation'];
exports.DEFAULT_HEARTBEAT_INTERVAL_MS = 10000;
exports.DEFAULT_HANDSHAKE_TIMEOUT_MS = 5000;
exports.DEFAULT_MAX_PENDING_REQUESTS = 25;
exports.DEFAULT_MAX_QUEUED_REQUESTS = 100;
exports.DEFAULT_MAX_INBOUND_MESSAGES_PER_MINUTE = 600;
exports.DEFAULT_MAX_INBOUND_AUTOMATION_REQUESTS_PER_MINUTE = 120;
exports.DEFAULT_TIME_OF_DAY = 9;
exports.DEFAULT_SUN_INTENSITY = 10000;
exports.DEFAULT_SKYLIGHT_INTENSITY = 1;
exports.DEFAULT_SCREENSHOT_RESOLUTION = '1920x1080';
// Operation Timeouts (reduced for faster idle detection)
exports.DEFAULT_OPERATION_TIMEOUT_MS = 30000; // 30s base timeout
exports.DEFAULT_ASSET_OP_TIMEOUT_MS = 60000;
exports.EXTENDED_ASSET_OP_TIMEOUT_MS = 120000;
exports.LONG_RUNNING_OP_TIMEOUT_MS = 300000;
// Command-specific timeouts
exports.CONSOLE_COMMAND_TIMEOUT_MS = 30000;
exports.ENGINE_QUERY_TIMEOUT_MS = 15000;
exports.CONNECTION_TIMEOUT_MS = 15000;
// Progress/Heartbeat Timeout Extension
// When UE sends progress updates, timeout is extended to keep long operations alive
exports.PROGRESS_EXTENSION_MS = 30000; // Extend by 30s on each progress update
exports.MAX_PROGRESS_EXTENSIONS = 10; // Max times timeout can be extended (prevents deadlock)
exports.PROGRESS_STALE_THRESHOLD = 3; // Stale updates before timeout (percent unchanged)
exports.ABSOLUTE_MAX_TIMEOUT_MS = 300000; // 5 minute hard cap (even with extensions)
// Message size limits
exports.MAX_WS_MESSAGE_SIZE_BYTES = 5 * 1024 * 1024;

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
exports.LogTools = void 0;
var env_js_1 = require("../types/env.js");
var logger_js_1 = require("../utils/logger.js");
var fs_1 = require("fs");
var path_1 = require("path");
var LogTools = /** @class */ (function () {
    function LogTools(_bridge) {
        this._bridge = _bridge;
        this.env = (0, env_js_1.loadEnv)();
        this._log = new logger_js_1.Logger('LogTools');
    }
    LogTools.prototype.readOutputLog = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var target, maxLines, text, err_1, errObj, rawLines, parsed, mappedLevel, includeCats, includePrefixes, excludeCats, filtered, includeInternal, sanitized;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this._log.debug('Reading output log', { params: params, connected: this._bridge.isConnected });
                        return [4 /*yield*/, this.resolveLogPath(params.logPath)];
                    case 1:
                        target = _a.sent();
                        if (!target) {
                            return [2 /*return*/, { success: false, error: 'Log file not found' }];
                        }
                        maxLines = typeof params.lines === 'number' && params.lines > 0 ? Math.min(params.lines, 2000) : 200;
                        text = '';
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, this.tailFile(target, maxLines)];
                    case 3:
                        text = _a.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        err_1 = _a.sent();
                        errObj = err_1;
                        return [2 /*return*/, { success: false, error: String((errObj === null || errObj === void 0 ? void 0 : errObj.message) || err_1) }];
                    case 5:
                        rawLines = text.split(/\r?\n/).filter(function (l) { return l.length > 0; });
                        parsed = rawLines.map(function (l) { return _this.parseLine(l); });
                        mappedLevel = params.filterLevel || 'All';
                        includeCats = Array.isArray(params.filterCategory) && params.filterCategory.length ? new Set(params.filterCategory) : undefined;
                        includePrefixes = Array.isArray(params.includePrefixes) && params.includePrefixes.length ? params.includePrefixes : undefined;
                        excludeCats = Array.isArray(params.excludeCategories) && params.excludeCategories.length ? new Set(params.excludeCategories) : undefined;
                        filtered = parsed.filter(function (e) {
                            if (!e)
                                return false;
                            if (mappedLevel && mappedLevel !== 'All') {
                                var lv = (e.level || 'Log');
                                if (lv === 'Display') {
                                    if (mappedLevel !== 'Log')
                                        return false;
                                }
                                else if (lv !== mappedLevel) {
                                    return false;
                                }
                            }
                            if (includeCats && e.category && !includeCats.has(e.category))
                                return false;
                            if (includePrefixes && includePrefixes.length && e.category) {
                                if (!includePrefixes.some(function (p) { var _a; return ((_a = e.category) !== null && _a !== void 0 ? _a : '').startsWith(p); }))
                                    return false;
                            }
                            if (excludeCats && e.category && excludeCats.has(e.category))
                                return false;
                            return true;
                        });
                        includeInternal = Boolean((includeCats && includeCats.has('LogPython')) ||
                            (includePrefixes && includePrefixes.some(function (p) { return 'LogPython'.startsWith(p); })));
                        sanitized = includeInternal ? filtered : filtered.filter(function (entry) { return !_this.isInternalLogEntry(entry); });
                        return [2 /*return*/, { success: true, logPath: target.replace(/\\/g, '/'), entries: sanitized, filteredCount: sanitized.length }];
                }
            });
        });
    };
    LogTools.prototype.resolveLogPath = function (override) {
        return __awaiter(this, void 0, void 0, function () {
            var resolvedPath_1, allowedDirs, projectPath, projectDir, isAllowed, st, _a, _b, envLog, fallback;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (!(override && typeof override === 'string' && override.trim())) return [3 /*break*/, 4];
                        // Security check: Only allow .log files
                        if (!override.toLowerCase().endsWith('.log')) {
                            this._log.warn("Blocked attempt to read non-log file: ".concat(override));
                            return [2 /*return*/, undefined];
                        }
                        resolvedPath_1 = path_1.default.resolve(override);
                        allowedDirs = [
                            path_1.default.resolve(path_1.default.join(process.cwd(), 'Saved', 'Logs'))
                        ];
                        projectPath = this.env.UE_PROJECT_PATH;
                        if (projectPath) {
                            projectDir = path_1.default.dirname(projectPath);
                            allowedDirs.push(path_1.default.resolve(path_1.default.join(projectDir, 'Saved', 'Logs')));
                        }
                        isAllowed = allowedDirs.some(function (dir) {
                            return resolvedPath_1 === dir || resolvedPath_1.startsWith(dir + path_1.default.sep);
                        });
                        if (!isAllowed) {
                            this._log.warn("Blocked attempt to read log from unauthorized location: ".concat(override));
                            return [2 /*return*/, undefined];
                        }
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, fs_1.promises.stat(override)];
                    case 2:
                        st = _c.sent();
                        if (st.isFile()) {
                            return [2 /*return*/, this.cacheLogPath(resolvedPath_1)];
                        }
                        return [3 /*break*/, 4];
                    case 3:
                        _a = _c.sent();
                        return [3 /*break*/, 4];
                    case 4:
                        _b = this.cachedLogPath;
                        if (!_b) return [3 /*break*/, 6];
                        return [4 /*yield*/, this.fileExists(this.cachedLogPath)];
                    case 5:
                        _b = (_c.sent());
                        _c.label = 6;
                    case 6:
                        if (_b) {
                            return [2 /*return*/, this.cachedLogPath];
                        }
                        return [4 /*yield*/, this.resolveFromProjectEnv()];
                    case 7:
                        envLog = _c.sent();
                        if (envLog) {
                            return [2 /*return*/, envLog];
                        }
                        return [4 /*yield*/, this.findLatestLogInDir(path_1.default.join(process.cwd(), 'Saved', 'Logs'))];
                    case 8:
                        fallback = _c.sent();
                        if (fallback) {
                            return [2 /*return*/, fallback];
                        }
                        return [2 /*return*/, undefined];
                }
            });
        });
    };
    LogTools.prototype.resolveFromProjectEnv = function () {
        return __awaiter(this, void 0, void 0, function () {
            var projectPath, projectDir, logsDir, envLog;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        projectPath = this.env.UE_PROJECT_PATH;
                        if (!(projectPath && typeof projectPath === 'string' && projectPath.trim())) return [3 /*break*/, 2];
                        projectDir = path_1.default.dirname(projectPath);
                        logsDir = path_1.default.join(projectDir, 'Saved', 'Logs');
                        return [4 /*yield*/, this.findLatestLogInDir(logsDir)];
                    case 1:
                        envLog = _a.sent();
                        if (envLog) {
                            return [2 /*return*/, envLog];
                        }
                        _a.label = 2;
                    case 2: return [2 /*return*/, undefined];
                }
            });
        });
    };
    LogTools.prototype.findLatestLogInDir = function (dir) {
        return __awaiter(this, void 0, void 0, function () {
            var entries, candidates, _i, entries_1, name_1, fp, st, _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (!dir)
                            return [2 /*return*/, undefined];
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 9, , 10]);
                        return [4 /*yield*/, fs_1.promises.readdir(dir)];
                    case 2:
                        entries = _c.sent();
                        candidates = [];
                        _i = 0, entries_1 = entries;
                        _c.label = 3;
                    case 3:
                        if (!(_i < entries_1.length)) return [3 /*break*/, 8];
                        name_1 = entries_1[_i];
                        if (!name_1.toLowerCase().endsWith('.log'))
                            return [3 /*break*/, 7];
                        fp = path_1.default.join(dir, name_1);
                        _c.label = 4;
                    case 4:
                        _c.trys.push([4, 6, , 7]);
                        return [4 /*yield*/, fs_1.promises.stat(fp)];
                    case 5:
                        st = _c.sent();
                        candidates.push({ p: fp, m: st.mtimeMs });
                        return [3 /*break*/, 7];
                    case 6:
                        _a = _c.sent();
                        return [3 /*break*/, 7];
                    case 7:
                        _i++;
                        return [3 /*break*/, 3];
                    case 8:
                        if (candidates.length) {
                            candidates.sort(function (a, b) { return b.m - a.m; });
                            return [2 /*return*/, this.cacheLogPath(candidates[0].p)];
                        }
                        return [3 /*break*/, 10];
                    case 9:
                        _b = _c.sent();
                        return [3 /*break*/, 10];
                    case 10: return [2 /*return*/, undefined];
                }
            });
        });
    };
    LogTools.prototype.fileExists = function (filePath) {
        return __awaiter(this, void 0, void 0, function () {
            var st, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, fs_1.promises.stat(filePath)];
                    case 1:
                        st = _b.sent();
                        return [2 /*return*/, st.isFile()];
                    case 2:
                        _a = _b.sent();
                        return [2 /*return*/, false];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    LogTools.prototype.cacheLogPath = function (p) {
        this.cachedLogPath = p;
        return p;
    };
    LogTools.prototype.tailFile = function (filePath, maxLines) {
        return __awaiter(this, void 0, void 0, function () {
            var handle, stat, chunkSize, position, remaining, lines, readSize, buf, parts, line, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, fs_1.promises.open(filePath, 'r')];
                    case 1:
                        handle = _b.sent();
                        _b.label = 2;
                    case 2:
                        _b.trys.push([2, , 7, 11]);
                        return [4 /*yield*/, handle.stat()];
                    case 3:
                        stat = _b.sent();
                        chunkSize = 128 * 1024;
                        position = stat.size;
                        remaining = '';
                        lines = [];
                        _b.label = 4;
                    case 4:
                        if (!(position > 0 && lines.length < maxLines)) return [3 /*break*/, 6];
                        readSize = Math.min(chunkSize, position);
                        position -= readSize;
                        buf = Buffer.alloc(readSize);
                        return [4 /*yield*/, handle.read(buf, 0, readSize, position)];
                    case 5:
                        _b.sent();
                        remaining = buf.toString('utf8') + remaining;
                        parts = remaining.split(/\r?\n/);
                        remaining = parts.shift() || '';
                        while (parts.length) {
                            line = parts.pop();
                            if (line === undefined)
                                break;
                            if (line.length === 0)
                                continue;
                            lines.unshift(line);
                            if (lines.length >= maxLines)
                                break;
                        }
                        return [3 /*break*/, 4];
                    case 6:
                        if (lines.length < maxLines && remaining) {
                            lines.unshift(remaining);
                        }
                        return [2 /*return*/, lines.slice(0, maxLines).join('\n')];
                    case 7:
                        _b.trys.push([7, 9, , 10]);
                        return [4 /*yield*/, handle.close()];
                    case 8:
                        _b.sent();
                        return [3 /*break*/, 10];
                    case 9:
                        _a = _b.sent();
                        return [3 /*break*/, 10];
                    case 10: return [7 /*endfinally*/];
                    case 11: return [2 /*return*/];
                }
            });
        });
    };
    LogTools.prototype.parseLine = function (line) {
        var m1 = line.match(/^\[?(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}:\d+)\]?\s*\[(.*?)\]\s*(.*)$/);
        if (m1) {
            var rest = m1[3];
            var m2 = rest.match(/^(\w+):\s*(Error|Warning|Display|Log|Verbose|VeryVerbose):\s*(.*)$/);
            if (m2) {
                return { timestamp: m1[1], category: m2[1], level: m2[2] === 'Display' ? 'Log' : m2[2], message: m2[3] };
            }
            var m3 = rest.match(/^(\w+):\s*(.*)$/);
            if (m3) {
                return { timestamp: m1[1], category: m3[1], level: 'Log', message: m3[2] };
            }
            return { timestamp: m1[1], message: rest };
        }
        var m = line.match(/^(\w+):\s*(Error|Warning|Display|Log|Verbose|VeryVerbose):\s*(.*)$/);
        if (m) {
            return { category: m[1], level: m[2] === 'Display' ? 'Log' : m[2], message: m[3] };
        }
        var mAlt = line.match(/^(\w+):\s*(.*)$/);
        if (mAlt) {
            return { category: mAlt[1], level: 'Log', message: mAlt[2] };
        }
        return { message: line };
    };
    LogTools.prototype.isInternalLogEntry = function (entry) {
        var _a, _b;
        if (!entry)
            return false;
        var category = ((_a = entry.category) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || '';
        var message = ((_b = entry.message) === null || _b === void 0 ? void 0 : _b.trim()) || '';
        if (category === 'logpython' && message.startsWith('RESULT:')) {
            return true;
        }
        if (!entry.category && message.startsWith('[') && message.includes('LogPython: RESULT:')) {
            return true;
        }
        return false;
    };
    return LogTools;
}());
exports.LogTools = LogTools;

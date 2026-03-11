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
exports.LightingTools = void 0;
var validation_js_1 = require("../utils/validation.js");
var logger_js_1 = require("../utils/logger.js");
var log = new logger_js_1.Logger('LightingTools');
var LightingTools = /** @class */ (function () {
    function LightingTools(bridge, automationBridge) {
        this.bridge = bridge;
        this.automationBridge = automationBridge;
    }
    LightingTools.prototype.setAutomationBridge = function (automationBridge) { this.automationBridge = automationBridge; };
    LightingTools.prototype.normalizeName = function (value, defaultName) {
        if (typeof value === 'string') {
            var trimmed = value.trim();
            if (trimmed.length > 0) {
                return trimmed;
            }
        }
        if (typeof defaultName === 'string') {
            var trimmedDefault = defaultName.trim();
            if (trimmedDefault.length > 0) {
                return trimmedDefault;
            }
        }
        // Auto-generate if no name is provided
        return "Light_".concat(Date.now(), "_").concat(Math.floor(Math.random() * 1000));
    };
    /**
     * List available light types (classes)
     */
    LightingTools.prototype.listLightTypes = function () {
        return __awaiter(this, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.automationBridge) {
                            throw new Error('Automation Bridge required to list light types');
                        }
                        return [4 /*yield*/, this.automationBridge.sendAutomationRequest('list_light_types', {})];
                    case 1:
                        response = _a.sent();
                        return [2 /*return*/, response];
                }
            });
        });
    };
    /**
     * Spawn a light actor using the Automation Bridge.
     * @param lightClass The Unreal light class name (e.g. 'DirectionalLight', 'PointLight')
     * @param params Light spawn parameters
     */
    LightingTools.prototype.spawnLightViaAutomation = function (lightClass, params) {
        return __awaiter(this, void 0, void 0, function () {
            var payload, rotArray, response, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.automationBridge) {
                            throw new Error('Automation Bridge not available. Cannot spawn lights without plugin support.');
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        payload = {
                            lightClass: lightClass,
                            name: params.name,
                        };
                        if (params.location) {
                            payload.location = Array.isArray(params.location)
                                ? { x: params.location[0], y: params.location[1], z: params.location[2] }
                                : params.location;
                        }
                        if (params.rotation) {
                            if (Array.isArray(params.rotation)) {
                                rotArray = params.rotation;
                                payload.rotation = { pitch: rotArray[0], yaw: rotArray[1], roll: rotArray[2] };
                            }
                            else {
                                payload.rotation = params.rotation;
                            }
                        }
                        if (params.properties) {
                            payload.properties = params.properties;
                        }
                        return [4 /*yield*/, this.automationBridge.sendAutomationRequest('spawn_light', payload, {
                                timeoutMs: 60000
                            })];
                    case 2:
                        response = _a.sent();
                        if (response.success === false) {
                            throw new Error(response.error || response.message || 'Failed to spawn light');
                        }
                        return [2 /*return*/, response];
                    case 3:
                        error_1 = _a.sent();
                        throw new Error("Failed to spawn ".concat(lightClass, ": ").concat(error_1 instanceof Error ? error_1.message : String(error_1)));
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    // Create directional light
    LightingTools.prototype.createDirectionalLight = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var name, _i, _a, c, _b, _c, r, rot, properties, e_1;
            var _d;
            return __generator(this, function (_f) {
                switch (_f.label) {
                    case 0:
                        name = this.normalizeName(params.name);
                        if (!this.automationBridge) {
                            throw new Error('Automation Bridge required for light spawning');
                        }
                        // Validate numeric parameters
                        if (params.intensity !== undefined) {
                            if (typeof params.intensity !== 'number' || !isFinite(params.intensity)) {
                                throw new Error("Invalid intensity value: ".concat(params.intensity));
                            }
                            if (params.intensity < 0) {
                                throw new Error('Invalid intensity: must be non-negative');
                            }
                        }
                        if (params.temperature !== undefined) {
                            if (typeof params.temperature !== 'number' || !isFinite(params.temperature)) {
                                throw new Error("Invalid temperature value: ".concat(params.temperature));
                            }
                        }
                        // Validate arrays
                        if (params.color !== undefined) {
                            if (!Array.isArray(params.color) || params.color.length !== 3) {
                                throw new Error('Invalid color: must be an array [r,g,b]');
                            }
                            for (_i = 0, _a = params.color; _i < _a.length; _i++) {
                                c = _a[_i];
                                if (typeof c !== 'number' || !isFinite(c)) {
                                    throw new Error('Invalid color component: must be finite numbers');
                                }
                            }
                        }
                        if (params.rotation !== undefined) {
                            if (Array.isArray(params.rotation)) {
                                if (params.rotation.length !== 3) {
                                    throw new Error('Invalid rotation: must be an array [pitch,yaw,roll]');
                                }
                                for (_b = 0, _c = params.rotation; _b < _c.length; _b++) {
                                    r = _c[_b];
                                    if (typeof r !== 'number' || !isFinite(r)) {
                                        throw new Error('Invalid rotation component: must be finite numbers');
                                    }
                                }
                            }
                        }
                        rot = params.rotation || [0, 0, 0];
                        properties = params.properties || {};
                        if (params.intensity !== undefined) {
                            properties.intensity = params.intensity;
                        }
                        if (params.color) {
                            properties.color = { r: params.color[0], g: params.color[1], b: params.color[2], a: 1.0 };
                        }
                        if (params.castShadows !== undefined) {
                            properties.castShadows = params.castShadows;
                        }
                        if (params.temperature !== undefined) {
                            properties.temperature = params.temperature;
                        }
                        if (params.useAsAtmosphereSunLight !== undefined) {
                            properties.useAsAtmosphereSunLight = params.useAsAtmosphereSunLight;
                        }
                        _f.label = 1;
                    case 1:
                        _f.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.spawnLightViaAutomation('DirectionalLight', {
                                name: name,
                                location: [0, 0, 500],
                                rotation: rot,
                                properties: properties
                            })];
                    case 2:
                        _f.sent();
                        return [2 /*return*/, { success: true, message: "Directional light '".concat(name, "' spawned") }];
                    case 3:
                        e_1 = _f.sent();
                        // Don't mask errors as "not implemented" - report the actual error from the bridge
                        return [2 /*return*/, { success: false, error: "Failed to create directional light: ".concat((_d = (e_1 instanceof Error ? e_1.message : String(e_1))) !== null && _d !== void 0 ? _d : e_1) }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    // Create point light
    LightingTools.prototype.createPointLight = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var name, location, _i, _a, c, properties, e_2;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        name = this.normalizeName(params.name);
                        if (!this.automationBridge) {
                            throw new Error('Automation Bridge required for light spawning');
                        }
                        location = [0, 0, 0];
                        if (params.location !== undefined) {
                            // Ensure location is valid array [x,y,z]
                            try {
                                location = (0, validation_js_1.ensureVector3)(params.location, 'location');
                            }
                            catch (e) {
                                throw new Error("Invalid location: ".concat(e instanceof Error ? e.message : String(e)));
                            }
                        }
                        // Validate numeric parameters
                        if (params.intensity !== undefined) {
                            if (typeof params.intensity !== 'number' || !isFinite(params.intensity)) {
                                throw new Error("Invalid intensity value: ".concat(params.intensity));
                            }
                            if (params.intensity < 0) {
                                throw new Error('Invalid intensity: must be non-negative');
                            }
                        }
                        if (params.radius !== undefined) {
                            if (typeof params.radius !== 'number' || !isFinite(params.radius)) {
                                throw new Error("Invalid radius value: ".concat(params.radius));
                            }
                            if (params.radius < 0) {
                                throw new Error('Invalid radius: must be non-negative');
                            }
                        }
                        if (params.falloffExponent !== undefined) {
                            if (typeof params.falloffExponent !== 'number' || !isFinite(params.falloffExponent)) {
                                throw new Error("Invalid falloffExponent value: ".concat(params.falloffExponent));
                            }
                        }
                        // Validate color array
                        if (params.color !== undefined) {
                            if (!Array.isArray(params.color) || params.color.length !== 3) {
                                throw new Error('Invalid color: must be an array [r,g,b]');
                            }
                            for (_i = 0, _a = params.color; _i < _a.length; _i++) {
                                c = _a[_i];
                                if (typeof c !== 'number' || !isFinite(c)) {
                                    throw new Error('Invalid color component: must be finite numbers');
                                }
                            }
                        }
                        properties = {};
                        if (params.intensity !== undefined) {
                            properties.intensity = params.intensity;
                        }
                        if (params.radius !== undefined) {
                            properties.attenuationRadius = params.radius;
                        }
                        if (params.color) {
                            properties.color = { r: params.color[0], g: params.color[1], b: params.color[2], a: 1.0 };
                        }
                        if (params.castShadows !== undefined) {
                            properties.castShadows = params.castShadows;
                        }
                        if (params.falloffExponent !== undefined) {
                            properties.lightFalloffExponent = params.falloffExponent;
                        }
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.spawnLightViaAutomation('PointLight', {
                                name: name,
                                location: location,
                                rotation: params.rotation,
                                properties: properties
                            })];
                    case 2:
                        _c.sent();
                        return [2 /*return*/, { success: true, message: "Point light '".concat(name, "' spawned at ").concat(location.join(', ')) }];
                    case 3:
                        e_2 = _c.sent();
                        // Don't mask errors as "not implemented" - report the actual error from the bridge
                        return [2 /*return*/, { success: false, error: "Failed to create point light: ".concat((_b = (e_2 instanceof Error ? e_2.message : String(e_2))) !== null && _b !== void 0 ? _b : e_2) }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    // Create spot light
    LightingTools.prototype.createSpotLight = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var name, _i, _a, l, _b, _c, r, _d, _f, c, properties, e_3;
            var _g;
            return __generator(this, function (_h) {
                switch (_h.label) {
                    case 0:
                        name = this.normalizeName(params.name);
                        if (!this.automationBridge) {
                            throw new Error('Automation Bridge required for light spawning');
                        }
                        // Validate required location and rotation arrays
                        if (!params.location || !Array.isArray(params.location) || params.location.length !== 3) {
                            throw new Error('Invalid location: must be an array [x,y,z]');
                        }
                        for (_i = 0, _a = params.location; _i < _a.length; _i++) {
                            l = _a[_i];
                            if (typeof l !== 'number' || !isFinite(l)) {
                                throw new Error('Invalid location component: must be finite numbers');
                            }
                        }
                        if (!params.rotation) {
                            throw new Error('Rotation is required');
                        }
                        if (Array.isArray(params.rotation)) {
                            if (params.rotation.length !== 3) {
                                throw new Error('Invalid rotation: must be an array [pitch,yaw,roll]');
                            }
                            for (_b = 0, _c = params.rotation; _b < _c.length; _b++) {
                                r = _c[_b];
                                if (typeof r !== 'number' || !isFinite(r)) {
                                    throw new Error('Invalid rotation component: must be finite numbers');
                                }
                            }
                        }
                        // Validate optional numeric parameters
                        if (params.intensity !== undefined) {
                            if (typeof params.intensity !== 'number' || !isFinite(params.intensity)) {
                                throw new Error("Invalid intensity value: ".concat(params.intensity));
                            }
                            if (params.intensity < 0) {
                                throw new Error('Invalid intensity: must be non-negative');
                            }
                        }
                        if (params.innerCone !== undefined) {
                            if (typeof params.innerCone !== 'number' || !isFinite(params.innerCone)) {
                                throw new Error("Invalid innerCone value: ".concat(params.innerCone));
                            }
                            if (params.innerCone < 0 || params.innerCone > 180) {
                                throw new Error('Invalid innerCone: must be between 0 and 180 degrees');
                            }
                        }
                        if (params.outerCone !== undefined) {
                            if (typeof params.outerCone !== 'number' || !isFinite(params.outerCone)) {
                                throw new Error("Invalid outerCone value: ".concat(params.outerCone));
                            }
                            if (params.outerCone < 0 || params.outerCone > 180) {
                                throw new Error('Invalid outerCone: must be between 0 and 180 degrees');
                            }
                        }
                        if (params.radius !== undefined) {
                            if (typeof params.radius !== 'number' || !isFinite(params.radius)) {
                                throw new Error("Invalid radius value: ".concat(params.radius));
                            }
                            if (params.radius < 0) {
                                throw new Error('Invalid radius: must be non-negative');
                            }
                        }
                        // Validate color array
                        if (params.color !== undefined) {
                            if (!Array.isArray(params.color) || params.color.length !== 3) {
                                throw new Error('Invalid color: must be an array [r,g,b]');
                            }
                            for (_d = 0, _f = params.color; _d < _f.length; _d++) {
                                c = _f[_d];
                                if (typeof c !== 'number' || !isFinite(c)) {
                                    throw new Error('Invalid color component: must be finite numbers');
                                }
                            }
                        }
                        properties = {};
                        if (params.intensity !== undefined) {
                            properties.intensity = params.intensity;
                        }
                        if (params.innerCone !== undefined) {
                            properties.innerConeAngle = params.innerCone;
                        }
                        if (params.outerCone !== undefined) {
                            properties.outerConeAngle = params.outerCone;
                        }
                        if (params.radius !== undefined) {
                            properties.attenuationRadius = params.radius;
                        }
                        if (params.color) {
                            properties.color = { r: params.color[0], g: params.color[1], b: params.color[2], a: 1.0 };
                        }
                        if (params.castShadows !== undefined) {
                            properties.castShadows = params.castShadows;
                        }
                        _h.label = 1;
                    case 1:
                        _h.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.spawnLightViaAutomation('SpotLight', {
                                name: name,
                                location: params.location,
                                rotation: params.rotation,
                                properties: properties
                            })];
                    case 2:
                        _h.sent();
                        return [2 /*return*/, { success: true, message: "Spot light '".concat(name, "' spawned at ").concat(params.location.join(', ')) }];
                    case 3:
                        e_3 = _h.sent();
                        // Don't mask errors as "not implemented" - report the actual error from the bridge
                        return [2 /*return*/, { success: false, error: "Failed to create spot light: ".concat((_g = (e_3 instanceof Error ? e_3.message : String(e_3))) !== null && _g !== void 0 ? _g : e_3) }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    // Create rect light
    LightingTools.prototype.createRectLight = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var name, _i, _a, l, _b, _c, r, _d, _f, c, properties, e_4;
            var _g;
            return __generator(this, function (_h) {
                switch (_h.label) {
                    case 0:
                        name = this.normalizeName(params.name);
                        if (!this.automationBridge) {
                            throw new Error('Automation Bridge required for light spawning');
                        }
                        // Validate required location and rotation arrays
                        if (!params.location || !Array.isArray(params.location) || params.location.length !== 3) {
                            throw new Error('Invalid location: must be an array [x,y,z]');
                        }
                        for (_i = 0, _a = params.location; _i < _a.length; _i++) {
                            l = _a[_i];
                            if (typeof l !== 'number' || !isFinite(l)) {
                                throw new Error('Invalid location component: must be finite numbers');
                            }
                        }
                        if (!params.rotation) {
                            throw new Error('Rotation is required');
                        }
                        if (Array.isArray(params.rotation)) {
                            if (params.rotation.length !== 3) {
                                throw new Error('Invalid rotation: must be an array [pitch,yaw,roll]');
                            }
                            for (_b = 0, _c = params.rotation; _b < _c.length; _b++) {
                                r = _c[_b];
                                if (typeof r !== 'number' || !isFinite(r)) {
                                    throw new Error('Invalid rotation component: must be finite numbers');
                                }
                            }
                        }
                        // Validate optional numeric parameters
                        if (params.width !== undefined) {
                            if (typeof params.width !== 'number' || !isFinite(params.width)) {
                                throw new Error("Invalid width value: ".concat(params.width));
                            }
                            if (params.width <= 0) {
                                throw new Error('Invalid width: must be positive');
                            }
                        }
                        if (params.height !== undefined) {
                            if (typeof params.height !== 'number' || !isFinite(params.height)) {
                                throw new Error("Invalid height value: ".concat(params.height));
                            }
                            if (params.height <= 0) {
                                throw new Error('Invalid height: must be positive');
                            }
                        }
                        if (params.intensity !== undefined) {
                            if (typeof params.intensity !== 'number' || !isFinite(params.intensity)) {
                                throw new Error("Invalid intensity value: ".concat(params.intensity));
                            }
                            if (params.intensity < 0) {
                                throw new Error('Invalid intensity: must be non-negative');
                            }
                        }
                        // Validate color array
                        if (params.color !== undefined) {
                            if (!Array.isArray(params.color) || params.color.length !== 3) {
                                throw new Error('Invalid color: must be an array [r,g,b]');
                            }
                            for (_d = 0, _f = params.color; _d < _f.length; _d++) {
                                c = _f[_d];
                                if (typeof c !== 'number' || !isFinite(c)) {
                                    throw new Error('Invalid color component: must be finite numbers');
                                }
                            }
                        }
                        properties = {};
                        if (params.intensity !== undefined) {
                            properties.intensity = params.intensity;
                        }
                        if (params.color) {
                            properties.color = { r: params.color[0], g: params.color[1], b: params.color[2], a: 1.0 };
                        }
                        if (params.width !== undefined) {
                            properties.sourceWidth = params.width;
                        }
                        if (params.height !== undefined) {
                            properties.sourceHeight = params.height;
                        }
                        _h.label = 1;
                    case 1:
                        _h.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.spawnLightViaAutomation('RectLight', {
                                name: name,
                                location: params.location,
                                rotation: params.rotation,
                                properties: properties
                            })];
                    case 2:
                        _h.sent();
                        return [2 /*return*/, { success: true, message: "Rect light '".concat(name, "' spawned at ").concat(params.location.join(', ')) }];
                    case 3:
                        e_4 = _h.sent();
                        // Don't mask errors as "not implemented" - report the actual error from the bridge
                        return [2 /*return*/, { success: false, error: "Failed to create rect light: ".concat((_g = (e_4 instanceof Error ? e_4.message : String(e_4))) !== null && _g !== void 0 ? _g : e_4) }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Create dynamic light
     */
    LightingTools.prototype.createDynamicLight = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var name_1, lightTypeRaw, location_1, toArray3, locArr, typeNorm, extractColorArray, colorArr, _a, err_1;
            var _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        _d.trys.push([0, 10, , 11]);
                        name_1 = typeof params.name === 'string' && params.name.trim().length > 0 ? params.name.trim() : "DynamicLight_".concat(Date.now() % 10000);
                        lightTypeRaw = typeof params.lightType === 'string' && params.lightType.trim().length > 0 ? params.lightType.trim() : 'Point';
                        location_1 = Array.isArray(params.location) ? { x: params.location[0], y: params.location[1], z: params.location[2] } : (params.location || { x: 0, y: 0, z: 100 });
                        toArray3 = function (loc) {
                            if (Array.isArray(loc)) {
                                return [Number(loc[0]) || 0, Number(loc[1]) || 0, Number(loc[2]) || 0];
                            }
                            var locObj = loc;
                            return [Number(locObj === null || locObj === void 0 ? void 0 : locObj.x) || 0, Number(locObj === null || locObj === void 0 ? void 0 : locObj.y) || 0, Number(locObj === null || locObj === void 0 ? void 0 : locObj.z) || 0];
                        };
                        locArr = toArray3(location_1);
                        typeNorm = (lightTypeRaw || 'Point').toLowerCase();
                        extractColorArray = function (color) {
                            if (Array.isArray(color) && color.length >= 3) {
                                return [color[0], color[1], color[2]];
                            }
                            if (color && typeof color === 'object') {
                                var c = color;
                                if (typeof c.r === 'number' && typeof c.g === 'number' && typeof c.b === 'number') {
                                    return [c.r, c.g, c.b];
                                }
                            }
                            return undefined;
                        };
                        colorArr = extractColorArray(params.color);
                        _a = typeNorm;
                        switch (_a) {
                            case 'directional': return [3 /*break*/, 1];
                            case 'directionallight': return [3 /*break*/, 1];
                            case 'spot': return [3 /*break*/, 3];
                            case 'spotlight': return [3 /*break*/, 3];
                            case 'rect': return [3 /*break*/, 5];
                            case 'rectlight': return [3 /*break*/, 5];
                            case 'point': return [3 /*break*/, 7];
                        }
                        return [3 /*break*/, 7];
                    case 1: return [4 /*yield*/, this.createDirectionalLight({ name: name_1, intensity: params.intensity, color: colorArr, rotation: params.rotation })];
                    case 2: return [2 /*return*/, _d.sent()];
                    case 3: return [4 /*yield*/, this.createSpotLight({ name: name_1, location: locArr, rotation: ((_b = params.rotation) !== null && _b !== void 0 ? _b : [0, 0, 0]), intensity: params.intensity, innerCone: undefined, outerCone: undefined, color: colorArr })];
                    case 4: return [2 /*return*/, _d.sent()];
                    case 5: return [4 /*yield*/, this.createRectLight({ name: name_1, location: locArr, rotation: ((_c = params.rotation) !== null && _c !== void 0 ? _c : [0, 0, 0]), width: undefined, height: undefined, intensity: params.intensity, color: colorArr })];
                    case 6: return [2 /*return*/, _d.sent()];
                    case 7: return [4 /*yield*/, this.createPointLight({ name: name_1, location: locArr, intensity: params.intensity, radius: undefined, color: colorArr, castShadows: undefined })];
                    case 8: return [2 /*return*/, _d.sent()];
                    case 9: return [3 /*break*/, 11];
                    case 10:
                        err_1 = _d.sent();
                        return [2 /*return*/, { success: false, error: "Failed to create dynamic light: ".concat(err_1) }];
                    case 11: return [2 /*return*/];
                }
            });
        });
    };
    // Create sky light
    LightingTools.prototype.createSkyLight = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var name, message, properties, payload, response, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        name = this.normalizeName(params.name);
                        if (params.sourceType === 'SpecifiedCubemap' && (!params.cubemapPath || params.cubemapPath.trim().length === 0)) {
                            message = 'cubemapPath is required when sourceType is SpecifiedCubemap';
                            return [2 /*return*/, { success: false, error: message, message: message }];
                        }
                        if (!this.automationBridge) {
                            throw new Error('Automation Bridge required for sky light creation');
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        properties = {};
                        if (params.intensity !== undefined)
                            properties.Intensity = params.intensity;
                        if (params.castShadows !== undefined)
                            properties.CastShadows = params.castShadows;
                        if (params.realTimeCapture !== undefined)
                            properties.RealTimeCapture = params.realTimeCapture;
                        if (params.color)
                            properties.LightColor = { r: params.color[0], g: params.color[1], b: params.color[2], a: 1.0 };
                        payload = {
                            name: name,
                            sourceType: params.sourceType || 'CapturedScene',
                            location: params.location,
                            rotation: params.rotation,
                            properties: properties
                        };
                        if (params.cubemapPath) {
                            payload.cubemapPath = params.cubemapPath;
                        }
                        if (params.intensity !== undefined) {
                            payload.intensity = params.intensity;
                        }
                        if (params.recapture) {
                            payload.recapture = params.recapture;
                        }
                        return [4 /*yield*/, this.automationBridge.sendAutomationRequest('spawn_sky_light', payload, {
                                timeoutMs: 60000
                            })];
                    case 2:
                        response = _a.sent();
                        if (response.success === false) {
                            return [2 /*return*/, {
                                    success: false,
                                    error: response.error || response.message || 'Failed to create sky light'
                                }];
                        }
                        return [2 /*return*/, __assign({ success: true, message: response.message || 'Sky light created' }, (response.result || {}))];
                    case 3:
                        error_2 = _a.sent();
                        return [2 /*return*/, {
                                success: false,
                                error: "Failed to create sky light: ".concat(error_2 instanceof Error ? error_2.message : String(error_2))
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    // Remove duplicate SkyLights and keep only one (named target label)
    LightingTools.prototype.ensureSingleSkyLight = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var defaultName, name, recapture, response, resultObj, error_3;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        defaultName = 'MCP_Test_Sky';
                        name = this.normalizeName(params === null || params === void 0 ? void 0 : params.name, defaultName);
                        recapture = !!(params === null || params === void 0 ? void 0 : params.recapture);
                        if (!this.automationBridge) {
                            throw new Error('Automation Bridge required for sky light management');
                        }
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.automationBridge.sendAutomationRequest('ensure_single_sky_light', {
                                name: name,
                                recapture: recapture
                            }, {
                                timeoutMs: 60000
                            })];
                    case 2:
                        response = _c.sent();
                        if (response.success === false) {
                            return [2 /*return*/, {
                                    success: false,
                                    error: response.error || response.message || 'Failed to ensure single sky light'
                                }];
                        }
                        resultObj = ((_a = response.result) !== null && _a !== void 0 ? _a : {});
                        return [2 /*return*/, __assign({ success: true, message: response.message || "Ensured single SkyLight (removed ".concat((_b = resultObj.removed) !== null && _b !== void 0 ? _b : 0, ")") }, resultObj)];
                    case 3:
                        error_3 = _c.sent();
                        return [2 /*return*/, {
                                success: false,
                                error: "Failed to ensure single sky light: ".concat(error_3 instanceof Error ? error_3.message : String(error_3))
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    // Setup global illumination
    LightingTools.prototype.setupGlobalIllumination = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var response, e_5, commands, qualityMap, qualityValue, _i, commands_1, cmd;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        // VALIDATE: method is now required
                        if (!params.method) {
                            return [2 /*return*/, {
                                    success: false,
                                    error: 'MISSING_REQUIRED_PARAM',
                                    message: "'method' parameter is required for setup_global_illumination"
                                }];
                        }
                        if (!this.automationBridge) return [3 /*break*/, 4];
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.automationBridge.sendAutomationRequest('setup_global_illumination', {
                                method: params.method,
                                quality: params.quality,
                                indirectLightingIntensity: params.indirectLightingIntensity,
                                bounces: params.bounces
                            })];
                    case 2:
                        response = _b.sent();
                        if (response.success) {
                            return [2 /*return*/, __assign({ success: true, message: 'Global illumination configured via bridge' }, (response.result || {}))];
                        }
                        // Bridge returned failure - propagate the error, don't fall back to console
                        return [2 /*return*/, {
                                success: false,
                                error: response.error || 'BRIDGE_ERROR',
                                message: response.message || 'Failed to configure global illumination via bridge'
                            }];
                    case 3:
                        e_5 = _b.sent();
                        // Connection/timeout errors - can fall back to console commands
                        log.debug("Bridge error for setup_global_illumination, falling back to console: ".concat(e_5));
                        return [3 /*break*/, 4];
                    case 4:
                        commands = [];
                        switch (params.method) {
                            case 'Lightmass':
                                commands.push('r.DynamicGlobalIlluminationMethod 0');
                                break;
                            case 'LumenGI':
                                commands.push('r.DynamicGlobalIlluminationMethod 1');
                                break;
                            case 'ScreenSpace':
                                commands.push('r.DynamicGlobalIlluminationMethod 2');
                                break;
                            case 'None':
                                commands.push('r.DynamicGlobalIlluminationMethod 3');
                                break;
                        }
                        if (params.quality) {
                            qualityMap = { 'Low': 0, 'Medium': 1, 'High': 2, 'Epic': 3 };
                            qualityValue = (_a = qualityMap[params.quality]) !== null && _a !== void 0 ? _a : 1;
                            commands.push("r.Lumen.Quality ".concat(qualityValue));
                        }
                        if (params.indirectLightingIntensity !== undefined) {
                            commands.push("r.IndirectLightingIntensity ".concat(params.indirectLightingIntensity));
                        }
                        if (params.bounces !== undefined) {
                            commands.push("r.Lumen.MaxReflectionBounces ".concat(params.bounces));
                        }
                        _i = 0, commands_1 = commands;
                        _b.label = 5;
                    case 5:
                        if (!(_i < commands_1.length)) return [3 /*break*/, 8];
                        cmd = commands_1[_i];
                        return [4 /*yield*/, this.bridge.executeConsoleCommand(cmd)];
                    case 6:
                        _b.sent();
                        _b.label = 7;
                    case 7:
                        _i++;
                        return [3 /*break*/, 5];
                    case 8: return [2 /*return*/, { success: true, message: 'Global illumination configured (console)' }];
                }
            });
        });
    };
    // Configure shadows
    LightingTools.prototype.configureShadows = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var response, _e_1, commands, qualityMap, qualityValue, _i, commands_2, cmd;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!this.automationBridge) return [3 /*break*/, 4];
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.automationBridge.sendAutomationRequest('configure_shadows', {
                                shadowQuality: params.shadowQuality,
                                cascadedShadows: params.cascadedShadows,
                                shadowDistance: params.shadowDistance,
                                contactShadows: params.contactShadows,
                                rayTracedShadows: params.rayTracedShadows,
                                virtualShadowMaps: params.rayTracedShadows // Map to VSM for C++ handler
                            })];
                    case 2:
                        response = _b.sent();
                        if (response.success)
                            return [2 /*return*/, __assign({ success: true, message: 'Shadow settings configured via bridge' }, (response.result || {}))];
                        return [3 /*break*/, 4];
                    case 3:
                        _e_1 = _b.sent();
                        return [3 /*break*/, 4];
                    case 4:
                        commands = [];
                        if (params.shadowQuality) {
                            qualityMap = { 'Low': 0, 'Medium': 1, 'High': 2, 'Epic': 3 };
                            qualityValue = (_a = qualityMap[params.shadowQuality]) !== null && _a !== void 0 ? _a : 1;
                            commands.push("r.ShadowQuality ".concat(qualityValue));
                        }
                        if (params.cascadedShadows !== undefined) {
                            commands.push("r.Shadow.CSM.MaxCascades ".concat(params.cascadedShadows ? 4 : 1));
                        }
                        if (params.shadowDistance !== undefined) {
                            commands.push("r.Shadow.DistanceScale ".concat(params.shadowDistance));
                        }
                        if (params.contactShadows !== undefined) {
                            commands.push("r.ContactShadows ".concat(params.contactShadows ? 1 : 0));
                        }
                        if (params.rayTracedShadows !== undefined) {
                            commands.push("r.RayTracing.Shadows ".concat(params.rayTracedShadows ? 1 : 0));
                        }
                        _i = 0, commands_2 = commands;
                        _b.label = 5;
                    case 5:
                        if (!(_i < commands_2.length)) return [3 /*break*/, 8];
                        cmd = commands_2[_i];
                        return [4 /*yield*/, this.bridge.executeConsoleCommand(cmd)];
                    case 6:
                        _b.sent();
                        _b.label = 7;
                    case 7:
                        _i++;
                        return [3 /*break*/, 5];
                    case 8: return [2 /*return*/, { success: true, message: 'Shadow settings configured (console)' }];
                }
            });
        });
    };
    // Build lighting
    LightingTools.prototype.buildLighting = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var response, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.automationBridge) {
                            throw new Error('Automation Bridge required for lighting build');
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.automationBridge.sendAutomationRequest('bake_lightmap', {
                                quality: params.quality || 'High',
                                buildOnlySelected: params.buildOnlySelected || false,
                                buildReflectionCaptures: params.buildReflectionCaptures !== false,
                                levelPath: params.levelPath
                            }, {
                                timeoutMs: 300000 // 5 minutes for lighting builds
                            })];
                    case 2:
                        response = _a.sent();
                        if (response.success === false) {
                            return [2 /*return*/, {
                                    success: false,
                                    error: response.error || response.message || 'Failed to build lighting'
                                }];
                        }
                        return [2 /*return*/, __assign({ success: true, message: response.message || 'Lighting build started' }, (response.result || {}))];
                    case 3:
                        error_4 = _a.sent();
                        return [2 /*return*/, {
                                success: false,
                                error: "Failed to build lighting: ".concat(error_4 instanceof Error ? error_4.message : String(error_4))
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    // Create a new level with proper lighting settings
    LightingTools.prototype.createLightingEnabledLevel = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var path, levelName, response, error_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        path = params === null || params === void 0 ? void 0 : params.path;
                        if (!path && (params === null || params === void 0 ? void 0 : params.levelName)) {
                            path = "/Game/Maps/".concat(params.levelName);
                        }
                        levelName = (params === null || params === void 0 ? void 0 : params.levelName) || 'LightingEnabledLevel';
                        if (!this.automationBridge) {
                            throw new Error('Automation Bridge not available. Level creation requires plugin support.');
                        }
                        // If no path provided, generate one from levelName
                        if (!path) {
                            path = "/Game/Maps/".concat(levelName);
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.automationBridge.sendAutomationRequest('create_lighting_enabled_level', {
                                path: path, // Always send path to C++ handler
                                levelName: levelName,
                                copyActors: (params === null || params === void 0 ? void 0 : params.copyActors) === true,
                                useTemplate: (params === null || params === void 0 ? void 0 : params.useTemplate) === true,
                            }, {
                                timeoutMs: 120000 // 2 minutes for level creation
                            })];
                    case 2:
                        response = _a.sent();
                        if (response.success === false) {
                            return [2 /*return*/, {
                                    success: false,
                                    error: response.error || response.message || 'Failed to create level'
                                }];
                        }
                        return [2 /*return*/, __assign({ success: true, message: response.message || "Created new level \"".concat(levelName, "\" with lighting enabled") }, (response.result || {}))];
                    case 3:
                        error_5 = _a.sent();
                        return [2 /*return*/, {
                                success: false,
                                error: "Failed to create lighting-enabled level: ".concat(error_5)
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    // Create lightmass importance volume
    LightingTools.prototype.createLightmassVolume = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var name, toVector3, locArr, sizeArr, response, error_6;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        name = this.normalizeName(params.name);
                        if (!this.automationBridge) {
                            throw new Error('Automation Bridge not available. Lightmass volume creation requires plugin support.');
                        }
                        toVector3 = function (val, defaultVal) {
                            if (Array.isArray(val) && val.length >= 3) {
                                return [Number(val[0]) || 0, Number(val[1]) || 0, Number(val[2]) || 0];
                            }
                            if (val && typeof val === 'object') {
                                var obj = val;
                                return [Number(obj.x) || 0, Number(obj.y) || 0, Number(obj.z) || 0];
                            }
                            return defaultVal;
                        };
                        locArr = toVector3(params.location, [0, 0, 0]);
                        sizeArr = toVector3(params.size, [1000, 1000, 1000]);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.automationBridge.sendAutomationRequest('create_lightmass_volume', {
                                name: name,
                                location: { x: locArr[0], y: locArr[1], z: locArr[2] },
                                size: { x: sizeArr[0], y: sizeArr[1], z: sizeArr[2] }
                            }, {
                                timeoutMs: 60000
                            })];
                    case 2:
                        response = _a.sent();
                        if (response.success === false) {
                            return [2 /*return*/, {
                                    success: false,
                                    error: response.error || response.message || 'Failed to create lightmass volume'
                                }];
                        }
                        return [2 /*return*/, __assign({ success: true, message: "LightmassImportanceVolume '".concat(name, "' created") }, (response.result || {}))];
                    case 3:
                        error_6 = _a.sent();
                        return [2 /*return*/, {
                                success: false,
                                error: "Failed to create lightmass volume: ".concat(error_6)
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    // Set exposure
    LightingTools.prototype.setExposure = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var response, _e_2, commands, _i, commands_3, cmd;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.automationBridge) return [3 /*break*/, 4];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.automationBridge.sendAutomationRequest('set_exposure', {
                                method: params.method,
                                compensationValue: params.compensationValue,
                                minBrightness: params.minBrightness,
                                maxBrightness: params.maxBrightness
                            })];
                    case 2:
                        response = _a.sent();
                        if (response.success)
                            return [2 /*return*/, __assign({ success: true, message: 'Exposure settings updated via bridge' }, (response.result || {}))];
                        return [3 /*break*/, 4];
                    case 3:
                        _e_2 = _a.sent();
                        return [3 /*break*/, 4];
                    case 4:
                        commands = [];
                        commands.push("r.EyeAdaptation.ExposureMethod ".concat(params.method === 'Manual' ? 0 : 1));
                        if (params.compensationValue !== undefined) {
                            commands.push("r.EyeAdaptation.ExposureCompensation ".concat(params.compensationValue));
                        }
                        if (params.minBrightness !== undefined) {
                            commands.push("r.EyeAdaptation.MinBrightness ".concat(params.minBrightness));
                        }
                        if (params.maxBrightness !== undefined) {
                            commands.push("r.EyeAdaptation.MaxBrightness ".concat(params.maxBrightness));
                        }
                        _i = 0, commands_3 = commands;
                        _a.label = 5;
                    case 5:
                        if (!(_i < commands_3.length)) return [3 /*break*/, 8];
                        cmd = commands_3[_i];
                        return [4 /*yield*/, this.bridge.executeConsoleCommand(cmd)];
                    case 6:
                        _a.sent();
                        _a.label = 7;
                    case 7:
                        _i++;
                        return [3 /*break*/, 5];
                    case 8: return [2 /*return*/, { success: true, message: 'Exposure settings updated (console)' }];
                }
            });
        });
    };
    // Set ambient occlusion
    LightingTools.prototype.setAmbientOcclusion = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var response, _e_3, commands, qualityMap, qualityValue, _i, commands_4, cmd;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!this.automationBridge) return [3 /*break*/, 4];
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.automationBridge.sendAutomationRequest('set_ambient_occlusion', {
                                enabled: params.enabled,
                                intensity: params.intensity,
                                radius: params.radius,
                                quality: params.quality
                            })];
                    case 2:
                        response = _b.sent();
                        if (response.success)
                            return [2 /*return*/, __assign({ success: true, message: 'Ambient occlusion configured via bridge' }, (response.result || {}))];
                        return [3 /*break*/, 4];
                    case 3:
                        _e_3 = _b.sent();
                        return [3 /*break*/, 4];
                    case 4:
                        commands = [];
                        commands.push("r.AmbientOcclusion.Enabled ".concat(params.enabled ? 1 : 0));
                        if (params.intensity !== undefined) {
                            commands.push("r.AmbientOcclusion.Intensity ".concat(params.intensity));
                        }
                        if (params.radius !== undefined) {
                            commands.push("r.AmbientOcclusion.Radius ".concat(params.radius));
                        }
                        if (params.quality) {
                            qualityMap = { 'Low': 0, 'Medium': 1, 'High': 2 };
                            qualityValue = (_a = qualityMap[params.quality]) !== null && _a !== void 0 ? _a : 1;
                            commands.push("r.AmbientOcclusion.Quality ".concat(qualityValue));
                        }
                        _i = 0, commands_4 = commands;
                        _b.label = 5;
                    case 5:
                        if (!(_i < commands_4.length)) return [3 /*break*/, 8];
                        cmd = commands_4[_i];
                        return [4 /*yield*/, this.bridge.executeConsoleCommand(cmd)];
                    case 6:
                        _b.sent();
                        _b.label = 7;
                    case 7:
                        _i++;
                        return [3 /*break*/, 5];
                    case 8: return [2 /*return*/, { success: true, message: 'Ambient occlusion configured (console)' }];
                }
            });
        });
    };
    // Setup volumetric fog
    LightingTools.prototype.setupVolumetricFog = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var response, error_7;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                    // Enable/disable global volumetric fog via CVar
                    return [4 /*yield*/, this.bridge.executeConsoleCommand("r.VolumetricFog ".concat(params.enabled ? 1 : 0))];
                    case 1:
                        // Enable/disable global volumetric fog via CVar
                        _a.sent();
                        if (!this.automationBridge) {
                            return [2 /*return*/, {
                                    success: true,
                                    message: 'Volumetric fog console setting applied (plugin required for fog actor adjustment)'
                                }];
                        }
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, this.automationBridge.sendAutomationRequest('setup_volumetric_fog', {
                                enabled: params.enabled,
                                density: params.density,
                                scatteringIntensity: params.scatteringIntensity,
                                fogHeight: params.fogHeight
                            }, {
                                timeoutMs: 60000
                            })];
                    case 3:
                        response = _a.sent();
                        if (response.success === false) {
                            return [2 /*return*/, {
                                    success: false,
                                    error: response.error || response.message || 'Failed to configure volumetric fog'
                                }];
                        }
                        return [2 /*return*/, __assign({ success: true, message: 'Volumetric fog configured' }, (response.result || {}))];
                    case 4:
                        error_7 = _a.sent();
                        return [2 /*return*/, {
                                success: false,
                                error: "Failed to setup volumetric fog: ".concat(error_7)
                            }];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    return LightingTools;
}());
exports.LightingTools = LightingTools;

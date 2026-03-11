"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadEnv = loadEnv;
function loadEnv() {
    var projectPath = process.env.UE_PROJECT_PATH;
    var editorExe = process.env.UE_EDITOR_EXE;
    var screenshotDir = process.env.UE_SCREENSHOT_DIR;
    return {
        UE_PROJECT_PATH: projectPath,
        UE_EDITOR_EXE: editorExe,
        UE_SCREENSHOT_DIR: screenshotDir,
    };
}

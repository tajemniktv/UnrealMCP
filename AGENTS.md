# Unreal MCP Instructions

**Generated:** 2026-03-11
**Commit:** `02f9b17`
**Branch:** `main`

## Overview

Unreal MCP is a dual-process Unreal Engine automation system:

- TypeScript MCP server in `src/`
- Unreal Editor bridge plugin in `plugins/McpAutomationBridge/`

It currently exposes 36 consolidated tools with action-based dispatch and supports Unreal Engine 5.0 through 5.7.

## Working Rules

- Produce real, working code only. Do not add placeholders, fake success paths, or dead-end stubs.
- Read the full file before editing it.
- Before changing Unreal plugin code, check the relevant engine APIs and existing project patterns first.
- Useful engine reference roots in this workspace are `X:\Unreal_Engine\UE_5.0\Engine`, `X:\Unreal_Engine\UE_5.6\Engine`, and `X:\Unreal_Engine\UE_5.7\Engine`.

## Repository Structure

```text
./
├── src/                    # TS MCP server (NodeNext ESM)
│   ├── automation/         # Bridge client and handshake
│   ├── tools/              # Tool definitions, routing, handlers
│   │   ├── consolidated-tool-definitions.ts
│   │   ├── consolidated-tool-handlers.ts
│   │   └── handlers/
│   └── utils/              # Validation, normalization, safety, queues
├── plugins/                # Unreal bridge plugin (C++)
│   └── McpAutomationBridge/
│       ├── Source/
│       └── Config/
├── tests/                  # Vitest + integration coverage
├── scripts/                # Maintenance and CI helpers
└── .github/                # CI and Copilot metadata
```

## High-Signal Files

| Task | Location | Notes |
| ------ | ---------- | ------- |
| Add/extend tool schema | `src/tools/consolidated-tool-definitions.ts` | Action enums plus input/output schemas |
| Register tool routing | `src/tools/consolidated-tool-handlers.ts` | Uses `toolRegistry.register()` |
| Implement TS domain logic | `src/tools/handlers/*-handlers.ts` | Prefer `executeAutomationRequest()` |
| Validate tool results | `src/utils/response-validator.ts` | AJV output validation |
| Bridge connection logic | `src/automation/bridge.ts` | WebSocket client, ports, env overrides |
| Protect runtime stdout | `src/index.ts` | `routeStdoutLogsToStderr()` |
| Silence env loading | `src/config.ts` | Prevents stdout corruption |
| Filter console commands | `src/utils/command-validator.ts` | Do not bypass |
| Queue/throttle UE calls | `src/utils/unreal-command-queue.ts` | Retries and rate control |
| Implement Unreal actions | `plugins/McpAutomationBridge/Source/Private/*Handlers.cpp` | Register in subsystem initialization |
| UE save safety helpers | `plugins/McpAutomationBridge/Source/**/McpAutomationBridgeHelpers.h` | Use safe asset save helpers |

## Core Architecture

1. TypeScript validates tool input against JSON schema.
2. Tool handlers dispatch through the registry and bridge helpers.
3. The TS bridge sends JSON payloads over WebSocket to the Unreal plugin.
4. The C++ subsystem dispatches on the game thread, executes native Unreal APIs, and returns JSON results.

## Non-Obvious Constraints

### MCP I/O safety

- Keep runtime stdout JSON-only.
- Never add `console.log` in runtime paths.
- Send logs through the project logger; `routeStdoutLogsToStderr()` exists specifically to protect JSON-RPC traffic.
- `.env` loading is intentionally quiet; do not reintroduce noisy startup logging.

### Unreal 5.7 safety

- Do not use `UPackage::SavePackage()` on 5.7 code paths; use the project safe-save helpers.
- SCS component templates must be created through `SCS->CreateNode()` and `AddNode()`.
- `ANY_PACKAGE` is deprecated; use `nullptr` for path lookups.

### Path and command safety

- Prefer `/Game/...` asset paths.
- Respect existing `/Content` to `/Game` normalization layers; do not invent competing path rules.
- Console commands must go through the command validator.
- Unreal calls should go through the existing queue/retry layer.

## TypeScript Standards

- Strict mode is on; keep it that way.
- No `as any` in runtime code.
- Prefer `unknown`, explicit interfaces, and schema-backed parsing.
- Keep unit tests colocated when appropriate; keep broader integration coverage in `tests/`.

## Connection and Runtime Configuration

- The Unreal plugin listens on `127.0.0.1` using ports `8090,8091` by default.
- The TS bridge connects as a WebSocket client.
- Port overrides are supported through environment variables such as `MCP_AUTOMATION_CLIENT_PORT` and `MCP_AUTOMATION_WS_PORTS`.
- Set `MOCK_UNREAL_CONNECTION=true` to force offline/mock bridge success in CI or local smoke runs.

## Tooling Workflow

### Adding a new action end-to-end

1. Extend the relevant action enum and schemas in `src/tools/consolidated-tool-definitions.ts`.
2. Route the action in `src/tools/consolidated-tool-handlers.ts` or the appropriate domain handler file.
3. Implement the Unreal-side action in the appropriate C++ handler and register it in `UMcpAutomationBridgeSubsystem::InitializeHandlers()`.
4. Add or update tests in `tests/`.

### Required conventions

- Always use `toolRegistry.register()`. Do not call handlers directly.
- Always reach Unreal through `executeAutomationRequest()` rather than raw WebSocket calls.
- Do not leave action stubs half-implemented across TS and C++.

## Anti-Patterns

- No runtime `console.log`.
- No raw WebSocket calls from tool handlers.
- No direct handler bypass around the registry.
- No hardcoded machine-specific paths.
- No legacy save hacks or deprecated save paths.
- No incomplete tool implementations that stop at schema or TS routing without C++ support.

## Commands

```bash
npm install            # Install dependencies
npm run dev            # ts-node-esm development server
npm start              # Run built server
npm run build          # Clean + build
npm run build:core     # Build TypeScript
npm run automation:sync
npm run lint           # ESLint entrypoint
npm run lint:cpp
npm run lint:csharp
npm run test:unit      # Vitest
npm test               # Integration tests (requires Unreal Editor unless mocked)
npm run test:smoke     # Mock-mode smoke test
```

## Setup Notes

- Requires Node.js 18 or newer.
- Requires Unreal Engine 5.0 through 5.7.
- After plugin changes, regenerate project files and rebuild the Unreal project as needed.
- The bridge is considered healthy when the Unreal side reports that the automation bridge is listening.

## Testing Notes

- Unit tests run with Vitest.
- Integration coverage lives under `tests/`.
- Use mock mode when Unreal is unavailable.
- Keep test expectations aligned with the current action contract and response schema.

## Project-Specific Notes

- This repo uses consolidated tools rather than one-file-per-tool sprawl.
- Integration tests support pipe-separated expectations such as `success|error|timeout`.
- Version data is synchronized across `package.json`, `server.json`, and `src/index.ts`.
- CI workflows pin actions by commit SHA.

## Dynamic Tool Discovery & Token Optimization

To optimize token usage, the MCP server may not provide all 36 tools by default (especially if `MCP_DEFAULT_CATEGORIES` is set to `core`).

**If you are asked to perform a task (e.g., create a widget, modify a level, control gameplay) and you do not see the corresponding tool in your list:**
1. You **must** use the `manage_tools` tool with `action: 'enable_category'`.
2. Provide the appropriate category name:
   - `core`: Basic system management tools.
   - `world`: Level, landscape, and environment management.
   - `authoring`: Asset creation (widgets, materials, blueprints).
   - `gameplay`: AI, inventory, combat, networking, GAS.
   - `utility`: Helper utilities and inspectors.
3. Once the category is enabled, the server will expose the new tools to you, and you can proceed with the task.

**Example:** If you need to author a widget but `manage_widget_authoring` is missing, call `manage_tools({ action: 'enable_category', category: 'authoring' })` first.

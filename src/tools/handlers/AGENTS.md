# src/tools/handlers Instructions

Canonical repository guidance lives in [`../../../AGENTS.md`](../../../AGENTS.md).

This directory contains domain-specific tool handlers. These files translate validated MCP tool input into bridge requests.

## Keep These Invariants

- Always dispatch through `executeAutomationRequest()` in `common-handlers.ts`.
- Do not call the WebSocket bridge directly from domain handlers.
- Do not add TS-only actions without matching Unreal-side support.
- Include tool and action context in thrown errors.
- Normalize or sanitize paths before sending them to the bridge.

## Where To Change Things

- Shared utilities: `common-handlers.ts`
- Tool routing: `../consolidated-tool-handlers.ts`
- Tool schemas: `../consolidated-tool-definitions.ts`
- Domain handlers: `*-handlers.ts`

## Expected Handler Shape

- Parse or narrow `args`
- Resolve `action`
- Validate action-specific inputs
- Normalize paths or names where needed
- Call `executeAutomationRequest()`
- Return the bridge response without bypassing shared parsing/error helpers

## High-Risk Mistakes

- Sending raw bridge messages instead of using shared helpers
- Skipping normalization for asset or package paths
- Adding placeholder branches like `"not implemented"`
- Letting TS action names drift from Unreal handler names

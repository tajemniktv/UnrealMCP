# tests Instructions

Canonical repository guidance lives in [`../AGENTS.md`](../AGENTS.md).

This directory contains the current test entrypoints for Unreal MCP.

## Current Layout

- `integration.mjs`: main integration entrypoint
- `test-runner.mjs`: integration runner and shared infrastructure
- `heartbeat-progress.test.mjs`: bridge heartbeat/progress coverage
- `unit/`: Vitest coverage grouped by area

## Keep These Invariants

- `npm test` should remain the main integration command.
- `npm run test:unit` should remain runnable without Unreal.
- Mock-mode and integration expectations should reflect real bridge behavior, not paper over infrastructure failures.
- Test updates should follow the current file layout, not older `tests/mcp-tools/` conventions.

## Where To Add Coverage

- Add or adjust integration coverage through `integration.mjs` and `test-runner.mjs`.
- Add unit coverage under `unit/` in the closest matching area.
- Keep security-sensitive validation covered when changing path handling, asset handling, or GraphQL/resource exposure.

## High-Risk Mistakes

- Treating disconnects or bridge crashes as acceptable success cases
- Adding stale path references to removed test directories
- Making tests pass by broadening expected outcomes instead of fixing behavior
- Creating fragile tests that depend on fixed actor names or editor state without setup

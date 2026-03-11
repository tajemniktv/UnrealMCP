# src/automation Instructions

Canonical repository guidance lives in [`../../AGENTS.md`](../../AGENTS.md).

This directory owns the bridge client, connection lifecycle, handshake, request tracking, and message flow between the MCP server and the Unreal plugin.

## Keep These Invariants

- Every request must have tracked request lifecycle state.
- Handshake must complete before normal automation traffic begins.
- Heartbeat and reconnect behavior must stay intact.
- Timeouts must fail cleanly and release pending request state.
- Never log capability tokens or other connection secrets.

## Key Files

- `bridge.ts`: main bridge client
- `connection-manager.ts`: reconnect and heartbeat behavior
- `handshake.ts`: bridge negotiation
- `message-handler.ts`: frame parsing and dispatch
- `request-tracker.ts`: pending request ownership

## High-Risk Mistakes

- Bypassing request tracking
- Writing directly to sockets from random call sites
- Comparing payload size by string length instead of byte size
- Leaving timers, listeners, or pending requests orphaned after failure paths

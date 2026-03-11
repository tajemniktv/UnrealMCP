# src/tools Instructions

Canonical repository guidance lives in [`../../AGENTS.md`](../../AGENTS.md).

Use this directory-level file only for local navigation:

- Tool schemas and action enums live in `consolidated-tool-definitions.ts`.
- Tool registration lives in `consolidated-tool-handlers.ts`.
- Domain implementations live in `handlers/`.

When adding or changing a tool:

1. Update the action enum and schemas in `consolidated-tool-definitions.ts`.
2. Register or route the tool in `consolidated-tool-handlers.ts`.
3. Implement the domain behavior in `handlers/*-handlers.ts`.
4. Ensure the Unreal plugin has the corresponding native action.

For handler-specific conventions, read [`handlers/AGENTS.md`](./handlers/AGENTS.md).

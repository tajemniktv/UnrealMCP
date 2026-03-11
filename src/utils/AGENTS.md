# src/utils Instructions

Canonical repository guidance lives in [`../../AGENTS.md`](../../AGENTS.md).

This directory contains shared normalization, validation, logging, and safety utilities used across the server.

- Keep utility behavior generic and reusable.
- Prefer pure functions except for logging and queueing utilities.
- Do not bypass path safety or command validation helpers.
- Preserve the zero-`any` standard here; use `unknown`, narrowing, and explicit types.

Primary entrypoints:

- `normalize.ts`
- `path-security.ts`
- `validation.ts`
- `response-validator.ts`
- `unreal-command-queue.ts`
- `logger.ts`

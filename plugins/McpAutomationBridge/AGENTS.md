# plugins/McpAutomationBridge Instructions

Canonical repository guidance lives in [`../../AGENTS.md`](../../AGENTS.md).

This plugin is the Unreal-side execution layer for automation requests. Changes here can crash the editor if they bypass the existing safety patterns.

## Keep These Invariants

- Register new native actions in `UMcpAutomationBridgeSubsystem::InitializeHandlers()`.
- Preserve game-thread safety; handler execution must remain compatible with subsystem dispatch.
- Use the existing helper and sanitization utilities instead of ad hoc path or asset handling.
- On Unreal 5.7 paths, use the project safe-save helpers instead of `UPackage::SavePackage()`.
- For Blueprint SCS/component work, follow the existing ownership patterns (`SCS->CreateNode()` and `AddNode()`).

## Where To Change Things

- Public declarations: `Source/McpAutomationBridge/Public/`
- Request routing and subsystem behavior: `Source/McpAutomationBridge/Private/McpAutomationBridgeSubsystem.cpp`
- Native action implementations: `Source/McpAutomationBridge/Private/*Handlers.cpp`
- Shared helpers and safety code: `Source/McpAutomationBridge/Private/McpAutomationBridgeHelpers.h`

## High-Risk Mistakes

- Using deprecated object lookup patterns such as `ANY_PACKAGE`
- Saving assets through the wrong Unreal API path
- Blocking the main thread with long-running or modal editor behavior
- Introducing absolute machine-specific paths
- Diverging native action names from the TypeScript side

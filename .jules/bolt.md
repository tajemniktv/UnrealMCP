## 2024-05-19 - Optimization Opportunity Identified: Batch Console Commands

**Learning:** When executing multiple console commands via `UnrealBridge` (e.g., inside tools like `EditorTools` or `LightingTools`), use `this.bridge.executeConsoleCommands(commandsArray)` rather than looping `this.bridge.executeConsoleCommand` to improve code clarity and reduce N+1 await overhead. The memory notes this as an explicit learning point.

**Action:** Replace `for (const cmd of commands) { await this.bridge.executeConsoleCommand(cmd); }` with `await this.bridge.executeConsoleCommands(commands);` in `src/tools/lighting.ts`.

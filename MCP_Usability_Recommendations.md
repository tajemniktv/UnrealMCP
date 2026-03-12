# MCP Usability Recommendations for Unreal Editor

This document captures practical recommendations, required features, and issues encountered while using the MCP (Unreal_mcp) surface to automate Editor tasks for the SatisfactoryModLoader workspace. The goal is to make MCP easier to use for blueprint/asset automation and reduce brittle failures.

## Summary

- Preferred automation channel: Editor-Python via MCP (most powerful & flexible).
- Secondary: dedicated MCP blueprint/graph tools (manage_blueprint / manage_blueprint_graph) when fully-featured.
- Primary action needed from MCP owners: keep the `authoring` category enabled and expose a small set of reliable helper actions for blueprint graph editing.

## Key needs from MCP

1. Enable categories by default (or a single explicit call) so automation scripts can run without repeated permission failures:
   - `authoring` (blueprints, graphs, assets)
   - `core` (inspect, asset CRUD)
   - `utility` (debug/sequence helpers)

2. Stable, documented graph-editing helpers. Current gaps make automated wiring fragile. Minimum helpers we need:
   - enumerate blueprint graphs (get_all_graphs / get_uber_graph_pages)
   - create function-call node by function identifier
   - set node pin default value (typed)
   - create AddDelegate/Bind node and set target delegate property by name
   - connect node pins by explicit pin-IDs (or by friendly pin names)
   - save asset

3. A mapping of editor-facing node titles → canonical node class / function identifiers. In multiple cases the node title visible in the editor differs from the API name and causes `FUNCTION_NOT_FOUND` or node-type mismatches.

4. Robust Editor-Python sandbox via MCP exposing common BlueprintEditorLibrary functions. Example missing items we encountered: `BlueprintEditorLibrary.get_all_graphs`.

## Problems we encountered (real examples)

- Python fallback failed with AttributeError: `BlueprintEditorLibrary` did not contain `get_all_graphs` in the exposed environment. Script had to fall back to fragile asset-property access.
- Creating a CallFunction node returned `FUNCTION_NOT_FOUND` because the function name used in the editor palette did not match the API identifier the MCP expects.
- Delegate wiring requires exact delegate property selection and pin identifiers — high-level `AddDelegate` creation is insufficient without a helper to pick the delegate and wire the event pin.
- Many MCP endpoints are strict about JSON shapes (arrays vs objects, exact field names). Slight differences cause opaque invalid-input errors.

## Concrete improvements — prioritized

1. Expose a small, battle-tested Python helper module via MCP with functions like:
   - mcp_blueprint.get_event_graph(bp_asset)
   - mcp_blueprint.ensure_custom_event(bp_asset, event_name)
   - mcp_blueprint.create_call_function_node(bp_asset, graph, function_fqn, position)
   - mcp_blueprint.set_node_pin_value(node, pin_name, value)
   - mcp_blueprint.create_add_delegate(bp_asset, graph, target_object_pin, delegate_name, position)
   - mcp_blueprint.connect_pins(src_node, src_pin, dst_node, dst_pin)
   These wrappers should handle engine-version differences and return clear structured results.

2. Provide canonical tooling docs (short) showing exact nodeType / function names that `manage_blueprint_graph.create_node` accepts for common operations (CallFunction, AddDelegate, CustomEvent, etc.).

3. Improve error messages for create_node / call_function actions (return which identifiers were tried and the available function list for the asset/project scope).

4. Allow higher-level convenience actions: `bind_config_property_to_event(blueprintPath, configKey, eventName)` which performs the full sequence safely and idempotently.

## Short-term workarounds for implementers

- If Python via MCP is available, prefer running editor scripts manually once and then use the results as a baseline — Python can inspect pins and choose delegate properties reliably.
- When automation fails, fall back to: open `BP_RootGameInstance_TajsGraph` in the Editor and do three manual steps (lookup node, AddDelegate, wire event). The steps are quick and safe.

## Example: Minimal manual steps to finish when automation fails

1. Open `BP_RootGameInstance_TajsGraph` → EventGraph.
2. Add Call Function node: `Conv_ConfigPropertySectionToConfigProperty` (or your project-specific lookup function). Set Key = `DefaultFeatureBloom`.
3. Add `Add Delegate` node and set its Delegate property to the ConfigProperty's `OnPropertyValueChanged` delegate.
4. Connect BeginPlay -> lookup -> AddDelegate and connect AddDelegate's Event pin to your `OnDefaultFeatureBloomChanged` custom event.
5. Save and test.

## Final notes

I can produce a drop-in MCP Python helper module and a toy convenience action (`bind_config_property_to_event`) if you want — this will remove most manual steps. To proceed I need the MCP authoring category enabled (it is currently enabled in your environment per `manage_tools.get_status`) and small helper exports placed into the MCP Python path.

If you want, I will now:
- implement the helper Python functions as an MCP-side script, or
- open a PR with improved consolidated-tool-definitions and docs showing canonical node names.

Tell me which next step you prefer.

## Limitations encountered

Node palette / type resolution: the MCP blueprint API requires exact engine node class names and sometimes function references; nodes that appear in the editor palette can be named differently in the API (caused "NODE_TYPE_NOT_FOUND").

Strict input shapes: many MCP actions expect very specific JSON shapes (e.g., arrays vs objects, exact keys like assetPath). If a parameter is slightly off the call fails with "Missing 'assetPath'" or invalid-input errors.

Delegate wiring is picky: binding a delegate requires selecting the delegate property on the object (not just a string name) and then wiring the correct event pin — the API needs explicit pin identifiers (hard to discover remotely).

Partial tool coverage / inconsistent actions: some blueprint/graph actions exist but their sub-actions (connect, set-pin) are limited or undocumented in the MCP layer I was calling, so automated wiring may fail even after node creation.

Editor-state dependency: these operations depend on assets/instances loaded and named exactly as in-editor; if an asset is not loaded or referenced in the same way, the tooling fails.
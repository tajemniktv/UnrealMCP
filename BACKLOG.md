# Unreal MCP Feature Backlog

This backlog keeps only ideas that still look missing, weak, or worth expanding in the local fork. It is organized by workflow area instead of by where the idea originally came from.

## 1. Blueprint Ownership Migration Work

### TajsGraph Blueprint ownership migration support

Worth adding:

- graph-level tooling specifically suited to staged ownership rewrites in large existing Blueprints such as `BP_RootGameInstance_TajsGraph`
- support for isolating obsolete legacy binding layers before replacing them
- workflow support for moving ownership from native/subsystem refresh paths into Blueprint-driven config handling where that is the intended end state

Why it matters:

- the main remaining issue is split ownership between legacy graph bindings, subsystem/native refresh paths, and newer Blueprint-driven config handling
- this is the first backlog item that is directly tied to an active TajsGraph migration rather than a general MCP capability gap

### Better graph-level introspection for existing Blueprints

Worth adding:

- nested composite graph traversal helpers
- better summaries for repeated binding clusters in large EventGraphs
- graph diffs that summarize control/data-flow changes after mutation
- deeper recursive nested/composite traversal beyond the current nested-graph discovery/search and explicit composite collapse/expand support
- richer query/filter support layered on top of the new `find_nodes` action, especially for nested composite graphs and repeated binding families
- node queries by title/comment-group instead of GUID-only follow-up work when the graph is already known to contain repeated binding patterns
- stronger Blueprint graph access from the Python fallback path, or a documented equivalent graph-introspection API when Blueprint editor properties are not exposed to Python the normal way

Why it matters:

- the current tooling is much better than before, but nested composite traversal and mutation-oriented summaries are still too manual for large legacy graphs
- this is blocking staged cleanup and ownership migration work in TajsGraph
- in the TajsGraph pass, Python execution worked, but the loaded `Blueprint` object did not expose `ubergraph_pages` / `function_graphs` or matching editor properties, which made Python much less useful for graph discovery than expected

### Safer graph rewrite primitives

Worth adding:

- move or replace a composite binding cluster in one operation
- extend the current duplicate/retarget/disable helpers beyond literal-pin retargeting into richer project-specific cluster semantics
- safer isolate/disable flows for legacy subgraphs before deleting them
- reconnect or retarget external links when duplicating a subgraph
- comment-group aware “disable without delete” operations
- reliable cluster stamping for repeated `MC to ConfigProperty -> Cast To ConfigPropertySection -> Binding Composite` flows
- direct reconnect of an unlinked binding composite by section/key instead of raw pin-level rewiring

Why it matters:

- the TajsGraph root graph contains many near-identical binding composites
- migration work is still too slow if every cluster must be retargeted and rewired manually after duplication

### Graph templates for repeated config-binding patterns

Worth adding:

- upgrade the current scaffold-style config-binding cluster creation into a fully wired template:
  - section lookup
  - property lookup
  - property cast
  - `OnPropertyValueChanged` binding
  - initial conversion/apply call
- the ability to stamp this pattern repeatedly with different section/key/type values and retarget apply pins automatically
- reusable macro-style authoring for repeated config binding clusters
- a template mode that can target an existing composite binding node and inject only the missing config-source and cast path
- support for legacy binding families where the composite returns `bool`, `int`, or `float` so repeated old settings can be reattached quickly

Why it matters:

- the current graph repeats the same pattern for many settings
- the current scaffold is useful, but it still stops short of the full repetitive authoring acceleration this workflow needs

### Blueprint stage cleanup and migration summaries

Worth adding:

- build more migration-specific flows on top of the new `disable_subgraph` action, especially staged “disable + summarize + replace” workflows
- compile-time diff summaries after graph mutation
- staged migration summaries that make it obvious what was:
  - isolated
  - replaced
  - still unresolved

Why it matters:

- the first safe rewrite step in TajsGraph is cleanup/isolation, not pretending the legacy graph already matches the new ownership model
- stage-oriented migration support would make MCP much more useful for incremental Blueprint rewrites

## 2. Settings and Mod Config Work

### Mod-config repair workflows beyond the current batch tool

Worth adding:

- migration-style repair flows that can recreate sections, move nested children, and optionally detach or delete legacy sections in one request
- mixed repair plans that can rewrite classes and metadata together
- direct nested repair targeting by richer path pattern or predicate, not just explicit and prefix path lists
- stronger before/after diffs for repaired config trees, especially structural moves and metadata rewrites
- repair modes that can normalize IDs, display names, and widget classes together
- a “backfill properties from legacy descriptor list” workflow that can upsert many settings with types/defaults/tooltips in one request
- an MCP-side way to set per-property `requiresWorldReload` defaults explicitly without relying on tool defaults during every upsert

Why it matters:

- config repair is now much closer to a migration workflow, but it still needs better metadata normalization and richer selectors
- `UModConfiguration` assets should be repairable through MCP without pushing mods toward runtime workaround code

### Runtime bridge reload awareness for editor-side config work

Worth adding:

- clearer messaging when source patches exist but the running editor bridge has not been rebuilt or reloaded
- stronger editor/plugin build provenance in status responses so “stale bridge” is obvious without reading logs

Why it matters:

- stale bridge state is easier to diagnose now, but the editor/plugin provenance still is not explicit enough

### Data-only mod-config regression coverage

Worth adding:

- editor-backed tests for data-only `UModConfiguration` assets
- regression scenarios covering widget-backed section/property creation, clone/move flows, and config repair

Why it matters:

- the TajsGraph config UI regression came from MCP creating plain config property classes instead of the expected widget-backed classes
- the handler logic is now aligned, but there is still no real editor-backed regression harness proving it against data-only assets

### Remaining config asset editing gaps

Worth adding:

- deeper nested instanced-object editing for section/property graphs
- workflows that mutate object class and metadata together
- safer repair flows for broken data-only config assets
- clearer inspection of section/property class paths and editor-facing widget classes
- config-tree issue summaries that flag plain base classes, suspicious metadata, broken class-load paths, and likely UI-facing config issues
- a reliable descriptor/export path for populated mod-config assets
- better support for legacy Blueprint-backed config assets that resolve through `resolve_mod_config_target` but still fail tree/descriptor inspection unless the exact accepted object path variant is known

Why it matters:

- during the TajsGraph pass, `get_mod_config_tree` worked on the live `TajsGraph_ModConfig`, but `get_mod_config_descriptor` / `validate_mod_config` still reported `descriptorCount: 0`
- the retired `BP_TajsGraph_Config` asset could be resolved to variants, but the tree/descriptor actions still failed with `BLUEPRINT_NOT_FOUND`, which prevented straightforward legacy-to-new cloning

### Config workflow helpers

Worth adding:

- one-call “repair config section classes” flows
- one-call “normalize config IDs and widget section classes” flows
- stronger diff-style summaries before and after mutation beyond the current descriptor-vs-live tree helper
- better issue categories for config, widget, and class loadability
- a one-call “can the live bridge create the right widget-backed config classes?” check
- broader migration recipes layered on top of the current descriptor diff/backfill helper, especially for section deletion/moves, ID normalization, and more opinionated repair plans than the current combined migration orchestrator

## 3. Stability, Compatibility, and Transport

### Optional pluginless editor transport

Worth adding:

- an optional degraded transport that talks to the editor through Unreal Python Remote Execution
- support it only for editor-only workflows when the native bridge is unavailable, failing, incorrect, or too tedious to extend for a one-off task
- explicit capability differences between:
  - native bridge mode
  - pluginless Python-remote mode
  - disconnected mode
- consistent result shapes across transports where possible
- explicit warnings when requests are served through the weaker path
- transport-selection rules that prefer Python fallback only for approved tool families

Why it matters:

- a pluginless path would help setup, recovery, and lighter editor-only workflows without replacing the native bridge

## 4. Inspection and Diagnostics

### Remote profiling and Insights integration

Worth adding:

- remote Unreal Insights capture/start-stop helpers for CPU/GPU/frame investigation
- MCP-side summaries of trace/session locations and the most useful profiling artifacts to inspect next
- a thin profiling workflow that can kick off a capture, annotate the target map/session, and return structured follow-up guidance

Why it matters:

- this came from the roadmap’s unfinished infrastructure work and is directly useful for diagnosing rendering/perf regressions in mods without manually driving every profiling step in the editor
- it is higher value for the current workflow than most of the broader platform/plugin expansion items

### Runtime inspection improvements

Worth adding:

- original mesh versus replacement mesh reporting when remap/replacement data exists
- actual fallback/default-material detection from render state
- clearer reporting of overridden material slots on live components
- stronger editor-versus-PIE differentiation in runtime inspection responses
- richer viewport summaries with active view mode, renderer-relevant toggles, and clearer warnings when the current context prevents authoritative answers

### Mesh and material diagnostics

Worth adding:

- static mesh summaries with authoritative LOD section counts, slot-to-section mapping, imported slot names, and section-level mismatch warnings
- material summaries with graph-backed WPO/PDO/displacement detection, material-function dependency summaries, clearer shader-permutation risk, and stronger evidence fields
- material-instance summaries with fuller static switch coverage, fuller component-mask coverage, and clearer inherited-versus-overridden reporting
- renderer pair analysis with better Nanite compatibility, Lumen-path risk reporting, and stronger causality/evidence output

### Blueprint/runtime loadability inspection packs

Worth adding:

- grouped checks for blueprint asset, generated class, CDO, and live object state
- one-call summaries for common load failures

### AI and NPC debugging helpers

Worth adding:

- read-only summaries for controller/behavior-tree linkage, blackboard state, perception config, and suspect state-tree or EQS wiring
- one-call “why is this NPC not behaving?” diagnostics
- stronger asset/runtime correlation for controllers, trees, blackboards, and spawned pawns

### Physics and destruction diagnostics

Worth adding:

- inspection helpers for collision setup, physics asset linkage, constraints, and destructible/fracture-related state
- runtime summaries for “why is this object not colliding / simulating / breaking?”
- compatibility checks when replacement assets change collision or physics behavior

### Environment and PCG inspection helpers

Worth adding:

- read-only inspection for PCG graphs and generated outputs
- better inspection of landscape/layer/foliage relationships
- world-partition and data-layer state summaries
- environment-system dependency summaries that connect assets back to rendering/gameplay effects
- validation helpers for procedurally generated or placed content

## 5. Content and Modding Workflows

### Asset diff and compatibility workflows

Worth adding:

- source-versus-replacement asset diff summaries across slots, sections, Nanite state, material domains, and major render traits
- stronger replacement-compatibility tooling with section-aware warnings, render-path regression warnings, and suggested next inspection steps

### Shader/debug artifact correlation

Worth adding:

- start from shader metadata and find likely owning materials/meshes
- cross-link shader artifact summaries with dependency slices
- make shader-related incident reports more causal and less inventory-like

### Mod runtime validation

Worth adding:

- stable issue categories
- better grouping of class, widget, and config loadability
- better correlation between logs, live objects, runtime component state, and suspect assets

### Dependency and discovery features

Worth adding:

- deeper dependency traversal of mesh -> materials -> textures -> functions
- better grouping by dependency type
- optional mount-root filtering
- outputs shaped for debugging instead of generic dependency dumps
- faster mod/plugin content discovery by mount root
- “show me suspicious assets under this mod” workflows
- better summaries for large plugin content trees

### Asset and content maintenance workflows

Worth adding:

- bulk asset validation for folders or mount roots
- redirector discovery and fix-up through MCP
- one-call summaries for missing references, invalid soft paths, suspicious uncooked-only assets, and orphaned/duplicated content
- content-browser style discovery for recently changed assets, assets with large dependency fan-out, and assets likely to affect runtime rendering

### Packaging-aware workflows

Worth adding:

- checks that compare editor-usable assets with likely packaged runtime expectations
- warnings for common mount-root and cooked-content pitfalls
- cooked/package parity checks for content-path-sensitive mods

## 6. Extensibility, Python, and UX

### Tool discovery and context reduction

Worth adding:

- lightweight stub definitions for disabled tools instead of hiding them completely
- activation guidance in those stubs, especially around `enable_tools`, `enable_category`, and category-based filtering
- preserved `list_changed` behavior when swapping stub definitions to full definitions
- clearer reasons for unavailability, including disabled category, protected tool, engine-version block, missing plugin prerequisite, or unstable status

### External extension packs

Worth adding:

- a supported way to add custom MCP tool packs outside the core plugin/server codebase
- discovery/loading rules for project-local or plugin-local extensions
- manifest-driven registration for custom native C++ handlers so local forks can extend the bridge without editing the central tool registry every time
- extension metadata for required engine version, required plugins/modules, stability level, and categories/capabilities
- docs and examples for shipping mod- or studio-specific tool extensions without forking the whole MCP

### Controlled Python fallback layer

Worth adding:

- expand the new restricted Python scaffold beyond its first allowlisted templates
- use Python explicitly as a backup option when native handlers fail, lag behind needed editor APIs, or are too tedious to expose natively for specialized workflows
- capability-scoped Python entrypoints for things like:
  - asset audits
  - editor utility wrappers
  - content-browser queries
  - reflection-heavy editor introspection
- optional `preferPythonFallback` behavior for approved tool families where Python is clearly more practical
- broaden the allowlisted template/script model with validated arguments
- add stronger structured result/error serialization back into normal MCP response shapes
- keep the live `system_control` Python entrypoints tolerant of wrapper drift by accepting both direct payload fields and nested `params` fields, plus legacy aliases such as `script` and `path`
- add more thin editor-scripting utility wrappers on top of Python for common workflow tasks beyond the current editor-utility/content-audit coverage
- keep explicit safety controls:
  - editor-only
  - disabled by default unless configured
  - clear capability reporting
  - timeout/output limits
  - no raw console-style Python passthrough by default

Why it matters:

- Python is now available as a constrained scaffold, and the next gains are in template breadth and selective fallback routing rather than reopening arbitrary execution
- the wrapper compatibility bug that caused `run_python_code` and `run_python_file` to reject valid requests has been fixed in both the TS handler and the native editor bridge
- the Python path now supports structured params plus stdout/stderr/traceback capture and safer serialization of arbitrary Unreal/Python objects; the remaining work is editor-side compile/runtime verification and broader automatic fallback routing

### Editor-side MCP control panel

Worth adding:

- a small editor UI surface for MCP status and health:
  - bridge connected/disconnected
  - active transport and port info
  - version/build info
  - enabled/disabled categories
  - unstable/degraded tools
- quick actions for common diagnostics:
  - self-check
  - transport check
  - list active capabilities
  - open recent MCP logs

### Task-oriented inspect cookbook

Worth adding:

- short, focused workflow docs for:
  - replacement mesh renders wrong
  - material works in editor but not at runtime
  - class/widget/config does not load
  - inspect a mounted-root asset quickly

### Starter project and example workflows

Worth adding:

- a small reference Unreal project with the MCP plugin already configured
- sample assets/workflows that exercise the most important local-fork features:
  - mod-config repair
  - runtime inspection
  - renderer/debug investigation
  - asset validation
- example client configs and demo scripts for common MCP clients
- a reproducible smoke-test scenario for validating the bridge after larger changes

### Curated high-level workflow macros

Worth adding:

- a small set of opinionated higher-level workflows for common Unreal tasks that currently require many low-level MCP calls
- candidate macros:
  - investigate render incident
  - repair mod config asset
  - validate replacement mesh/material pairing
  - run content sanity checks for a mount root
- keep these as thin orchestration layers over existing tools instead of turning them into separate product surfaces

### Structured documentation index

Worth adding:

- a clearer docs index by tool family and workflow
- short focused pages for major tool areas instead of relying mostly on the root README
- “when to use this tool vs that tool” guidance for overlapping capabilities
- setup docs for common client configurations and bridge connection modes

### Response-shape improvements

Worth adding:

- more stable issue categories
- clearer evidence fields
- more consistent confidence fields
- more actionable warnings that suggest the next command to run

## 7. Broader UE5 Workflow Expansions

### Testing and quality automation

Worth adding:

- one-call C++ compile and automated-test execution from MCP
- editor automation smoke-test entrypoints for:
  - asset validation
  - mod-config repair verification
  - runtime inspection sanity checks
- structured parsing of build/test output into errors, warnings, likely root causes, and suspect files/assets
- quality gates for local mod/plugin workflows such as a prepackage sanity check

### Utility and editor workflow helpers

Worth adding:

- more editor-utility style operations that reduce repetitive content work:
  - batch rename/move/categorize
  - validation runs on selected assets
  - cleanup/fix-up operations
  - simple content audit reports
- one-call workspace health summaries for the current mod/plugin
- wrappers for creating or running editor utility widgets/blueprints when that is the most pragmatic way to expose repetitive modding workflows
- higher-level wrappers around common multi-step editor operations so users do not need to orchestrate many low-level tool calls

### Accessibility and UI verification helpers

Worth adding:

- widget/UI inspection focused on accessibility and usability checks:
  - missing labels
  - contrast/style risks where queryable
  - navigation/focus issues
  - localization-sensitive text risks
- better summaries for config/menu widgets intended to be user-facing

## 8. Suggested Priority

0. Blueprint ownership migration tooling for TajsGraph and similar staged rewrites
1. Extensibility, Python fallback, and UX improvements
2. Settings and mod-config repair workflows
3. Stability, transport diagnostics, and compatibility hardening
4. Bridge-authoritative runtime inspection and renderer diagnostics
5. Asset diff, replacement compatibility, and packaging-aware workflows

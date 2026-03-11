# Unreal MCP Feature Backlog

## Settings / Mod Config Work First

### Mod-config repair workflows beyond the current batch tool

Worth adding:

- batch rename/move support inside repair flows so a single request can:
  - recreate selected sections with a target class
  - move nested children into the repaired destination
  - delete or detach legacy source sections automatically
- mixed repair plans that can rewrite both classes and metadata in one workflow
- direct nested repair targeting by path pattern or predicate instead of explicit path lists only
- stronger before/after diff output for repaired config trees
- section/property repair modes that can normalize IDs, display names, and widget classes together

Why it matters:

- fixing `TajsGraph_ModConfig` through MCP worked, but it was slower than it should have been because the repair had to be done as many small operations:
  - rename section
  - create replacement section
  - move each child property individually
  - delete old section
- the new batch class-repair tool removes the worst manual work, but config repair still needs stronger migration-style workflows
- the next step is turning “repair this config asset” into a richer asset migration tool, not just a class replacement tool

### Runtime bridge reload awareness for editor-side MCP changes

Worth adding:

- a clear MCP-visible bridge/build version so it is obvious when the running editor is still using old handler code
- a one-call “self-check” that proves whether newly patched handlers are live
- better messaging when the source code is patched but the live editor bridge has not been rebuilt/reloaded yet

Why it matters:

- during this migration, the source fix for section creation was done first, but the live proof only came from creating a probe section
- the source fix for scalar property creation was also done, but the running bridge still created plain `ConfigPropertyBool`, which means the editor had not picked up the patch yet
- without explicit versioning or capability probes, MCP users end up discovering stale bridge state indirectly by trial edits

### Data-only mod-config regression coverage

Still worth adding:

- add tests for data-only `UModConfiguration` assets so regressions are caught automatically

Why it matters:

- this was the real root cause of the TajsGraph config UI regression:
  - MCP created plain `ConfigPropertySection` and plain `ConfigProperty*` objects
  - SML expected the Blueprint widget-backed classes for editor-facing config UI
- the handler paths are now aligned around widget-class-first creation and clone flows, but there is still no real editor-backed regression harness proving that against data-only config assets

### Remaining mod-config asset editing improvements

Still worth adding:

- direct nested instanced-object editing for section/property graphs beyond key-level edits
- better support for mutating section/property object classes and metadata in one workflow
- safer “repair this config asset” flows for broken data-only `UModConfiguration` assets
- clearer inspection of section/property class paths and editor-facing widget classes
- config-tree issue summaries that explicitly flag:
  - plain SML base classes where widget classes are expected
  - missing or suspicious section/property metadata
  - broken class-load paths
  - likely UI-facing config issues before the mod is run

Why it matters:

- SML config assets are one of the places where MCP should remove runtime workaround code, not force more of it
- data-only config assets need asset-level repair tooling, not just runtime normalization

### Config-asset workflow helpers

Still worth adding:

- one-call “repair config section classes” workflows
- one-call “normalize config IDs and widget section classes” workflows
- stronger diff-style config tree summaries before/after mutation
- better issue categorization for config/widget/class loadability reports
- one-call “self-check the live bridge can create the right widget-backed config classes” workflow

Why it matters:

- modders need config repair tools that feel as direct as Blueprint graph tooling

## Stability and Compatibility Work

### UE 5.7.x compatibility and crash hardening

Worth adding:

- harden `inspect` paths that are currently crash-prone on newer engine versions:
  - Blueprint inspection
  - mesh actor inspection
  - material function inspection
  - GAS-related inspection paths
- add explicit capability/version guards when an asset or action is not safe on the running engine build
- downgrade known crash paths to structured MCP errors where possible instead of editor crashes
- improve plugin/build compatibility handling for newer UE versions, especially 5.7.x
- add better validation around inputs that currently fail late or crash:
  - `control_editor` level-path handling
  - console command execution paths
  - tool calls that depend on missing editor state
- fix platform/path assumptions that still behave like Unix on Windows when resolving source/code paths

Why it matters:

- the public upstream issues currently show a cluster of open 5.7.x failures:
  - inspect Blueprint crashes
  - inspect mesh actor crashes
  - inspect material function crashes
  - GAS functions breaking on 5.7.3
  - plugin/module build failures after engine updates
  - invalid `levelPath` handling in `control_editor`
  - Windows path resolution bugs during source discovery
- even in a local fork, stability and engine-version resilience are higher priority than feature breadth when the editor can still be crashed by read-only inspection

### Tool stability quarantine and degraded-mode behavior

Worth adding:

- a way to mark specific actions as unstable on specific engine versions and automatically:
  - hide them
  - stub them
  - or downgrade them to warning-only mode
- a structured “tool stability” report that explains which tools are:
  - safe
  - degraded
  - disabled
  - version-blocked
- safer failure handling for tools that are known to destabilize the editor

Why it matters:

- upstream also has an open “Unstable Tools” issue, which suggests this is not just a single-action problem
- MCP should prefer explicit degraded behavior over letting agents discover instability by crashing the editor

### Connection and transport diagnostics

Worth adding:

- better diagnosis for `socket hang up` / handshake failures, especially in Docker or mixed host/container setups
- one-call transport self-check that reports:
  - HTTP reachability
  - WS reachability
  - Remote Control plugin state
  - Python/plugin prerequisites
  - likely port/config mismatches
- clearer remediation messages for common bridge connection failures

Why it matters:

- connection/handshake issues are one of the most common failure modes exposed in the public issue tracker
- transport failures currently block all higher-level tooling, so they deserve first-class diagnostics instead of generic connection errors

### Optional pluginless editor transport

Worth adding:

- an optional degraded-mode transport that can talk to the editor through Unreal Python Remote Execution
- use it for editor-only workflows where the full native bridge is:
  - unavailable
  - not installed
  - failing
  - behaving incorrectly
  - or too tedious to extend for a one-off/editor-automation task
- expose clear capability differences between:
  - native bridge mode
  - pluginless Python-remote mode
  - disconnected mode
- keep result shapes as consistent as possible across transports
- add explicit warnings when a request is being served through the weaker/pluginless path
- add transport-selection logic that can prefer Python fallback only for supported tool families instead of silently swapping the whole server onto a weaker path

Why it matters:

- `runreal/unreal-mcp` demonstrates that built-in Unreal Python Remote Execution can be enough to bootstrap useful editor workflows without shipping a custom UE plugin
- for this fork, that is not a reason to replace the native bridge, but it is a good reason to add a backup transport for setup, recovery, bridge breakage, and lighter editor-only use cases
- this would pair naturally with the controlled Python fallback layer already in the backlog

## Runtime Inspection Improvements

### Better runtime component state

Worth adding:

- original mesh versus replacement mesh reporting when remap/replacement data exists
- actual fallback/default-material detection from render state
- clearer reporting of overridden material slots on live components
- stronger editor-versus-PIE differentiation in all runtime inspection responses

### Richer viewport and renderer-state summaries

Worth adding:

- active view mode when queryable
- major renderer-relevant toggles or feature-state summaries
- more explicit warnings when current editor/world context prevents authoritative answers

## Mesh and Material Diagnostics

### Deeper static mesh render summaries

Worth adding:

- authoritative section counts per LOD from mesh/render structures
- stable slot-to-section mapping
- imported slot names versus effective slot names
- section-level mismatch warnings, not just slot-count warnings

### Deeper material summaries

Worth adding:

- graph-backed WPO/PDO/displacement detection
- material-function dependency summaries
- clearer shader-permutation and sampler-risk reporting
- stronger “why this material is risky” evidence in the response

### Better material-instance summaries

Worth adding:

- fuller static switch coverage
- fuller component-mask coverage
- cleaner inherited-versus-overridden parameter reporting
- better reporting of parent-chain influence on runtime behavior

### Stronger renderer pair analysis

Worth adding:

- better Nanite compatibility reporting
- better Lumen-path risk reporting
- more explicit compatibility evidence for mesh/material pairs
- stronger causality output for “this pair likely changes renderer path”

## Modding Workflow Helpers

### Asset diff summaries

Worth adding:

- compare source versus replacement assets across slots, sections, Nanite state, material domains, and major render traits

### Cooked/package parity checks

Worth adding:

- detect when assets look fine in editor form but are suspicious for cooking/packaging
- surface likely mount-root or shader/content packaging mismatches
- add checks for content-path-sensitive mods

### Better shader/debug artifact correlation

Worth adding:

- start from shader metadata and find likely owning materials/meshes
- cross-link shader artifact summaries with dependency slices
- make shader-related incident reports less inventory-like and more causal

### Stronger mod runtime validation

Worth adding:

- stable issue categories
- better grouping of class/widget/config loadability
- better correlation between logs, live objects, runtime component state, and suspect assets

### Better replacement-compatibility tooling

Worth adding:

- section-aware compatibility warnings
- domain/blend/render-path regression warnings
- suggested next-inspection steps when incompatibilities are found

## Dependency and Discovery Features

### Richer dependency slices

Worth adding:

- deeper traversal of mesh -> materials -> textures -> functions
- better grouping by dependency type
- optional mount-root filtering
- outputs shaped for debugging rather than generic dependency dumps

### Better mounted-root discovery

Worth adding:

- quick discovery helpers for mod/plugin content by mount root
- easier “show me suspicious assets under this mod” workflows
- MCP-friendly summaries for large plugin content trees

### Asset and content maintenance workflows

Worth adding:

- bulk asset-validation helpers for selected folders or mount roots
- redirector discovery and fix-up workflows exposed through MCP
- one-call summaries for:
  - missing references
  - invalid soft paths
  - suspicious uncooked-only assets
  - duplicated or orphaned content
- better content-browser style discovery for:
  - recently changed assets
  - assets with dependency fan-out
  - assets under a mod that are likely to affect runtime rendering

Why it matters:

- asset and content hygiene is one of the highest-leverage workflow improvements for modding teams
- it complements dependency slicing and mount-root discovery instead of duplicating them

## Documentation and UX Ideas

### Tool discovery and context reduction

Worth adding:

- show lightweight stub definitions for disabled tools instead of hiding them completely
- include activation guidance in those stubs, especially for `enable_tools`, `enable_category`, and category-based filtering
- preserve `list_changed` behavior when swapping stub definitions to full definitions
- add clearer MCP-visible explanations for why a tool is unavailable:
  - disabled by category
  - protected
  - engine-version blocked
  - plugin prerequisite missing
  - marked unstable

Why it matters:

- the upstream roadmap/issues include a stub-tools/context-reduction idea that still looks valuable for the local fork
- the local fork already has dynamic tool management, so improving discoverability is a reasonable next layer on top of that
- hiding disabled tools entirely reduces context size, but it also makes discoverability and self-recovery worse for agents and users

### External extension packs

Worth adding:

- a supported way to add custom MCP tool packs outside the core plugin/server codebase
- discovery/loading rules for project-local or plugin-local extensions
- guardrails so extension tools can declare:
  - required engine version
  - required plugins/modules
  - stability level
  - categories/capabilities
- docs and examples for shipping mod- or studio-specific tool extensions without forking the whole MCP

Why it matters:

- `kvick-games/UnrealMCP` explicitly calls out easier tool extension as a goal, and that is one of the few ideas from that repo that would materially improve this fork
- this fork is already broad enough that custom extension packs are more scalable than continuing to put every niche workflow into core

### Controlled Python fallback layer

Worth adding:

- a restricted Python bridge for editor-only workflows that are hard to reach cleanly from the current native bridge
- use Python explicitly as a backup option when native bridge handlers:
  - fail unexpectedly
  - lag behind needed editor APIs
  - are too tedious/expensive to expose natively for specialized workflows
- capability-scoped Python entrypoints rather than unrestricted arbitrary Python execution, for example:
  - asset-audit helpers
  - editor utility wrappers
  - content-browser queries
  - specialized reflection/introspection that is easier through the UE Python API
- optionally expose a “preferPythonFallback” mode for approved tool families where Python is known to be more practical than the current bridge path
- an allowlisted template/script model where MCP can invoke named Python workflows with validated arguments
- structured result/error serialization back into normal MCP response shapes
- explicit safety/stability controls:
  - editor-only
  - disabled by default unless configured
  - clear capability reporting
  - timeout/output limits
  - no raw console-style Python passthrough by default

Why it matters:

- `appleweed/UnrealMCPBridge` shows the practical value of Python access to the UE Editor API, especially for workflows that are awkward to expose one-by-one in C++
- for this fork, Python is most valuable as a backup and escape hatch for targeted gaps, not as the primary server architecture
- a controlled Python layer could unlock useful editor automation when the bridge is broken, incomplete, or too cumbersome to extend, without abandoning the fork’s current safety/stability posture

### Editor-side MCP control panel

Worth adding:

- a simple editor UI surface for MCP status and health:
  - bridge connected/disconnected
  - active transport/port info
  - version/build info
  - enabled/disabled categories
  - unstable/degraded tools
- quick actions for common diagnostics:
  - self-check
  - transport check
  - list active capabilities
  - open recent MCP logs

Why it matters:

- `kvick-games/UnrealMCP` includes editor UI integration, and this fork would benefit from a small operational UI even if the main control surface remains MCP-first
- it would help close the gap between source changes and confidence that the running editor actually picked them up

### Task-oriented inspect cookbook

Worth adding:

- “replacement mesh renders wrong”
- “material works in editor but not in runtime”
- “class/widget/config does not load”
- “I need to inspect a mounted-root asset quickly”

### Starter project and example workflows

Worth adding:

- a small reference Unreal project with the MCP plugin already configured
- sample assets/workflows that exercise the most important local-fork features:
  - mod-config repair
  - runtime inspection
  - renderer/debug investigation
  - asset validation
- example client configs and demo scripts for common MCP clients
- a reproducible smoke-test scenario that can be used to validate the bridge after larger changes

Why it matters:

- compared with `chongdashu/unreal-mcp`, this fork is much stronger on UE feature depth but weaker on “pick it up and prove it works quickly”
- a starter project would improve onboarding, bug reproduction, and regression verification

### Curated high-level workflow macros

Worth adding:

- a small set of opinionated higher-level workflows for common Unreal tasks that currently require many low-level MCP calls
- examples:
  - investigate render incident
  - repair mod config asset
  - validate replacement mesh/material pairing
  - run content sanity checks for a mount root
- keep these as thin orchestration layers over existing tools, not separate one-off product surfaces

Why it matters:

- `flopperam/unreal-engine-mcp` is strongest where it packages multi-step workflows into simpler top-level actions
- this fork should not copy the “build a castle” direction wholesale, but a few high-value workflow macros would improve usability a lot

### Structured documentation index

Worth adding:

- a clearer docs index by tool family and workflow
- short focused pages for major tool areas instead of relying mostly on the root README
- “when to use this tool vs that tool” guidance for overlapping capabilities
- setup docs for common client configurations and bridge connection modes

Why it matters:

- the comparison repo does a better job packaging docs around setup, sample project, and tool discovery even though the actual tool surface is much smaller
- this fork now has enough breadth that discoverability is becoming a real usability problem

### Response-shape improvements

Worth adding:

- more stable issue categories
- clearer evidence fields
- more consistent confidence fields
- more actionable warnings that suggest the next command to run

## Broader UE5 Game Dev Workflow Suggestions

### Blueprint/runtime loadability inspection packs

Worth adding:

- grouped checks for blueprint asset, generated class, CDO, and live object state
- one-call summaries for common load failures

### Render-incident entrypoint

Worth adding:

- make `get_mod_render_debug_report` the standard “first command” for render incidents
- structure it so it can fan out into mesh, material, runtime, dependency, and shader investigation

### Packaging-aware workflow helpers

Worth adding:

- checks that compare editor-usable assets with likely packaged runtime expectations
- warnings for common mount-root and cooked-content pitfalls

### Testing and quality automation

Worth adding:

- one-call C++ compile and automated-test execution from MCP
- editor automation smoke-test entrypoints for:
  - asset validation
  - mod-config repair verification
  - runtime inspection sanity checks
- structured parsing of build/test output into:
  - errors
  - warnings
  - likely root causes
  - suspect files/assets
- quality gates for local mod/plugin workflows, e.g. “prepackage sanity check”

Why it matters:

- compile/test automation is one of the most practical missing workflow layers for this fork
- it shortens the loop between asset/tool edits and proving that the editor/project still behaves correctly

### Utility and editor workflow helpers

Worth adding:

- more editor-utility style operations that reduce repetitive content work:
  - batch rename/move/categorize
  - validation runs on selected assets
  - cleanup/fix-up operations
  - simple content audit reports
- one-call “workspace health” summaries for the current mod/plugin
- higher-level wrappers around common multi-step editor operations so users do not need to orchestrate many low-level tool calls

Why it matters:

- “utility plugins” is too broad as a roadmap bucket, but the underlying idea is good when translated into concrete editor workflow helpers

### Environment and PCG inspection helpers

Worth adding:

- better read-only inspection for:
  - PCG graphs and generated outputs
  - landscape/layer/foliage relationships
  - world-partition/data-layer state
  - environment-system dependencies that affect rendering/gameplay
- validation helpers for generated or procedurally placed content
- summaries that connect environment/PCG content back to the assets and systems driving it

Why it matters:

- for UE5 projects, environment systems and procedural generation are common sources of hard-to-debug content issues
- these are more relevant to modding workflows than many of the plugin-specific roadmap buckets

### AI and NPC debugging helpers

Worth adding:

- read-only summaries for AI-related runtime state:
  - controller/behavior-tree linkage
  - blackboard state snapshots
  - perception configuration summaries
  - suspect state-tree / EQS wiring
- one-call “why is this NPC not behaving” style diagnostics
- better asset/runtime correlation for AI controllers, trees, blackboards, and spawned pawns

Why it matters:

- AI/NPC tooling is worth carrying when scoped to debugging and inspection rather than broad gameplay authoring
- it fits the MCP pattern of helping diagnose complex engine state without forcing manual editor spelunking

### Physics and destruction diagnostics

Worth adding:

- inspection helpers for:
  - collision setup
  - physics asset linkage
  - constraint summaries
  - destructible/fracture-related asset state
- runtime summaries for “why is this object not colliding / simulating / breaking”
- compatibility checks when replacement assets change collision or physics behavior

Why it matters:

- physics-related regressions are common in modded content swaps and are difficult to diagnose from asset properties alone

### Accessibility and UI verification helpers

Worth adding:

- widget/UI inspection focused on accessibility and usability checks:
  - missing labels
  - contrast/style risks where queryable
  - navigation/focus issues
  - localization-sensitive text risks
- better summaries for config/menu widgets that are intended to be user-facing

Why it matters:

- accessibility as a full standalone system is too broad, but targeted UI verification helpers are a good fit for MCP

## Suggested Priority

1. Settings / mod-config asset repair workflows.
2. Bridge-authoritative runtime inspection.
3. Deeper mesh/material/renderer causality diagnostics.
4. Asset diff and replacement-compatibility tooling.
5. Cooked/package parity and shader/debug correlation features.

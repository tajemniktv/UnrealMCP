# Unreal MCP Feature Backlog

## Settings / Mod Config Work First

### Remaining mod-config asset editing improvements

Still worth adding:

- direct nested instanced-object editing for section/property graphs beyond key-level edits
- better support for mutating section/property object classes and metadata in one workflow
- safer “repair this config asset” flows for broken data-only `UModConfiguration` assets
- clearer inspection of section/property class paths and editor-facing widget classes

Why it matters:

- SML config assets are one of the places where MCP should remove runtime workaround code, not force more of it
- data-only config assets need asset-level repair tooling, not just runtime normalization

### Config-asset workflow helpers

Still worth adding:

- one-call “repair config section classes” workflows
- one-call “normalize config IDs and widget section classes” workflows
- stronger diff-style config tree summaries before/after mutation
- better issue categorization for config/widget/class loadability reports

Why it matters:

- modders need config repair tools that feel as direct as Blueprint graph tooling

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

## Documentation and UX Ideas

### Task-oriented inspect cookbook

Worth adding:

- “replacement mesh renders wrong”
- “material works in editor but not in runtime”
- “class/widget/config does not load”
- “I need to inspect a mounted-root asset quickly”

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

## Suggested Priority

1. Settings / mod-config asset repair workflows.
2. Bridge-authoritative runtime inspection.
3. Deeper mesh/material/renderer causality diagnostics.
4. Asset diff and replacement-compatibility tooling.
5. Cooked/package parity and shader/debug correlation features.

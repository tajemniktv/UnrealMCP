# Unreal MCP Tool Catalog

This snapshot documents the public MCP surfaces that matter most for TajsGraph-style workflow automation. The runtime source of truth is `ue://tool-catalog`; this file is the checked-in companion snapshot.

## Blueprint surfaces

- `manage_blueprint`
  - broad Blueprint authoring and compile/save surface
  - also accepts graph actions
- `manage_blueprint_graph`
  - graph-focused alias tool
  - use for graph inspection and mutation without the broader Blueprint action set

Key graph read actions:

- `list_graphs`
- `get_graph_details`
- `get_nodes`
- `get_connections`
- `get_graph_topology`
- `find_nodes`
- `find_nodes_by_title_comment_class`
- `find_call_function_nodes`

Key graph mutation actions:

- `connect_pins`
- `disconnect_subgraph`
- `duplicate_subgraph`
- `collapse_to_subgraph`
- `expand_collapsed_node`
- `create_comment_group`
- `update_comment_group`

## Mod-config surface

- `manage_mod_config`
  - dedicated CRUD and migration surface for `ModConfiguration` assets
  - preferred over raw `inspect` calls for normal workflows

Key actions:

- `get_mod_config_schema`
- `list_mod_config_properties`
- `add_mod_config_property`
- `update_mod_config_property`
- `remove_mod_config_property`
- `move_mod_config_property`
- `repair_mod_config_tree`
- `diff_mod_config_tree`
- `backfill_mod_config_from_descriptor`

Compatibility note:

- legacy mod-config flows remain available under `inspect`

## Python surface

- `system_control`
  - `run_python_template`
  - `run_python_code`
  - `run_python_file`
  - `get_python_fallback_status`
  - `list_assets_by_mount_root`
  - `check_asset_loadability`
  - `audit_mod_config_asset`

Python is the supported escape hatch for editor automation, but Blueprint graph structure should still be read through the native graph actions rather than Python reflection.

For editor-only asset discovery, `manage_asset.search_assets` can opt into Python-backed discovery with `preferPythonFallback: true` when content-browser style queries are more practical than native bridge search.

## Discovery

- Runtime catalog: `ue://tool-catalog`
- Health/status: `ue://health`, `ue://automation-bridge`

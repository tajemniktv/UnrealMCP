const fs = require('fs');
const path = require('path');
const definitionsPath = path.join('src', 'tools', 'consolidated-tool-definitions.ts');
let defContent = fs.readFileSync(definitionsPath, 'utf8');

const regexEnum = /const blueprintGraphActionEnum = \[\n\s*'create_node', 'add_node', 'delete_node', 'connect_pins', 'break_pin_links', 'set_node_property', 'create_reroute_node',\n\s*'get_node_details', 'get_graph_details', 'get_pin_details', 'get_nodes', 'get_connections', 'get_graph_topology',\n\s*'list_node_types', 'list_graphs', 'set_pin_default_value',\n\s*'list_comment_groups', 'create_comment_group', 'update_comment_group',\n\s*'find_nodes', 'find_nodes_by_title_comment_class', 'find_call_function_nodes',\n\s*'disconnect_subgraph', 'disable_subgraph', 'duplicate_subgraph', 'collapse_to_subgraph', 'expand_collapsed_node',\n\s*'retarget_binding_cluster', 'replace_binding_cluster', 'create_config_binding_cluster', 'summarize_migration_stage', 'batch_graph_actions'\n\] as const;/g;

const newEnum = `const blueprintGraphActionEnum = [
  'create_node', 'add_node', 'delete_node', 'connect_pins', 'break_pin_links', 'set_node_property', 'create_reroute_node',
  'get_node_details', 'get_graph_details', 'get_pin_details', 'get_nodes', 'get_connections', 'get_graph_topology',
  'list_node_types', 'list_graphs', 'list_all_graphs', 'set_pin_default_value',
  'list_comment_groups', 'create_comment_group', 'update_comment_group',
  'find_nodes', 'find_nodes_by_title_comment_class', 'find_call_function_nodes',
  'disconnect_subgraph', 'disable_subgraph', 'duplicate_subgraph', 'collapse_to_subgraph', 'expand_collapsed_node',
  'retarget_binding_cluster', 'replace_binding_cluster', 'create_config_binding_cluster', 'bind_config_property_to_event', 'create_add_delegate', 'summarize_migration_stage', 'batch_graph_actions'
] as const;`;

defContent = defContent.replace(regexEnum, newEnum);
fs.writeFileSync(definitionsPath, defContent, 'utf8');
console.log("Tool definitions patched");

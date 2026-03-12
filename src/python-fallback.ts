import { config } from './config.js';

export const PYTHON_TEMPLATE_NAMES = [
  'list_selected_assets',
  'list_selected_actors',
  'list_assets_in_path',
  'list_assets_by_mount_root',
  'find_assets_by_class',
  'check_asset_loadability',
  'get_asset_details',
  'get_selected_asset_details',
  'find_actors_by_class',
  'get_actor_details',
  'get_editor_world',
  'run_editor_utility',
  'validate_selected_assets',
  'audit_assets_in_path',
  'audit_mod_config_asset',
  'mcp_blueprint'
] as const;

export type PythonTemplateName = typeof PYTHON_TEMPLATE_NAMES[number];

export function getPythonFallbackConfig() {
  return {
    enabled: config.MCP_PYTHON_FALLBACK_ENABLED,
    unsafeEnabled: config.MCP_PYTHON_FALLBACK_UNSAFE_ENABLED,
    timeoutMs: config.MCP_PYTHON_TEMPLATE_TIMEOUT_MS,
    templates: [...PYTHON_TEMPLATE_NAMES]
  };
}

export function isAllowedPythonTemplate(templateName: string): templateName is PythonTemplateName {
  return PYTHON_TEMPLATE_NAMES.includes(templateName as PythonTemplateName);
}

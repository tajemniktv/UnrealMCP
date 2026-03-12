import { cleanObject } from '../../utils/safe-json.js';
import { ITools } from '../../types/tool-interfaces.js';
import type { HandlerArgs, InspectArgs, ComponentInfo } from '../../types/handler-types.js';
import { executeAutomationRequest } from './common-handlers.js';
import { normalizeArgs, resolveObjectPath, extractString, extractOptionalString } from './argument-helper.js';
import { classifyMountRoot, deriveBlueprintVariants, findPluginDescriptorByName, findPluginDescriptorByRoot, findProjectContext, getMountRoot, listPluginDescriptors, listTargetFiles, summarizeDescriptor } from './modding-utils.js';
import { handleBlueprintGet } from './blueprint-handlers.js';

/** Response from introspection operations */
interface InspectResponse {
  success?: boolean;
  error?: string;
  message?: string;
  components?: ComponentInfo[];
  value?: unknown;
  objects?: unknown[];
  cdo?: unknown;
  [key: string]: unknown;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function materialEntriesToPaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      const record = toRecord(entry);
      return asString(record.path) ?? asString(record.objectPath) ?? asString(record.materialPath) ?? asString(record.name);
    })
    .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

function classifyIssueSeverity(message: string): 'warning' | 'error' {
  return /not found|missing|invalid|failed|mismatch/i.test(message) ? 'error' : 'warning';
}

function createIssue(category: string, message: string, evidence?: unknown): Record<string, unknown> {
  return cleanObject({
    category,
    severity: classifyIssueSeverity(message),
    message,
    evidence
  }) as Record<string, unknown>;
}

async function searchAssetsByMountRoot(
  tools: ITools,
  mountRoot: string,
  classNames?: string[],
  limit: number = 250
): Promise<Record<string, unknown>> {
  return await executeAutomationRequest(tools, 'asset_query', {
    packagePaths: [mountRoot],
    classNames,
    recursivePaths: true,
    recursiveClasses: true,
    limit,
    subAction: 'search_assets'
  }) as Record<string, unknown>;
}

function getAssetsFromSearchResponse(response: Record<string, unknown>): Array<Record<string, unknown>> {
  if (Array.isArray(response.assets)) return response.assets as Array<Record<string, unknown>>;
  if (response.result && typeof response.result === 'object' && Array.isArray((response.result as Record<string, unknown>).assets)) {
    return (response.result as Record<string, unknown>).assets as Array<Record<string, unknown>>;
  }
  return [];
}

type ConfigDescriptorEntry = Record<string, unknown> & {
  key?: string;
  kind?: string;
  propertyType?: string;
  value?: unknown;
  displayName?: unknown;
  tooltip?: unknown;
  requiresWorldReload?: unknown;
  hidden?: unknown;
};

function normalizeDescriptorEntries(entries: unknown): ConfigDescriptorEntry[] {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((entry): entry is ConfigDescriptorEntry => typeof entry === 'object' && entry !== null && !Array.isArray(entry))
    .map((entry) => entry);
}

function splitDescriptorKey(key: string): { section?: string; key: string } {
  const parts = key.split('.').filter((part) => part.trim().length > 0);
  if (parts.length <= 1) {
    return { key };
  }
  return {
    section: parts.slice(0, -1).join('/'),
    key: parts[parts.length - 1]
  };
}

type ModConfigTreeNode = Record<string, unknown> & {
  key?: string;
  kind?: string;
  path?: string;
  children?: ModConfigTreeNode[];
};

function flattenModConfigTree(node: unknown, parentPath: string = ''): Array<Record<string, unknown>> {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return [];
  const record = node as ModConfigTreeNode;
  const key = asString(record.key) ?? '';
  const path = asString(record.path) ?? [parentPath, key].filter(Boolean).join('/');
  const kind = asString(record.kind) ?? '';
  const entry = cleanObject({
    ...record,
    key,
    path,
    kind
  }) as Record<string, unknown>;
  const children = Array.isArray(record.children) ? record.children : [];
  return [entry, ...children.flatMap((child) => flattenModConfigTree(child, path))];
}

async function resolveWorkingModConfigObjectPath(args: HandlerArgs, tools: ITools): Promise<string | undefined> {
  const directObjectPath = await resolveObjectPath(args, tools);
  const explicitObjectPath = extractOptionalString(args as Record<string, unknown>, 'objectPath');
  const candidates = Array.from(new Set(
    [directObjectPath, explicitObjectPath].filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
  ));

  for (const candidate of candidates) {
    const res = await tryInspectAction(tools, 'get_mod_config_tree', { objectPath: candidate });
    if (res?.success !== false && res?.tree) {
      return candidate;
    }
  }

  const baseTarget = directObjectPath ?? explicitObjectPath;
  if (baseTarget) {
    const variants = deriveBlueprintVariants(baseTarget);
    const variantCandidates = Array.from(new Set([
      variants.assetObjectPath,
      variants.generatedClassPath,
      variants.cdoPath
    ].filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)));

    for (const candidate of variantCandidates) {
      const res = await tryInspectAction(tools, 'get_mod_config_tree', { objectPath: candidate });
      if (res?.success !== false && res?.tree) {
        return candidate;
      }
    }
  }

  return directObjectPath ?? explicitObjectPath;
}

function buildModConfigIssues(tree: unknown, descriptor: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const flattened = flattenModConfigTree(tree);
  const issues: Array<Record<string, unknown>> = [];
  const propertyNodes = flattened.filter((entry) => (asString(entry.kind)?.toLowerCase() ?? '') !== 'section');

  if (propertyNodes.length > 0 && descriptor.length === 0) {
    issues.push(createIssue('empty_descriptor_with_live_tree', 'Live mod-config tree contains properties but descriptor export is empty.', {
      propertyCount: propertyNodes.length
    }));
  }

  for (const entry of propertyNodes) {
    const key = asString(entry.path) ?? asString(entry.key) ?? 'unknown';
    const displayName = asString(entry.displayName);
    const tooltip = asString(entry.tooltip);
    const classPath = asString(entry.classPath) ?? asString(entry.sectionClassPath) ?? asString(entry.widgetClassPath);

    if (!displayName) {
      issues.push(createIssue('missing_display_name', `Config entry '${key}' is missing displayName.`, entry));
    }
    if (!tooltip) {
      issues.push(createIssue('missing_tooltip', `Config entry '${key}' is missing tooltip.`, entry));
    }
    if (classPath && !looksLikeMountedObjectPath(classPath)) {
      issues.push(createIssue('invalid_class_path', `Config entry '${key}' has a non-mounted class/widget path.`, entry));
    }
    if (classPath && /ConfigProperty/.test(classPath) && !/BP_/i.test(classPath)) {
      issues.push(createIssue('plain_base_class', `Config entry '${key}' appears to use a plain base config property class instead of a widget-backed BP class.`, entry));
    }
  }

  return issues;
}

function descriptorType(entry: ConfigDescriptorEntry): string | undefined {
  return asString(entry.propertyType) ?? asString(entry.kind);
}

function shouldRunConfigRepair(argsTyped: InspectArgs): boolean {
  const record = argsTyped as Record<string, unknown>;
  return Boolean(
    typeof argsTyped.plainOnly === 'boolean' ||
    typeof argsTyped.rewriteSections === 'boolean' ||
    typeof argsTyped.rewriteProperties === 'boolean' ||
    asString(record.classPath) ||
    asString(record.className) ||
    asString(record.sectionClassPath) ||
    (Array.isArray(argsTyped.sections) && argsTyped.sections.length > 0) ||
    (Array.isArray(argsTyped.properties) && argsTyped.properties.length > 0) ||
    (Array.isArray(argsTyped.sectionPrefixes) && argsTyped.sectionPrefixes.length > 0) ||
    (Array.isArray(argsTyped.propertyPrefixes) && argsTyped.propertyPrefixes.length > 0)
  );
}

/**
 * Action aliases for test compatibility
 * Maps test action names to handler action names
 */
const INSPECT_ACTION_ALIASES: Record<string, string> = {
  'get_actor_details': 'inspect_object',
  'get_material_details': 'inspect_object',
  'get_texture_details': 'inspect_object',
  'get_mesh_details': 'inspect_object',
  'get_blueprint_details': 'inspect_object',
  'get_level_details': 'inspect_object',
  'describe_class': 'inspect_class',
  'validate_mod_runtime': 'verify_mod_runtime',
  'get_project_settings': 'get_project_settings',
  'get_editor_settings': 'get_editor_settings',
  'get_performance_stats': 'get_performance_stats',
  'get_memory_stats': 'get_memory_stats',
  'get_scene_stats': 'get_scene_stats',
  'get_viewport_info': 'get_viewport_info',
  'get_selected_actors': 'get_selected_actors',
  'get_mount_points': 'get_mount_points',
  'get_mod_config_schema': 'get_mod_config_schema',
  'list_mod_config_properties': 'list_mod_config_properties',
  'add_mod_config_property': 'add_mod_config_property',
  'update_mod_config_property': 'update_mod_config_property',
  'remove_mod_config_property': 'remove_mod_config_property',
};

/**
 * Normalize inspect action names for test compatibility
 */
export function normalizeInspectAction(action: string): string {
  return INSPECT_ACTION_ALIASES[action] ?? action;
}

function looksLikeMountedObjectPath(value: string | undefined): boolean {
  if (!value) return false;
  return /^\/[A-Za-z_][A-Za-z0-9_]*(?:\/|$)/.test(value);
}

async function tryInspectAction(
  tools: ITools,
  action: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown> | undefined> {
  try {
    const response = await executeAutomationRequest(tools, 'inspect', {
      action,
      ...args
    }) as Record<string, unknown>;

    if (response && response.success !== false) {
      return cleanObject(response) as Record<string, unknown>;
    }
  } catch {
    // Fallback handled by caller.
  }

  return undefined;
}

async function buildFallbackComponentRenderState(args: InspectArgs, tools: ITools): Promise<Record<string, unknown>> {
  const componentObjectPath = await resolveComponentObjectPathFromArgs(args, tools);
  const inspection = await executeAutomationRequest(
    tools,
    'inspect',
    {
      action: 'inspect_object',
      objectPath: componentObjectPath,
      detailed: true
    },
    'Failed to inspect component'
  ) as InspectResponse;

  const currentMesh = await executeAutomationRequest(tools, 'inspect', {
    action: 'get_property',
    objectPath: componentObjectPath,
    propertyName: 'StaticMesh'
  }) as InspectResponse;
  const currentMaterials = await executeAutomationRequest(tools, 'inspect', {
    action: 'get_property',
    objectPath: componentObjectPath,
    propertyName: 'OverrideMaterials'
  }) as InspectResponse;
  const visibility = await executeAutomationRequest(tools, 'inspect', {
    action: 'get_property',
    objectPath: componentObjectPath,
    propertyName: 'bVisible'
  }) as InspectResponse;
  const mobility = await executeAutomationRequest(tools, 'inspect', {
    action: 'get_property',
    objectPath: componentObjectPath,
    propertyName: 'Mobility'
  }) as InspectResponse;

  return cleanObject({
    success: inspection.success !== false,
    componentPath: componentObjectPath,
    actorName: inspection.actorLabel ?? inspection.objectName,
    currentMesh: currentMesh.value,
    currentMaterials: currentMaterials.value,
    visible: visibility.value,
    mobility: mobility.value,
    requestedWorldType: args.worldType ?? 'auto',
    actualWorldType: 'unknown',
    warnings: ['Bridge-native runtime render-state inspection was unavailable; this response was composed from generic inspect calls.']
  });
}

async function buildFallbackActorRenderSummary(args: InspectArgs, tools: ITools): Promise<Record<string, unknown>> {
  const actorName = await resolveObjectPath(args, tools, { pathKeys: [], actorKeys: ['actorName', 'name', 'objectPath'] });
  if (!actorName) {
    throw new Error('Invalid actorName');
  }

  const componentsResponse = await executeAutomationRequest(
    tools,
    'inspect',
    {
      action: 'get_components',
      actorName,
      objectPath: actorName
    },
    'Failed to get components'
  ) as InspectResponse;

  const components = Array.isArray(componentsResponse.components) ? componentsResponse.components : [];
  const renderComponents = await Promise.all(
    components.map(async (component) => {
      return await buildFallbackComponentRenderState({
        ...args,
        actorName,
        componentName: component.name,
        componentPath: component.objectPath
      }, tools);
    })
  );

  return cleanObject({
    success: true,
    actorName,
    requestedWorldType: args.worldType ?? 'auto',
    actualWorldType: 'unknown',
    componentCount: components.length,
    renderComponentCount: renderComponents.length,
    components: renderComponents,
    warnings: ['Bridge-native actor render summary was unavailable; this response was composed from component inspection.']
  });
}

async function buildFallbackFindComponentsByAsset(args: InspectArgs, tools: ITools, selector: 'mesh' | 'material'): Promise<Record<string, unknown>> {
  const targetPath = selector === 'mesh'
    ? asString(args.meshPath) ?? asString(args.objectPath)
    : asString(args.materialPath) ?? asString(args.objectPath);

  if (!targetPath) {
    throw new Error(`${selector}Path is required`);
  }

  const objectsResponse = await executeAutomationRequest(tools, 'inspect', {
    action: 'list_objects'
  }) as InspectResponse;
  const objects = Array.isArray(objectsResponse.objects) ? objectsResponse.objects as Array<Record<string, unknown>> : [];
  const matches: Record<string, unknown>[] = [];

  for (const object of objects.slice(0, 100)) {
    const actorName = asString(object.name) ?? asString(object.path);
    if (!actorName) continue;
    const summary = await buildFallbackActorRenderSummary({ ...args, actorName }, tools);
    const components = Array.isArray(summary.components) ? summary.components as Array<Record<string, unknown>> : [];
    for (const component of components) {
      if (selector === 'mesh' && asString(component.currentMesh) === targetPath) {
        matches.push(component);
      }
      if (selector === 'material') {
        const materialPaths = materialEntriesToPaths(component.currentMaterials);
        if (materialPaths.includes(targetPath)) {
          matches.push(component);
        }
      }
    }
  }

  return cleanObject({
    success: true,
    targetPath,
    count: matches.length,
    components: matches,
    requestedWorldType: args.worldType ?? 'auto',
    actualWorldType: 'unknown',
    warnings: [`Bridge-native component search for ${selector} was unavailable; this response was composed by scanning listed actors.`]
  });
}

async function buildViewportRenderSummary(args: InspectArgs, tools: ITools): Promise<Record<string, unknown>> {
  const [viewport, world, scene, performance, memory] = await Promise.all([
    executeAutomationRequest(tools, 'inspect', { action: 'get_viewport_info', worldType: args.worldType ?? 'auto' }) as Promise<Record<string, unknown>>,
    executeAutomationRequest(tools, 'inspect', { action: 'get_world_settings', worldType: args.worldType ?? 'auto' }) as Promise<Record<string, unknown>>,
    executeAutomationRequest(tools, 'inspect', { action: 'get_scene_stats', worldType: args.worldType ?? 'auto' }) as Promise<Record<string, unknown>>,
    executeAutomationRequest(tools, 'inspect', { action: 'get_performance_stats', worldType: args.worldType ?? 'auto' }) as Promise<Record<string, unknown>>,
    executeAutomationRequest(tools, 'inspect', { action: 'get_memory_stats', worldType: args.worldType ?? 'auto' }) as Promise<Record<string, unknown>>
  ]);

  const warnings: string[] = [];
  if (viewport.hasActiveViewport === false) warnings.push('No active viewport was available for render-state inspection.');
  if (!asString(viewport.actualWorldType) || asString(viewport.actualWorldType) === 'unavailable') warnings.push('Viewport summary could not resolve an active world context.');

  return cleanObject({
    success: viewport.success !== false && world.success !== false,
    requestedWorldType: args.worldType ?? 'auto',
    actualWorldType: viewport.actualWorldType ?? world.actualWorldType,
    viewport,
    world,
    scene,
    performance,
    memory,
    warnings
  });
}

async function inspectMeshRenderTraits(meshPath: string, tools: ITools): Promise<Record<string, unknown>> {
  const inspection = await executeAutomationRequest(tools, 'inspect', {
    action: 'inspect_object',
    objectPath: meshPath,
    detailed: true
  }) as InspectResponse;
  const staticMaterials = await executeAutomationRequest(tools, 'inspect', {
    action: 'get_property',
    objectPath: meshPath,
    propertyName: 'StaticMaterials'
  }) as InspectResponse;
  const naniteSettings = await executeAutomationRequest(tools, 'inspect', {
    action: 'get_property',
    objectPath: meshPath,
    propertyName: 'NaniteSettings'
  }) as InspectResponse;

  const slots = Array.isArray(staticMaterials.value) ? staticMaterials.value : [];
  return cleanObject({
    success: inspection.success !== false,
    meshPath,
    className: inspection.className,
    slotCount: slots.length,
    materialSlots: slots,
    naniteSettings: naniteSettings.value
  });
}

async function resolveComponentObjectPathFromArgs(args: HandlerArgs, tools: ITools): Promise<string> {
  const argsTyped = args as InspectArgs;
  const componentName = typeof argsTyped.componentName === 'string' ? argsTyped.componentName.trim() : '';
  const componentPath = typeof (argsTyped as Record<string, unknown>).componentPath === 'string' 
    ? ((argsTyped as Record<string, unknown>).componentPath as string).trim() 
    : '';

  // Direct path provided
  const direct = componentPath || (
    (componentName.includes(':') || componentName.includes('.')) &&
      (componentName.startsWith('/Game') || componentName.startsWith('/Script') || componentName.startsWith('/Engine'))
      ? componentName
      : ''
  );
  if (direct) return direct;

  // Check if objectPath itself is a component path (e.g., "ActorName.ComponentName")
  const rawObjectPath = typeof argsTyped.objectPath === 'string' ? argsTyped.objectPath.trim() : '';
  const objectPathLooksLikeComponent = rawObjectPath && 
    !rawObjectPath.includes('/') && 
    !rawObjectPath.includes('\\') &&
    rawObjectPath.includes('.') &&
    rawObjectPath.split('.').length === 2;

  // Extract actor name from either explicit actorName or from objectPath if it looks like component path
  let actorName: string | undefined;
  let effectiveComponentName = componentName;

  if (objectPathLooksLikeComponent && !componentName) {
    // objectPath is "ActorName.ComponentName" format
    const parts = rawObjectPath.split('.');
    actorName = parts[0];
    effectiveComponentName = parts[1];
  } else {
    actorName = await resolveObjectPath(args, tools, { pathKeys: [], actorKeys: ['actorName', 'name', 'objectPath'] });
  }

  if (!actorName) {
    throw new Error('Invalid actorName: required to resolve componentName');
  }

  // If no component name was provided or extracted, just return the actor path
  if (!effectiveComponentName) {
    return actorName;
  }

  // Use inspect:get_components to find the exact component path
  const compsRes = await executeAutomationRequest(
    tools,
    'inspect',
    {
      action: 'get_components',
      actorName: actorName,
      objectPath: actorName
    },
    'Failed to get components'
  ) as InspectResponse;

  let components: ComponentInfo[] = [];
  if (compsRes.success) {
    components = Array.isArray(compsRes?.components) ? compsRes.components : [];
  }

  const needle = effectiveComponentName.toLowerCase();

  if (components.length > 0) {
    // 1. Exact Name/Path Match
    let match = components.find((c) => String(c?.name || '').toLowerCase() === needle)
      ?? components.find((c) => String(c?.objectPath || '').toLowerCase() === needle)
      ?? components.find((c) => String(c?.objectPath || '').toLowerCase().endsWith(`:${needle}`))
      ?? components.find((c) => String(c?.objectPath || '').toLowerCase().endsWith(`.${needle}`));

    // 2. Fuzzy/StartsWith Match (e.g. "StaticMeshComponent" -> "StaticMeshComponent0")
    if (!match) {
      match = components.find((c) => String(c?.name || '').toLowerCase().startsWith(needle));
    }

    // RESOLUTION LOGIC FIX:
    // If we have a match, we MUST use its path OR its name.
    // We cannot fall back to 'needle' or 'args.componentName' if we found a better specific match.
    if (match) {
      if (typeof match.objectPath === 'string' && match.objectPath.trim().length > 0) {
        return match.objectPath.trim();
      }
      if (typeof match.name === 'string' && match.name.trim().length > 0) {
        // Construct path from the MATCHED name, not the requested name
        return `${actorName}.${match.name}`;
      }
    }
  }

  // Fallback: Construct path manually using original request
  // Use dot notation for subobjects
  return `${actorName}.${effectiveComponentName}`;
}


export async function handleInspectTools(action: string, args: HandlerArgs, tools: ITools): Promise<Record<string, unknown>> {
  const argsTyped = args as InspectArgs;
  
  // Normalize action name for test compatibility
  const normalizedAction = normalizeInspectAction(action);
  
  // Also normalize parameter names for test compatibility
  const normalizedArgs = {
    ...args,
    // Map snake_case to camelCase
    actorName: args.actor_name ?? args.actorName ?? args.name,
    objectPath: args.object_path ?? args.objectPath ?? args.path,
    componentName: args.component_name ?? args.componentName,
    propertyName: args.property_name ?? args.propertyName,
  };
  
  switch (normalizedAction) {
    case 'inspect_object': {
      // Check if this is a component path (dot notation like "Actor.Component")
      // Must NOT be a file path (contains slashes or backslashes)
      // and componentName must be provided OR objectPath looks like "ActorName.ComponentName"
      const rawObjectPath = normalizedArgs.objectPath as string | undefined;
      const hasComponentName = typeof normalizedArgs.componentName === 'string' && 
        normalizedArgs.componentName.trim().length > 0;
      
      // Only treat as component path if:
      // 1. componentName is explicitly provided, OR
      // 2. objectPath looks like "ActorName.ComponentName" (no slashes, has exactly one dot with content on both sides)
      const looksLikeComponentPath = rawObjectPath && 
        !rawObjectPath.includes('/') && 
        !rawObjectPath.includes('\\') &&
        rawObjectPath.includes('.') &&
        rawObjectPath.split('.').length === 2 &&
        rawObjectPath.split('.')[0].length > 0 &&
        rawObjectPath.split('.')[1].length > 0;
      
      let objectPath: string;
      
      if (hasComponentName || looksLikeComponentPath) {
        // Use component resolution for dot notation paths
        // This handles "Actor.Component" syntax by finding the actual component path
        objectPath = await resolveComponentObjectPathFromArgs(normalizedArgs, tools);
      } else {
        // Standard object path resolution for actors, assets, etc.
        objectPath = await resolveObjectPath(normalizedArgs, tools) ?? '';
      }
      
      if (!objectPath) {
        throw new Error('Invalid objectPath: must be a non-empty string');
      }

      const payload = {
        ...args,
        objectPath,
        action: 'inspect_object',
        detailed: true
      };

      const res = await executeAutomationRequest(
        tools,
        'inspect',
        payload,
        'Automation bridge not available for inspect operations'
      ) as InspectResponse;

      if (res && res.success === false) {
        const errorCode = String(res.error || '').toUpperCase();
        const msg = String(res.message || '');
        if (errorCode === 'OBJECT_NOT_FOUND' || msg.toLowerCase().includes('object not found')) {
          return cleanObject({
            success: false,
            handled: true,
            notFound: true,
            error: res.error,
            message: res.message || 'Object not found'
          });
        }
      }

      return cleanObject(res);
    }
    case 'get_property': {
      const objectPath = await resolveObjectPath(args, tools);
      const params = normalizeArgs(args, [{ key: 'propertyName', aliases: ['propertyPath'], required: true }]);
      const propertyName = extractString(params, 'propertyName');

      if (!objectPath) {
        throw new Error('Invalid objectPath: must be a non-empty string');
      }

      const res = await executeAutomationRequest(tools, 'inspect', {
        action: 'get_property',
        objectPath,
        propertyName
      }) as InspectResponse;

      // Smart Lookup: If property not found on the Actor, try to find it on components
      if (!res.success && !looksLikeMountedObjectPath(objectPath) && (res.error === 'PROPERTY_NOT_FOUND' || String(res.error).includes('not found'))) {
        const actorName = await resolveObjectPath(args, tools, { pathKeys: [], actorKeys: ['actorName', 'name', 'objectPath'] });
        if (actorName) {
          const triedPaths: string[] = [];

          // Strategy 1: Check RootComponent (Most common for transform/mobility)
          try {
            const rootRes = await executeAutomationRequest(tools, 'inspect', {
              action: 'get_property',
              objectPath: actorName,
              propertyName: 'RootComponent'
            }) as InspectResponse;

            // Check if we got a valid object path string or object with path
            const rootValue = rootRes.value as Record<string, unknown> | string | undefined;
            const rootPath = typeof rootValue === 'string' 
              ? rootValue 
              : (typeof rootValue === 'object' && rootValue ? (rootValue.path || rootValue.objectPath) as string : undefined);

            if (rootRes.success && rootPath && typeof rootPath === 'string' && rootPath.length > 0 && rootPath !== 'None') {
              triedPaths.push(rootPath);
              const propRes = await executeAutomationRequest(tools, 'inspect', {
                action: 'get_property',
                objectPath: rootPath,
                propertyName
              }) as InspectResponse;
              if (propRes.success) {
                return cleanObject({
                  ...propRes,
                  message: `Resolved property '${propertyName}' on RootComponent (Smart Lookup)`,
                  foundOnComponent: 'RootComponent'
                });
              }
            }
          } catch (_e) { /* Ignore RootComponent lookup errors */ }

          try {
            // Strategy 2: Iterate all components
            // Use ActorTools directly with the input/original name (args.objectPath)
            const shortName = String(argsTyped.objectPath || '').trim();
            const compsRes = await executeAutomationRequest(tools, 'inspect', {
              action: 'get_components',
              actorName: shortName,
              objectPath: shortName
            }) as InspectResponse;

            if (compsRes.success && (Array.isArray(compsRes.components) || Array.isArray(compsRes))) {
              const list: ComponentInfo[] = Array.isArray(compsRes.components) 
                ? compsRes.components 
                : (Array.isArray(compsRes) ? compsRes as unknown as ComponentInfo[] : []);
              const triedPathsInner: string[] = [];
              for (const comp of list) {
                // Use path if available, otherwise construct it (ActorPath.ComponentName)
                // Note: C++ Inspect handler might miss 'path', so we fallback.
                const compName = comp.name;
                const compPath = comp.objectPath || (compName ? `${actorName}.${compName}` : undefined);

                if (!compPath) continue;
                triedPathsInner.push(compPath);

                // Quick check: Try to get property on component
                const compRes = await executeAutomationRequest(tools, 'inspect', {
                  action: 'get_property',
                  objectPath: compPath,
                  propertyName
                }) as InspectResponse;

                if (compRes.success) {
                  return cleanObject({
                    ...compRes,
                    message: `Resolved property '${propertyName}' on component '${comp.name}' (Smart Lookup)`,
                    foundOnComponent: comp.name
                  });
                }
              }
              // End of loop - if we're here, nothing found
              return cleanObject({
                ...res,
                message: (res.message as string) + ` (Smart Lookup failed. Tried: ${triedPathsInner.length} paths. First: ${triedPathsInner[0]}. Components: ${list.map((c) => c.name).join(',')})`,
                smartLookupTriedPaths: triedPathsInner
              });
            } else {
              return cleanObject({
                ...res,
                message: (res.message as string) + ' (Smart Lookup failed: get_components returned ' + (compsRes.success ? 'success but no list' : 'failure: ' + compsRes.error) + ' | Name: ' + shortName + ' Path: ' + actorName + ')',
                smartLookupGetComponentsError: compsRes
              });
            }
          } catch (_e: unknown) {
            const errorMsg = _e instanceof Error ? _e.message : String(_e);
            return cleanObject({
              ...res,
              message: (res.message as string) + ' (Smart Lookup exception: ' + errorMsg + ')',
              error: res.error
            });
          }
        }
      }
      return cleanObject(res);
    }
    case 'set_property': {
      const objectPath = await resolveObjectPath(args, tools);
      const params = normalizeArgs(args, [
        { key: 'propertyName', aliases: ['propertyPath'], required: true },
        { key: 'value' }
      ]);
      const propertyName = extractString(params, 'propertyName');
      const value = params.value;

      if (!objectPath) {
        throw new Error('Invalid objectPath: must be a non-empty string');
      }

      const res = await executeAutomationRequest(tools, 'inspect', {
        action: 'set_property',
        objectPath,
        propertyName,
        value
      }) as InspectResponse;

      if (res && res.success === false) {
        const errorCode = String(res.error || '').toUpperCase();
        if (errorCode === 'PROPERTY_NOT_FOUND') {
          return cleanObject({
            ...res,
            error: 'UNKNOWN_PROPERTY'
          });
        }
      }

      return cleanObject(res);
    }
    case 'upsert_mod_config_property': {
      const objectPath = await resolveWorkingModConfigObjectPath(args, tools);
      const params = normalizeArgs(args, [
        { key: 'key', required: true },
        { key: 'propertyType', required: true },
        { key: 'section' },
        { key: 'displayName' },
        { key: 'tooltip' },
        { key: 'value' }
      ]);

      if (!objectPath) {
        throw new Error('Invalid objectPath: must be a non-empty string');
      }

      const key = extractString(params, 'key');
      const propertyType = extractString(params, 'propertyType');
      const section = extractOptionalString(params, 'section');
      const displayName = extractOptionalString(params, 'displayName');
      const tooltip = extractOptionalString(params, 'tooltip');
      const requiresWorldReload =
        typeof argsTyped.requiresWorldReload === 'boolean' ? argsTyped.requiresWorldReload : undefined;
      const hidden = typeof argsTyped.hidden === 'boolean' ? argsTyped.hidden : undefined;

      const res = await executeAutomationRequest(tools, 'inspect', {
        action: 'upsert_mod_config_property',
        objectPath,
        key,
        propertyType,
        section,
        displayName,
        tooltip,
        requiresWorldReload,
        hidden,
        value: params.value
      }) as InspectResponse;

      return cleanObject(res);
    }
    case 'add_mod_config_property':
    case 'update_mod_config_property': {
      return await handleInspectTools('upsert_mod_config_property', args, tools);
    }
    case 'ensure_mod_config_section':
    case 'delete_mod_config_property':
    case 'delete_mod_config_section': {
      const objectPath = await resolveWorkingModConfigObjectPath(args, tools);
      if (!objectPath) {
        throw new Error('Invalid objectPath: must be a non-empty string');
      }

      const params = normalizeArgs(args, [
        { key: 'section' },
        { key: 'key' }
      ]);

      const res = await executeAutomationRequest(tools, 'inspect', {
        action: normalizedAction,
        objectPath,
        section: extractOptionalString(params, 'section'),
        key: extractOptionalString(params, 'key')
      }) as InspectResponse;

      return cleanObject(res);
    }
    case 'remove_mod_config_property': {
      return await handleInspectTools('delete_mod_config_property', args, tools);
    }
    case 'rename_mod_config_property':
    case 'move_mod_config_property': {
      const objectPath = await resolveWorkingModConfigObjectPath(args, tools);
      if (!objectPath) {
        throw new Error('Invalid objectPath: must be a non-empty string');
      }

      const params = normalizeArgs(args, [
        { key: 'section' },
        { key: 'key', required: true },
        { key: 'newKey', required: true },
        { key: 'targetSection' }
      ]);

      const res = await executeAutomationRequest(tools, 'inspect', {
        action: normalizedAction,
        objectPath,
        section: extractOptionalString(params, 'section'),
        key: extractString(params, 'key'),
        newKey: extractString(params, 'newKey'),
        targetSection: extractOptionalString(params, 'targetSection')
      }) as InspectResponse;

      return cleanObject(res);
    }
    case 'rename_mod_config_section': {
      const objectPath = await resolveWorkingModConfigObjectPath(args, tools);
      if (!objectPath) {
        throw new Error('Invalid objectPath: must be a non-empty string');
      }

      const params = normalizeArgs(args, [
        { key: 'section', required: true },
        { key: 'newSection', required: true },
        { key: 'targetSection' }
      ]);

      const res = await executeAutomationRequest(tools, 'inspect', {
        action: normalizedAction,
        objectPath,
        section: extractString(params, 'section'),
        newSection: extractString(params, 'newSection'),
        targetSection: extractOptionalString(params, 'targetSection')
      }) as InspectResponse;

      return cleanObject(res);
    }
    case 'get_mod_config_tree': {
      const objectPath = await resolveWorkingModConfigObjectPath(args, tools);
      if (!objectPath) {
        throw new Error('Invalid objectPath: must be a non-empty string');
      }

      const res = await executeAutomationRequest(tools, 'inspect', {
        action: 'get_mod_config_tree',
        objectPath
      }) as InspectResponse;

      return cleanObject(res);
    }
    case 'get_mod_config_schema':
    case 'list_mod_config_properties': {
      const treeRes = await handleInspectTools('get_mod_config_tree', args, tools);
      const treeRecord = treeRes as Record<string, unknown>;
      const tree = treeRecord.tree;
      const flattened = flattenModConfigTree(tree);
      const propertyEntries = flattened.filter((entry) => {
        const kind = asString(entry.kind)?.toLowerCase() ?? '';
        return kind.length > 0 && kind !== 'section';
      });
      const descriptorRes = await handleInspectTools('get_mod_config_descriptor', args, tools);
      const descriptor = Array.isArray((descriptorRes as Record<string, unknown>).descriptor)
        ? (descriptorRes as Record<string, unknown>).descriptor as Array<Record<string, unknown>>
        : [];
      const issues = buildModConfigIssues(tree, descriptor);
      if (normalizedAction === 'get_mod_config_schema') {
        return cleanObject({
          success: treeRecord.success !== false,
          objectPath: asString((args as Record<string, unknown>).objectPath),
          tree,
          propertyCount: propertyEntries.length,
          sectionCount: flattened.filter((entry) => (asString(entry.kind)?.toLowerCase() ?? '') === 'section').length,
          properties: propertyEntries,
          descriptorCount: descriptor.length,
          issues
        });
      }
      return cleanObject({
        success: treeRecord.success !== false,
        objectPath: asString((args as Record<string, unknown>).objectPath),
        properties: propertyEntries,
        count: propertyEntries.length,
        issues
      });
    }
    case 'set_mod_config_root_class': {
      const objectPath = await resolveWorkingModConfigObjectPath(args, tools);
      if (!objectPath) {
        throw new Error('Invalid objectPath: must be a non-empty string');
      }

      const params = normalizeArgs(args, [
        { key: 'classPath', aliases: ['className', 'sectionClassPath'], required: true }
      ]);

      return cleanObject(await executeAutomationRequest(tools, 'inspect', {
        action: 'set_mod_config_root_class',
        objectPath,
        classPath: extractString(params, 'classPath')
      }) as Record<string, unknown>);
    }
    case 'replace_mod_config_section_class': {
      const objectPath = await resolveWorkingModConfigObjectPath(args, tools);
      if (!objectPath) {
        throw new Error('Invalid objectPath: must be a non-empty string');
      }

      const params = normalizeArgs(args, [
        { key: 'section', required: true },
        { key: 'classPath', aliases: ['className', 'sectionClassPath'], required: true }
      ]);

      return cleanObject(await executeAutomationRequest(tools, 'inspect', {
        action: 'replace_mod_config_section_class',
        objectPath,
        section: extractString(params, 'section'),
        classPath: extractString(params, 'classPath')
      }) as Record<string, unknown>);
    }
    case 'repair_mod_config_widget_classes':
    case 'repair_mod_config_tree':
    case 'diff_mod_config_tree': {
      const objectPath = await resolveWorkingModConfigObjectPath(args, tools);
      if (!objectPath) {
        throw new Error('Invalid objectPath: must be a non-empty string');
      }

      const payload: Record<string, unknown> = {
        action: action === 'repair_mod_config_tree'
          ? 'repair_mod_config_tree'
          : action === 'diff_mod_config_tree'
            ? 'diff_mod_config_tree'
            : 'repair_mod_config_widget_classes',
        objectPath
      };

      const sectionClassPath =
        asString((argsTyped as Record<string, unknown>).classPath)
        ?? asString((argsTyped as Record<string, unknown>).className)
        ?? asString((argsTyped as Record<string, unknown>).sectionClassPath);
      if (sectionClassPath) {
        payload.classPath = sectionClassPath;
      }

      const sections = Array.isArray((argsTyped as Record<string, unknown>).sections)
        ? ((argsTyped as Record<string, unknown>).sections as unknown[]).filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        : [];
      if (sections.length > 0) {
        payload.sections = sections;
      }

      const properties = Array.isArray((argsTyped as Record<string, unknown>).properties)
        ? ((argsTyped as Record<string, unknown>).properties as unknown[]).filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        : [];
      if (properties.length > 0) {
        payload.properties = properties;
      }

      const sectionPrefixes = Array.isArray((argsTyped as Record<string, unknown>).sectionPrefixes)
        ? ((argsTyped as Record<string, unknown>).sectionPrefixes as unknown[]).filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        : [];
      if (sectionPrefixes.length > 0) {
        payload.sectionPrefixes = sectionPrefixes;
      }

      const propertyPrefixes = Array.isArray((argsTyped as Record<string, unknown>).propertyPrefixes)
        ? ((argsTyped as Record<string, unknown>).propertyPrefixes as unknown[]).filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        : [];
      if (propertyPrefixes.length > 0) {
        payload.propertyPrefixes = propertyPrefixes;
      }

      if (action === 'diff_mod_config_tree') {
        payload.dryRun = true;
      } else if (typeof argsTyped.dryRun === 'boolean') {
        payload.dryRun = argsTyped.dryRun;
      }
      if (typeof (argsTyped as Record<string, unknown>).plainOnly === 'boolean') {
        payload.plainOnly = (argsTyped as Record<string, unknown>).plainOnly;
      }
      if (typeof (argsTyped as Record<string, unknown>).rewriteSections === 'boolean') {
        payload.rewriteSections = (argsTyped as Record<string, unknown>).rewriteSections;
      }
      if (typeof (argsTyped as Record<string, unknown>).rewriteProperties === 'boolean') {
        payload.rewriteProperties = (argsTyped as Record<string, unknown>).rewriteProperties;
      }

      return cleanObject(await executeAutomationRequest(tools, 'inspect', payload) as Record<string, unknown>);
    }
    case 'check_live_bridge_capabilities': {
      const payload: Record<string, unknown> = {
        action: 'check_live_bridge_capabilities'
      };
      const objectPath = await resolveObjectPath(args, tools);
      if (objectPath) {
        payload.objectPath = objectPath;
      }
      return cleanObject(await executeAutomationRequest(tools, 'inspect', payload) as Record<string, unknown>);
    }
    case 'save_mod_config': {
      const objectPath = await resolveWorkingModConfigObjectPath(args, tools);
      if (!objectPath) {
        throw new Error('Invalid objectPath: must be a non-empty string');
      }

      return cleanObject(await executeAutomationRequest(tools, 'inspect', {
        action: 'save_mod_config',
        objectPath
      }) as Record<string, unknown>);
    }
    case 'resolve_mod_config_target':
    case 'resolve_blueprint_variants': {
      const objectPath = await resolveObjectPath(args, tools);
      const targetPath = objectPath
        || extractOptionalString(normalizeArgs(args, [{ key: 'objectPath' }, { key: 'classPath' }]), 'objectPath');
      if (!targetPath) {
        throw new Error('objectPath or classPath is required');
      }

      const variants = deriveBlueprintVariants(targetPath);
      return cleanObject({
        success: true,
        ...variants,
        mountRoot: getMountRoot(String(variants.assetObjectPath)),
        classification: classifyMountRoot(getMountRoot(String(variants.assetObjectPath)))
      });
    }
    case 'get_mod_config_descriptor': {
      const treeRes = await handleInspectTools('get_mod_config_tree', args, tools);
      const tree = (treeRes as Record<string, unknown>).tree as Record<string, unknown> | undefined;
      const descriptor: Array<Record<string, unknown>> = [];

      const walk = (node: Record<string, unknown> | undefined, currentPath: string[] = []) => {
        if (!node) return;
        const key = typeof node.key === 'string' ? node.key : '';
        const kind = typeof node.kind === 'string' ? node.kind : '';
        const nextPath = key && key !== 'RootSection' ? [...currentPath, key] : currentPath;
        if (kind && kind !== 'section' && nextPath.length > 0) {
          descriptor.push({
            key: nextPath.join('.'),
            kind,
            value: node.value,
            displayName: node.displayName,
            tooltip: node.tooltip,
            requiresWorldReload: node.requiresWorldReload,
            hidden: node.hidden,
            path: node.path
          });
        }
        const children = Array.isArray(node.children) ? node.children as Array<Record<string, unknown>> : [];
        for (const child of children) {
          walk(child, nextPath);
        }
      };

      walk(tree);
      return cleanObject({
        ...treeRes,
        descriptor,
        count: descriptor.length
      });
    }
    case 'validate_mod_config': {
      const descriptorRes = await handleInspectTools('get_mod_config_descriptor', args, tools);
      const descriptor = Array.isArray((descriptorRes as Record<string, unknown>).descriptor)
        ? (descriptorRes as Record<string, unknown>).descriptor as Array<Record<string, unknown>>
        : [];
      const tree = (descriptorRes as Record<string, unknown>).tree;
      const issues = descriptor.flatMap((entry) => {
        const key = typeof entry.key === 'string' ? entry.key : '';
        const results: Array<Record<string, unknown>> = [];
        if (!/^[A-Za-z0-9_.]+$/.test(key)) {
          results.push({ severity: 'error', key, message: 'Invalid config key format' });
        }
        if (entry.kind === 'string' && typeof entry.value !== 'string') {
          results.push({ severity: 'warning', key, message: 'String property has non-string value shape' });
        }
        return results;
      });
      issues.push(...buildModConfigIssues(tree, descriptor));
      return cleanObject({
        success: true,
        valid: issues.filter((issue) => issue.severity === 'error').length === 0,
        descriptorCount: descriptor.length,
        issues
      });
    }
    case 'diff_mod_config_expected_descriptor': {
      const expectedDescriptor = normalizeDescriptorEntries((argsTyped as Record<string, unknown>).descriptorEntries);
      if (expectedDescriptor.length === 0) {
        return cleanObject({
          success: false,
          error: 'INVALID_DESCRIPTOR',
          message: 'diff_mod_config_expected_descriptor requires a non-empty descriptorEntries array.'
        });
      }

      const liveDescriptorRes = await handleInspectTools('get_mod_config_descriptor', args, tools);
      const liveDescriptor = normalizeDescriptorEntries((liveDescriptorRes as Record<string, unknown>).descriptor);
      const liveByKey = new Map(liveDescriptor.map((entry) => [String(entry.key ?? ''), entry]));
      const expectedByKey = new Map(expectedDescriptor.map((entry) => [String(entry.key ?? ''), entry]));

      const missing: ConfigDescriptorEntry[] = [];
      const mismatched: Array<Record<string, unknown>> = [];
      const extra: ConfigDescriptorEntry[] = [];

      for (const expected of expectedDescriptor) {
        const key = String(expected.key ?? '');
        if (!key) continue;
        const live = liveByKey.get(key);
        if (!live) {
          missing.push(expected);
          continue;
        }

        const differences: Record<string, unknown> = {};
        if (descriptorType(expected) !== descriptorType(live)) differences.kind = { expected: descriptorType(expected), actual: descriptorType(live) };
        if (expected.displayName !== live.displayName) differences.displayName = { expected: expected.displayName, actual: live.displayName };
        if (expected.tooltip !== live.tooltip) differences.tooltip = { expected: expected.tooltip, actual: live.tooltip };
        if (expected.requiresWorldReload !== live.requiresWorldReload) differences.requiresWorldReload = { expected: expected.requiresWorldReload, actual: live.requiresWorldReload };
        if (expected.hidden !== live.hidden) differences.hidden = { expected: expected.hidden, actual: live.hidden };
        if (JSON.stringify(expected.value) !== JSON.stringify(live.value)) differences.value = { expected: expected.value, actual: live.value };

        if (Object.keys(differences).length > 0) {
          mismatched.push({
            key,
            expected,
            actual: live,
            differences
          });
        }
      }

      for (const live of liveDescriptor) {
        const key = String(live.key ?? '');
        if (!key) continue;
        if (!expectedByKey.has(key)) {
          extra.push(live);
        }
      }

      return cleanObject({
        success: true,
        liveDescriptorCount: liveDescriptor.length,
        expectedDescriptorCount: expectedDescriptor.length,
        missing,
        mismatched,
        extra,
        missingCount: missing.length,
        mismatchedCount: mismatched.length,
        extraCount: extra.length,
        matches: missing.length === 0 && mismatched.length === 0,
        liveDescriptor: liveDescriptorRes
      });
    }
    case 'backfill_mod_config_from_descriptor': {
      const diff = await handleInspectTools('diff_mod_config_expected_descriptor', args, tools);
      if (diff.success === false) {
        return cleanObject(diff);
      }

      const objectPath = await resolveWorkingModConfigObjectPath(args, tools);
      if (!objectPath) {
        throw new Error('Invalid objectPath: must be a non-empty string');
      }

      const missing = normalizeDescriptorEntries((diff as Record<string, unknown>).missing);
      const mismatched = Array.isArray((diff as Record<string, unknown>).mismatched)
        ? ((diff as Record<string, unknown>).mismatched as Array<Record<string, unknown>>)
        : [];
      const rewriteProperties = typeof argsTyped.rewriteProperties === 'boolean' ? argsTyped.rewriteProperties : false;
      const dryRun = argsTyped.dryRun === true;
      const saveAfterApply = (argsTyped as Record<string, unknown>).saveAfterApply === true;

      const planned = [
        ...missing.map((entry) => ({ mode: 'missing', entry })),
        ...mismatched.map((entry) => ({ mode: 'mismatch', entry: toRecord(entry.expected) }))
      ].filter((entry) => entry.mode === 'missing' || rewriteProperties);

      if (dryRun) {
        return cleanObject({
          success: true,
          dryRun: true,
          rewriteProperties,
          plannedCount: planned.length,
          planned
        });
      }

      const applied: Array<Record<string, unknown>> = [];
      for (const plan of planned) {
        const descriptorEntry = toRecord(plan.entry);
        const fullKey = asString(descriptorEntry.key);
        const propertyType = descriptorType(descriptorEntry);
        if (!fullKey || !propertyType) {
          applied.push({
            success: false,
            mode: plan.mode,
            key: fullKey,
            error: 'INVALID_DESCRIPTOR_ENTRY',
            message: 'Descriptor entry requires key and kind/propertyType.'
          });
          continue;
        }

        const keyParts = splitDescriptorKey(fullKey);
        const upsertResult = await executeAutomationRequest(tools, 'inspect', {
          action: 'upsert_mod_config_property',
          objectPath,
          key: keyParts.key,
          section: keyParts.section,
          propertyType,
          displayName: descriptorEntry.displayName,
          tooltip: descriptorEntry.tooltip,
          requiresWorldReload: descriptorEntry.requiresWorldReload,
          hidden: descriptorEntry.hidden,
          value: descriptorEntry.value
        }) as Record<string, unknown>;

        applied.push(cleanObject({
          mode: plan.mode,
          fullKey,
          ...upsertResult
        }) as Record<string, unknown>);
      }

      let saveResult: Record<string, unknown> | undefined;
      if (saveAfterApply && applied.some((entry) => entry.success !== false)) {
        saveResult = cleanObject(await executeAutomationRequest(tools, 'inspect', {
          action: 'save_mod_config',
          objectPath
        }) as Record<string, unknown>);
      }

      return cleanObject({
        success: applied.every((entry) => entry.success !== false),
        dryRun: false,
        rewriteProperties,
        appliedCount: applied.length,
        applied,
        saveResult
      });
    }
    case 'migrate_mod_config_from_descriptor': {
      const objectPath = await resolveObjectPath(args, tools);
      if (!objectPath) {
        throw new Error('Invalid objectPath: must be a non-empty string');
      }

      const expectedDescriptor = normalizeDescriptorEntries((argsTyped as Record<string, unknown>).descriptorEntries);
      if (expectedDescriptor.length === 0) {
        return cleanObject({
          success: false,
          error: 'INVALID_DESCRIPTOR',
          message: 'migrate_mod_config_from_descriptor requires a non-empty descriptorEntries array.'
        });
      }

      const dryRun = argsTyped.dryRun === true;
      const saveAfterApply = (argsTyped as Record<string, unknown>).saveAfterApply === true;

      const capabilityCheck = await handleInspectTools('check_live_bridge_capabilities', { objectPath }, tools);

      let repairResult: Record<string, unknown> | undefined;
      if (shouldRunConfigRepair(argsTyped)) {
        repairResult = await handleInspectTools('repair_mod_config_tree', {
          ...args,
          objectPath,
          dryRun
        }, tools);
      }

      const diffBefore = await handleInspectTools('diff_mod_config_expected_descriptor', {
        ...args,
        objectPath,
        descriptorEntries: expectedDescriptor
      }, tools);

      const backfillResult = await handleInspectTools('backfill_mod_config_from_descriptor', {
        ...args,
        objectPath,
        descriptorEntries: expectedDescriptor,
        dryRun,
        saveAfterApply: false
      }, tools);

      let saveResult: Record<string, unknown> | undefined;
      let diffAfter: Record<string, unknown> | undefined;
      if (!dryRun) {
        if (saveAfterApply) {
          saveResult = await handleInspectTools('save_mod_config', { objectPath }, tools);
        }
        diffAfter = await handleInspectTools('diff_mod_config_expected_descriptor', {
          ...args,
          objectPath,
          descriptorEntries: expectedDescriptor
        }, tools);
      }

      return cleanObject({
        success:
          capabilityCheck.success !== false &&
          (repairResult?.success !== false) &&
          backfillResult.success !== false &&
          (saveResult?.success !== false),
        dryRun,
        capabilityCheck,
        repairResult,
        diffBefore,
        backfillResult,
        saveResult,
        diffAfter,
        message: dryRun
          ? 'Planned mod-config migration from expected descriptor.'
          : 'Executed mod-config migration from expected descriptor.'
      });
    }
    case 'inspect_blueprint_defaults':
    case 'inspect_cdo': {
      const variantsRes = await handleInspectTools('resolve_blueprint_variants', args, tools);
      const variants = variantsRes as Record<string, unknown>;
      const inspectionTarget = normalizedAction === 'inspect_cdo'
        ? String(variants.cdoPath ?? '')
        : String(variants.generatedClassPath ?? variants.assetObjectPath ?? '');
      const res = await executeAutomationRequest(tools, 'inspect', {
        action: 'inspect_object',
        objectPath: inspectionTarget,
        detailed: true
      }) as InspectResponse;
      return cleanObject({
        ...res,
        variants
      });
    }
    case 'inspect_widget_blueprint':
    case 'get_widget_summary': {
      const variantsRes = await handleInspectTools('resolve_blueprint_variants', args, tools);
      const variants = variantsRes as Record<string, unknown>;
      const res = await executeAutomationRequest(tools, 'inspect', {
        action: 'inspect_object',
        objectPath: String(variants.assetObjectPath ?? ''),
        detailed: true
      }) as InspectResponse;
      return cleanObject({
        success: true,
        widgetPath: variants.assetObjectPath,
        variants,
        inspection: res
      });
    }
    case 'inspect_blueprint_asset': {
      const variantsRes = await handleInspectTools('resolve_blueprint_variants', args, tools);
      const variants = variantsRes as Record<string, unknown>;
      const blueprintPath = String(variants.assetObjectPath ?? variants.generatedClassPath ?? '');
      const blueprintSummary = await handleBlueprintGet({
        ...(args as Record<string, unknown>),
        blueprintPath
      }, tools);
      const graphsRes = await executeAutomationRequest(tools, 'manage_blueprint_graph', {
        subAction: 'list_graphs',
        blueprintPath,
        assetPath: blueprintPath,
        graphName: 'EventGraph'
      }) as Record<string, unknown>;
      const graphs = Array.isArray(graphsRes.graphs) ? graphsRes.graphs as Array<Record<string, unknown>> : [];
      const graphSummaries = await Promise.all(graphs.map(async (graph) => {
        const graphName = asString(graph.graphName) ?? 'EventGraph';
        const details = await executeAutomationRequest(tools, 'manage_blueprint_graph', {
          subAction: 'get_graph_details',
          blueprintPath,
          assetPath: blueprintPath,
          graphName
        }) as Record<string, unknown>;
        return cleanObject({
          graphName,
          graphPath: details.graphPath ?? graph.graphPath,
          nodeCount: details.nodeCount,
          commentGroupCount: Array.isArray(details.commentGroups) ? details.commentGroups.length : 0,
          connectionCount: Array.isArray(details.nodes)
            ? (details.nodes as Array<Record<string, unknown>>).reduce((sum, node) => {
                const summary = toRecord(node.connectionSummary);
                return sum + Number(summary.totalLinkCount ?? 0);
              }, 0)
            : undefined,
          isNestedGraph: graph.isNestedGraph,
          outerNodeId: graph.outerNodeId
        }) as Record<string, unknown>;
      }));
      const classInspection = await executeAutomationRequest(tools, 'inspect', {
        action: 'inspect_object',
        objectPath: String(variants.generatedClassPath ?? variants.assetObjectPath ?? ''),
        detailed: true
      }) as InspectResponse;
      const cdoInspection = await executeAutomationRequest(tools, 'inspect', {
        action: 'inspect_object',
        objectPath: String(variants.cdoPath ?? variants.generatedClassPath ?? variants.assetObjectPath ?? ''),
        detailed: true
      }) as InspectResponse;

      return cleanObject({
        success: true,
        blueprintPath,
        variants,
        generatedClass: variants.generatedClassPath,
        cdoPath: variants.cdoPath,
        blueprint: (blueprintSummary as Record<string, unknown>).blueprint,
        classInspection,
        cdoInspection,
        graphs,
        graphSummaries,
        graphCount: graphs.length
      });
    }
    case 'verify_class_loadability':
    case 'verify_widget_loadability': {
      const variantsRes = await handleInspectTools('resolve_blueprint_variants', args, tools);
      const variants = variantsRes as Record<string, unknown>;
      const target = normalizedAction === 'verify_widget_loadability'
        ? String(variants.assetObjectPath ?? '')
        : String(variants.generatedClassPath ?? variants.assetObjectPath ?? '');
      const res = await executeAutomationRequest(tools, 'inspect', {
        action: 'inspect_object',
        objectPath: target
      }) as InspectResponse;
      return cleanObject({
        success: res.success !== false,
        loadable: res.success !== false,
        target,
        response: res,
        variants
      });
    }
    case 'get_plugin_descriptor_summary':
    case 'validate_mod_descriptor':
    case 'get_mod_summary':
    case 'get_mod_workflow_summary':
    case 'prebuild_mod_check':
    case 'postlaunch_mod_check': {
      const params = normalizeArgs(args, [{ key: 'mountRoot' }, { key: 'pluginName' }, { key: 'objectPath' }]);
      const project = findProjectContext();
      const objectPath = extractOptionalString(params, 'objectPath');
      const mountRoot = extractOptionalString(params, 'mountRoot') ?? getMountRoot(objectPath);
      const pluginName = extractOptionalString(params, 'pluginName');
      const descriptor = findPluginDescriptorByRoot(project.repoRoot, mountRoot) ?? findPluginDescriptorByName(project.repoRoot, pluginName);

      if (!descriptor) {
        return cleanObject({
          success: false,
          error: 'PLUGIN_NOT_FOUND',
          message: 'Unable to resolve plugin from mountRoot/pluginName/objectPath',
          availablePlugins: listPluginDescriptors(project.repoRoot).map((entry) => entry.mountRoot)
        });
      }

      const summary = summarizeDescriptor(descriptor);
      const assetSearch = await searchAssetsByMountRoot(tools, descriptor.mountRoot, undefined, 300);
      const assets = getAssetsFromSearchResponse(assetSearch);
      const configBlueprintCandidates = assets.filter((asset) => {
        const assetPath = typeof asset.path === 'string' ? asset.path : '';
        return /config/i.test(assetPath) && /BP_/i.test(assetPath);
      }).slice(0, 25);
      const widgetBlueprintCandidates = assets.filter((asset) => {
        const assetPath = typeof asset.path === 'string' ? asset.path : '';
        return /\/UI\//i.test(assetPath) || /WBP_/i.test(assetPath);
      }).slice(0, 25);
      const descriptorIssues: Array<Record<string, unknown>> = [];
      if (!summary.canContainContent) descriptorIssues.push({ severity: 'warning', message: 'Plugin descriptor does not declare CanContainContent=true' });
      if (!Array.isArray(summary.modules) || (summary.modules as unknown[]).length === 0) descriptorIssues.push({ severity: 'warning', message: 'Plugin has no declared modules' });
      if (!summary.versionName) descriptorIssues.push({ severity: 'warning', message: 'Plugin descriptor is missing VersionName' });

      const runtimeVerification = normalizedAction === 'postlaunch_mod_check'
        ? await handleInspectTools('verify_mod_runtime', { mountRoot: descriptor.mountRoot, pluginName: descriptor.pluginName }, tools)
        : undefined;

      return cleanObject({
        success: normalizedAction === 'validate_mod_descriptor' ? descriptorIssues.length === 0 : true,
        project,
        plugin: summary,
        descriptorIssues,
        mountRoot: descriptor.mountRoot,
        configBlueprintCandidates,
        widgetBlueprintCandidates,
        notableAssets: assets.slice(0, 100),
        buildTargets: listTargetFiles(project.repoRoot),
        runtimeVerification
      });
    }
    case 'find_mod_objects': {
      const params = normalizeArgs(args, [{ key: 'filter' }, { key: 'pluginName' }]);
      const filter = extractOptionalString(params, 'filter') ?? extractOptionalString(params, 'pluginName') ?? '';
      const list = await executeAutomationRequest(tools, 'inspect', {
        action: 'list_objects'
      }) as InspectResponse;
      const objects = Array.isArray(list.objects) ? list.objects : [];
      const filtered = filter
        ? objects.filter((entry) => JSON.stringify(entry).toLowerCase().includes(filter.toLowerCase()))
        : objects;
      return cleanObject({
        success: true,
        count: filtered.length,
        objects: filtered
      });
    }
    case 'verify_mod_runtime': {
      const summary = await handleInspectTools('get_mod_summary', args, tools);
      const summaryRecord = summary as Record<string, unknown>;
      const configBlueprints = Array.isArray(summaryRecord.configBlueprintCandidates) ? summaryRecord.configBlueprintCandidates as Array<Record<string, unknown>> : [];
      const widgetBlueprints = Array.isArray(summaryRecord.widgetBlueprintCandidates) ? summaryRecord.widgetBlueprintCandidates as Array<Record<string, unknown>> : [];
      const plugin = summaryRecord.plugin as Record<string, unknown> | undefined;

      const configTargets = configBlueprints.slice(0, 5).map((entry) => {
        const objectPath = typeof entry.path === 'string' ? entry.path : '';
        const variants = deriveBlueprintVariants(objectPath);
        return {
          objectPath,
          targetPath: String(variants.generatedClassPath ?? variants.assetObjectPath ?? ''),
          variants
        };
      });
      const widgetTargets = widgetBlueprints.slice(0, 5).map((entry) => {
        const objectPath = typeof entry.path === 'string' ? entry.path : '';
        const variants = deriveBlueprintVariants(objectPath);
        return {
          objectPath,
          targetPath: String(variants.assetObjectPath ?? ''),
          variants
        };
      });
      const batchResultsByPath = new Map<string, Record<string, unknown>>();
      const batchPaths = Array.from(new Set(
        [...configTargets, ...widgetTargets]
          .map((entry) => entry.targetPath)
          .filter((entry) => entry.length > 0)
      ));

      if (batchPaths.length > 0) {
        try {
          const batchResponse = await executeAutomationRequest(tools, 'inspect', {
            action: 'batch_inspect_objects',
            objectPaths: batchPaths
          }) as Record<string, unknown>;

          if (batchResponse.success !== false && Array.isArray(batchResponse.results)) {
            for (const result of batchResponse.results) {
              const record = toRecord(result);
              const objectPath = asString(record.objectPath);
              if (objectPath) {
                batchResultsByPath.set(objectPath, record);
              }
            }
          }
        } catch {
          // Older bridge builds may not implement batching yet. Fall back below.
        }
      }

      const buildRuntimeCheck = async (
        target: { objectPath: string; targetPath: string; variants: ReturnType<typeof deriveBlueprintVariants> },
        fallbackAction: 'verify_class_loadability' | 'verify_widget_loadability'
      ): Promise<Record<string, unknown>> => {
        const batchResult = batchResultsByPath.get(target.targetPath);
        if (batchResult) {
          const success = batchResult.success !== false;
          return cleanObject({
            success,
            loadable: batchResult.loadable !== false && success,
            target: target.targetPath,
            response: batchResult,
            variants: target.variants
          });
        }

        if (!target.objectPath) {
          return cleanObject({
            success: false,
            loadable: false,
            target: target.targetPath,
            variants: target.variants,
            error: 'MISSING_OBJECT_PATH',
            message: 'Blueprint candidate did not provide an object path.'
          });
        }

        return await handleInspectTools(fallbackAction, { objectPath: target.objectPath }, tools);
      };

      const [configChecks, widgetChecks, objectChecks, logChecks] = await Promise.all([
        Promise.all(configTargets.map(async (entry) => await buildRuntimeCheck(entry, 'verify_class_loadability'))),
        Promise.all(widgetTargets.map(async (entry) => await buildRuntimeCheck(entry, 'verify_widget_loadability'))),
        handleInspectTools('find_mod_objects', {
          filter: typeof plugin?.pluginName === 'string' ? plugin.pluginName : undefined
        }, tools),
        executeAutomationRequest(tools, 'system_control', {
          action: 'tail_logs',
          filter: typeof plugin?.pluginName === 'string' ? plugin.pluginName : undefined,
          maxLines: 100
        }) as Promise<Record<string, unknown>>
      ]);
      const issues: Record<string, unknown>[] = [];
      if ((objectChecks as Record<string, unknown>).count === 0) {
        issues.push(createIssue('runtime_objects', 'No live objects were discovered for the current plugin filter.'));
      }
      for (const check of [...configChecks, ...widgetChecks]) {
        const record = toRecord(check);
        if (record.loadable === false || record.success === false) {
          issues.push(createIssue('runtime_loadability', `Loadability verification failed for '${String(record.target ?? record.widgetPath ?? 'unknown')}'.`, record));
        }
      }

      return cleanObject({
        success: true,
        summary,
        configChecks,
        widgetChecks,
        objectChecks,
        logChecks,
        issues
      });
    }

    case 'find_components_by_mesh': {
      const native = await tryInspectAction(tools, 'find_components_by_mesh', {
        meshPath: argsTyped.meshPath ?? argsTyped.objectPath,
        objectPath: argsTyped.objectPath,
        worldType: (argsTyped as Record<string, unknown>).worldType
      });
      if (native) return native;
      return await buildFallbackFindComponentsByAsset(argsTyped, tools, 'mesh');
    }

    case 'find_components_by_material': {
      const native = await tryInspectAction(tools, 'find_components_by_material', {
        materialPath: argsTyped.materialPath ?? argsTyped.objectPath,
        objectPath: argsTyped.objectPath,
        worldType: (argsTyped as Record<string, unknown>).worldType
      });
      if (native) return native;
      return await buildFallbackFindComponentsByAsset(argsTyped, tools, 'material');
    }

    case 'get_component_render_state': {
      const native = await tryInspectAction(tools, 'get_component_render_state', {
        actorName: argsTyped.actorName,
        componentName: argsTyped.componentName,
        componentPath: (argsTyped as Record<string, unknown>).componentPath,
        objectPath: argsTyped.objectPath,
        worldType: (argsTyped as Record<string, unknown>).worldType
      });
      if (native) return native;
      return await buildFallbackComponentRenderState(argsTyped, tools);
    }

    case 'get_actor_render_summary': {
      const actorName = await resolveObjectPath(args, tools, { pathKeys: [], actorKeys: ['actorName', 'name', 'objectPath'] });
      const native = await tryInspectAction(tools, 'get_actor_render_summary', {
        actorName,
        objectPath: actorName ?? argsTyped.objectPath,
        worldType: (argsTyped as Record<string, unknown>).worldType
      });
      if (native) return native;
      return await buildFallbackActorRenderSummary({ ...argsTyped, actorName }, tools);
    }

    case 'get_viewport_render_summary':
      return await buildViewportRenderSummary(argsTyped, tools);

    case 'compare_mesh_material_layout': {
      const sourceMeshPath = asString((argsTyped as Record<string, unknown>).sourceMeshPath) ?? argsTyped.objectPath;
      const replacementMeshPath = asString((argsTyped as Record<string, unknown>).replacementMeshPath);
      if (!sourceMeshPath || !replacementMeshPath) {
        throw new Error('sourceMeshPath and replacementMeshPath are required');
      }

      const [sourceMesh, replacementMesh] = await Promise.all([
        inspectMeshRenderTraits(sourceMeshPath, tools),
        inspectMeshRenderTraits(replacementMeshPath, tools)
      ]);
      const sourceSlots = Array.isArray(sourceMesh.materialSlots) ? sourceMesh.materialSlots : [];
      const replacementSlots = Array.isArray(replacementMesh.materialSlots) ? replacementMesh.materialSlots : [];

      return cleanObject({
        success: sourceMesh.success !== false && replacementMesh.success !== false,
        sourceMesh,
        replacementMesh,
        sourceSlotCount: sourceSlots.length,
        replacementSlotCount: replacementSlots.length,
        slotCountMatches: sourceSlots.length === replacementSlots.length,
        warnings: sourceSlots.length === replacementSlots.length
          ? []
          : ['Replacement mesh does not preserve the source material slot count.']
      });
    }

    case 'validate_replacement_compatibility': {
      const comparison = await handleInspectTools('compare_mesh_material_layout', args, tools);
      const comparisonRecord = comparison as Record<string, unknown>;
      const issues: Record<string, unknown>[] = [];
      if (comparisonRecord.slotCountMatches === false) {
        issues.push(createIssue('slot_layout', 'Replacement mesh does not preserve the source material slot count.', comparisonRecord));
      }

      const sourceMesh = toRecord(comparisonRecord.sourceMesh);
      const replacementMesh = toRecord(comparisonRecord.replacementMesh);
      const sourceNanite = JSON.stringify(sourceMesh.naniteSettings ?? '');
      const replacementNanite = JSON.stringify(replacementMesh.naniteSettings ?? '');
      if (sourceNanite !== replacementNanite) {
        issues.push(createIssue('nanite', 'Source and replacement meshes differ in Nanite settings.', {
          sourceNanite: sourceMesh.naniteSettings,
          replacementNanite: replacementMesh.naniteSettings
        }));
      }

      return cleanObject({
        success: issues.length === 0,
        comparison,
        issues,
        suggestedNextSteps: issues.length > 0
          ? ['Run get_viewport_render_summary', 'Run get_component_render_state on a live actor/component', 'Inspect material/render traits for the replacement asset chain']
          : []
      });
    }

    case 'get_mod_render_debug_report': {
      const summary = await handleInspectTools('get_mod_summary', args, tools);
      const summaryRecord = summary as Record<string, unknown>;
      const mountRoot = asString(summaryRecord.mountRoot) ?? asString((argsTyped as Record<string, unknown>).mountRoot);
      const meshAssets = mountRoot ? getAssetsFromSearchResponse(await searchAssetsByMountRoot(tools, mountRoot, ['StaticMesh'], 8)) : [];
      const materialAssets = mountRoot ? getAssetsFromSearchResponse(await searchAssetsByMountRoot(tools, mountRoot, ['Material', 'MaterialInstanceConstant'], 8)) : [];
      const logChecks = await executeAutomationRequest(tools, 'system_control', {
        action: 'tail_logs',
        filter: asString((summaryRecord.plugin as Record<string, unknown> | undefined)?.pluginName) ?? mountRoot,
        maxLines: argsTyped.maxLines ?? 150
      }) as Record<string, unknown>;

      const sampledMeshLayouts = await Promise.all(
        meshAssets.slice(0, 2).map(async (asset) => {
          const meshPath = asString((asset as Record<string, unknown>).path);
          return meshPath ? await inspectMeshRenderTraits(meshPath, tools) : undefined;
        })
      );

      return cleanObject({
        success: summaryRecord.success !== false,
        mountRoot,
        summary,
        sampledMeshes: sampledMeshLayouts.filter(Boolean),
        sampledMaterials: materialAssets.slice(0, 4),
        runtimeValidation: await handleInspectTools('verify_mod_runtime', args, tools),
        viewport: await handleInspectTools('get_viewport_render_summary', args, tools),
        logs: logChecks
      });
    }

    case 'get_components': {
      const actorName = await resolveObjectPath(args, tools, { pathKeys: [], actorKeys: ['actorName', 'name', 'objectPath'] });
      if (!actorName) {
        throw new Error('Invalid actorName');
      }

      const res = await executeAutomationRequest(
        tools,
        'inspect',
        {
          action: 'get_components',
          actorName: actorName,
          objectPath: actorName
        },
        'Failed to get components'
      ) as InspectResponse;

      return cleanObject(res);
    }
    case 'get_component_property': {
      const componentObjectPath = await resolveComponentObjectPathFromArgs(args, tools);
      const params = normalizeArgs(args, [
        { key: 'propertyName', aliases: ['propertyPath'], required: true }
      ]);
      const propertyName = extractString(params, 'propertyName');

      const res = await executeAutomationRequest(tools, 'inspect', {
        action: 'get_property',
        objectPath: componentObjectPath,
        propertyName
      }) as Record<string, unknown>;
      return cleanObject(res);
    }
    case 'set_component_property': {
      const componentObjectPath = await resolveComponentObjectPathFromArgs(args, tools);
      const params = normalizeArgs(args, [
        { key: 'propertyName', aliases: ['propertyPath'], required: true },
        { key: 'value' }
      ]);
      const propertyName = extractString(params, 'propertyName');
      const value = params.value;

      const res = await executeAutomationRequest(tools, 'inspect', {
        action: 'set_property',
        objectPath: componentObjectPath,
        propertyName,
        value
      }) as Record<string, unknown>;
      return cleanObject(res);
    }
    case 'get_component_details': {
      // Get component details by inspecting the component object
      const componentObjectPath = await resolveComponentObjectPathFromArgs(args, tools);
      
      const res = await executeAutomationRequest(
        tools,
        'inspect',
        {
          action: 'inspect_object',
          objectPath: componentObjectPath,
          detailed: true
        },
        'Failed to get component details'
      ) as InspectResponse;
      
      return cleanObject(res);
    }
    case 'get_metadata': {
      const actorName = await resolveObjectPath(args, tools);
      if (!actorName) throw new Error('Invalid actorName');
      return cleanObject(await executeAutomationRequest(tools, 'control_actor', {
        action: 'get_metadata',
        actorName
      }) as Record<string, unknown>);
    }
    case 'add_tag': {
      const actorName = await resolveObjectPath(args, tools);
      const params = normalizeArgs(args, [
        { key: 'tag', required: true }
      ]);
      const tag = extractString(params, 'tag');

      if (!actorName) throw new Error('Invalid actorName');
      return cleanObject(await executeAutomationRequest(tools, 'control_actor', {
        action: 'add_tag',
        actorName,
        tag
      }) as Record<string, unknown>);
    }
    case 'find_by_tag': {
      const params = normalizeArgs(args, [{ key: 'tag' }]);
      const tag = extractOptionalString(params, 'tag') ?? '';
      return cleanObject(await executeAutomationRequest(tools, 'control_actor', {
        action: 'find_by_tag',
        tag
      }) as Record<string, unknown>);
    }
    case 'create_snapshot': {
      const actorName = await resolveObjectPath(args, tools);
      if (!actorName) throw new Error('actorName is required for create_snapshot');
      const snapshotName = typeof argsTyped.snapshotName === 'string' ? argsTyped.snapshotName : '';
      return cleanObject(await executeAutomationRequest(tools, 'control_actor', {
        action: 'create_snapshot',
        actorName,
        snapshotName
      }) as Record<string, unknown>);
    }
    case 'restore_snapshot': {
      const actorName = await resolveObjectPath(args, tools);
      if (!actorName) throw new Error('actorName is required for restore_snapshot');
      const snapshotName = typeof argsTyped.snapshotName === 'string' ? argsTyped.snapshotName : '';
      return cleanObject(await executeAutomationRequest(tools, 'control_actor', {
        action: 'restore_snapshot',
        actorName,
        snapshotName
      }) as Record<string, unknown>);
    }
    case 'export': {
      const actorName = await resolveObjectPath(args, tools);
      if (!actorName) throw new Error('actorName may be required for export depending on context (exporting actor requires it)');
      const params = normalizeArgs(args, [
        { key: 'destinationPath', aliases: ['outputPath'] }
      ]);
      const destinationPath = extractOptionalString(params, 'destinationPath');
      return cleanObject(await executeAutomationRequest(tools, 'control_actor', {
        action: 'export',
        actorName: actorName || '',
        destinationPath
      }) as Record<string, unknown>);
    }
    case 'delete_object': {
      const actorName = await resolveObjectPath(args, tools);
      try {
        if (!actorName) throw new Error('actorName is required for delete_object');
        const res = await executeAutomationRequest(tools, 'control_actor', {
          action: 'delete',
          actorName
        }) as InspectResponse;
        
        // Handle response-based errors (C++ returns success:false without throwing)
        if (res && res.success === false) {
          const msg = String(res.message || res.error || '');
          const lower = msg.toLowerCase();
          // Check for both singular "actor not found" and plural "actors not found"
          if (lower.includes('actor not found') || lower.includes('actors not found') || lower.includes('not found')) {
            return cleanObject({
              success: false,
              error: res.error || 'NOT_FOUND',
              handled: true,
              message: msg,
              deleted: actorName,
              notFound: true
            });
          }
          // Other errors - return with handled flag
          return cleanObject({
            ...res,
            handled: true,
            notFound: lower.includes('not found')
          });
        }
        return cleanObject(res);
      } catch (err: unknown) {
        const msg = String(err instanceof Error ? err.message : err);
        const lower = msg.toLowerCase();
        // Check for both singular "actor not found" and plural "actors not found"
        if (lower.includes('actor not found') || lower.includes('actors not found') || lower.includes('not found')) {
          return cleanObject({
            success: false,
            error: 'NOT_FOUND',
            handled: true,
            message: msg,
            deleted: actorName,
            notFound: true
          });
        }
        throw err;
      }
    }
    case 'list_objects':
      return cleanObject(await executeAutomationRequest(tools, 'control_actor', {
        action: 'list_actors',
        ...args
      }) as Record<string, unknown>);
    case 'find_by_class': {
      const params = normalizeArgs(args, [
        { key: 'className', aliases: ['classPath'], required: true }
      ]);
      const className = extractString(params, 'className');
      const res = await executeAutomationRequest(tools, 'inspect', {
        action: 'find_by_class',
        className
      }) as InspectResponse;
      if (!res || res.success === false) {
        // Return proper failure state
        return cleanObject({
          success: false,
          error: res?.error || 'OPERATION_FAILED',
          message: res?.message || 'find_by_class failed',
          className,
          objects: [],
          count: 0
        });
      }
      return cleanObject(res);
    }
    case 'get_bounding_box': {
      const actorName = await resolveObjectPath(args, tools);
      try {
        if (!actorName) throw new Error('actorName is required for get_bounding_box');
        const res = await executeAutomationRequest(tools, 'control_actor', {
          action: 'get_bounding_box',
          actorName
        }) as Record<string, unknown>;
        return cleanObject(res);
      } catch (err: unknown) {
        const msg = String(err instanceof Error ? err.message : err);
        const lower = msg.toLowerCase();
        if (lower.includes('actor not found')) {
          return cleanObject({
            success: false,
            error: 'NOT_FOUND',
            handled: true,
            message: msg,
            actorName,
            notFound: true
          });
        }
        throw err;
      }
    }
    case 'inspect_class': {
      const params = normalizeArgs(args, [
        { key: 'className', aliases: ['classPath'], required: true }
      ]);
      let className = extractString(params, 'className');

      // Basic smart resolution for common classes if path is incomplete
      // E.g. "Landscape" -> "/Script/Landscape.Landscape" or "/Script/Engine.Landscape"
      if (className && !className.includes('/') && !className.includes('.')) {
        if (className === 'Landscape') {
          className = '/Script/Landscape.Landscape';
        } else if (['Actor', 'Pawn', 'Character', 'StaticMeshActor'].includes(className)) {
          className = `/Script/Engine.${className}`;
        }
      }

      const res = await executeAutomationRequest(tools, 'inspect', {
        action: 'inspect_class',
        className
      }) as InspectResponse;
      if (!res || res.success === false) {
        // If first try failed and it looked like a short name, maybe try standard engine path?
        const originalClassName = typeof argsTyped.className === 'string' ? argsTyped.className : '';
        if (originalClassName && !originalClassName.includes('/') && !className.startsWith('/Script/')) {
          const retryName = `/Script/Engine.${originalClassName}`;
          const resRetry = await executeAutomationRequest(tools, 'inspect', {
            action: 'inspect_class',
            className: retryName
          }) as InspectResponse;
          if (resRetry && resRetry.success) {
            return cleanObject(resRetry);
          }
        }

        // Return proper failure state
        return cleanObject({
          success: false,
          error: res?.error || 'OPERATION_FAILED',
          message: res?.message || `inspect_class failed for '${className}'`,
          className,
          cdo: res?.cdo ?? null
        });
      }
      return cleanObject(res);
    }
    // Global actions that don't require objectPath
    case 'get_project_settings': {
      const res = await executeAutomationRequest(tools, 'inspect', {
        action: 'get_project_settings',
        ...normalizedArgs
      });
      return cleanObject(res) as Record<string, unknown>;
    }
    case 'get_editor_settings': {
      const res = await executeAutomationRequest(tools, 'inspect', {
        action: 'get_editor_settings',
        ...normalizedArgs
      });
      return cleanObject(res) as Record<string, unknown>;
    }
    case 'get_mount_points': {
      const res = await executeAutomationRequest(tools, 'inspect', {
        action: 'get_mount_points',
        ...normalizedArgs
      });
      return cleanObject(res) as Record<string, unknown>;
    }
    case 'get_performance_stats': {
      const res = await executeAutomationRequest(tools, 'inspect', {
        action: 'get_performance_stats',
        ...normalizedArgs
      });
      return cleanObject(res) as Record<string, unknown>;
    }
    case 'get_memory_stats': {
      const res = await executeAutomationRequest(tools, 'inspect', {
        action: 'get_memory_stats',
        ...normalizedArgs
      });
      return cleanObject(res) as Record<string, unknown>;
    }
    case 'get_scene_stats': {
      const res = await executeAutomationRequest(tools, 'inspect', {
        action: 'get_scene_stats',
        ...normalizedArgs
      });
      return cleanObject(res) as Record<string, unknown>;
    }
    case 'get_viewport_info': {
      const res = await executeAutomationRequest(tools, 'inspect', {
        action: 'get_viewport_info',
        ...normalizedArgs
      });
      return cleanObject(res) as Record<string, unknown>;
    }
    case 'get_selected_actors': {
      const res = await executeAutomationRequest(tools, 'inspect', {
        action: 'get_selected_actors',
        ...normalizedArgs
      });
      return cleanObject(res) as Record<string, unknown>;
    }
    default:
      // Fallback to generic automation request if action not explicitly handled
      const res = await executeAutomationRequest(tools, 'inspect', args, 'Automation bridge not available for inspect operations');
      return cleanObject(res) as Record<string, unknown>;
  }
}

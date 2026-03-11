import fs from 'node:fs';
import path from 'node:path';
import { cleanObject } from '../../utils/safe-json.js';
import { ITools } from '../../types/tool-interfaces.js';
import type { HandlerArgs, InspectArgs, ComponentInfo } from '../../types/handler-types.js';
import { executeAutomationRequest } from './common-handlers.js';
import { normalizeArgs, resolveObjectPath, extractString, extractOptionalString } from './argument-helper.js';
import { classifyMountRoot, deriveBlueprintVariants, findPluginDescriptorByName, findPluginDescriptorByRoot, findProjectContext, getMountRoot, listPluginDescriptors, listTargetFiles, summarizeDescriptor } from './modding-utils.js';

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

type InspectionPathToken = string | number;

interface InspectionNormalizationContext {
  objectPath?: string;
  propertyPath?: string;
  className?: string;
  classPath?: string;
  value?: unknown;
  valueType?: string;
  warnings?: string[];
}

interface DiagnosticIssue {
  severity: 'info' | 'warning' | 'error';
  category: string;
  code: string;
  message: string;
  evidence?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function toIssueCode(category: string, message: string): string {
  const normalizedCategory = category.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toUpperCase() || 'GENERAL';
  const normalizedMessage = message.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toUpperCase() || 'ISSUE';
  return `${normalizedCategory}_${normalizedMessage}`.slice(0, 96);
}

export function createDiagnosticIssue(
  category: string,
  message: string,
  severity: DiagnosticIssue['severity'] = 'warning',
  evidence?: unknown
): DiagnosticIssue {
  return cleanObject({
    severity,
    category,
    code: toIssueCode(category, message),
    message,
    evidence
  }) as DiagnosticIssue;
}

export function classifyDependencyKind(value: unknown): string {
  const text = typeof value === 'string'
    ? value
    : JSON.stringify(value ?? '');
  const normalized = text.toLowerCase();
  if (/materialfunction|\/mf_|\/materialfunctions?\//.test(normalized)) return 'function';
  if (/materialinstance|material\b|\/m_|\/materials?\//.test(normalized)) return 'material';
  if (/texture|\/t_|\/textures?\//.test(normalized)) return 'texture';
  if (/staticmesh|skeletalmesh|\/sm_|\/meshes?\//.test(normalized)) return 'mesh';
  if (/widgetblueprint|\/wbp_|\/ui\//.test(normalized)) return 'widget';
  if (/blueprint|generatedclass|\/bp_/.test(normalized)) return 'blueprint';
  if (/config|ini|descriptor/.test(normalized)) return 'config';
  return 'other';
}

export function groupDependenciesByType(
  entries: Array<Record<string, unknown>>,
  mountRoot?: string
): Record<string, Array<Record<string, unknown>>> {
  const groups: Record<string, Array<Record<string, unknown>>> = {
    mesh: [],
    material: [],
    texture: [],
    function: [],
    blueprint: [],
    widget: [],
    config: [],
    other: []
  };

  for (const entry of entries) {
    const candidatePath = asString(entry.path) ?? asString(entry.objectPath) ?? asString(entry.assetPath);
    if (mountRoot && candidatePath && !candidatePath.startsWith(mountRoot)) {
      continue;
    }
    const kind = classifyDependencyKind(candidatePath ?? entry.class ?? entry.name ?? entry);
    groups[kind] ??= [];
    groups[kind].push(entry);
  }

  return groups;
}

function walkFiles(rootDir: string, filter: (filePath: string) => boolean, limit: number): string[] {
  if (!fs.existsSync(rootDir) || limit <= 0) return [];
  const results: string[] = [];
  const queue = [rootDir];

  while (queue.length > 0 && results.length < limit) {
    const current = queue.shift();
    if (!current) continue;

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }

      if (entry.isFile() && filter(fullPath)) {
        results.push(fullPath);
        if (results.length >= limit) break;
      }
    }
  }

  return results;
}

function collectMountedPaths(value: unknown, results: Set<string>, limit: number = 24): void {
  if (results.size >= limit || value == null) return;
  if (typeof value === 'string') {
    if (/^\/[A-Za-z0-9_]+\/.+/.test(value)) {
      results.add(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectMountedPaths(entry, results, limit);
      if (results.size >= limit) break;
    }
    return;
  }
  if (isRecord(value)) {
    for (const entry of Object.values(value)) {
      collectMountedPaths(entry, results, limit);
      if (results.size >= limit) break;
    }
  }
}

export function tokenizePropertyPath(path: string): InspectionPathToken[] {
  const tokens: InspectionPathToken[] = [];
  let current = '';
  let index = 0;

  while (index < path.length) {
    const char = path[index];
    if (char === '.') {
      if (current) {
        tokens.push(current);
        current = '';
      }
      index += 1;
      continue;
    }

    if (char === '[') {
      if (current) {
        tokens.push(current);
        current = '';
      }

      const end = path.indexOf(']', index + 1);
      if (end === -1) {
        const remainder = path.slice(index + 1).trim();
        if (remainder) {
          tokens.push(/^\d+$/.test(remainder) ? Number.parseInt(remainder, 10) : remainder);
        }
        break;
      }

      const rawKey = path.slice(index + 1, end).trim().replace(/^['"]|['"]$/g, '');
      if (rawKey) {
        tokens.push(/^\d+$/.test(rawKey) ? Number.parseInt(rawKey, 10) : rawKey);
      }
      index = end + 1;
      continue;
    }

    current += char;
    index += 1;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function splitBridgeAndClientPropertyPath(propertyPath: string): { bridgePath: string; clientTokens: InspectionPathToken[] } {
  const bracketIndex = propertyPath.indexOf('[');
  if (bracketIndex === -1) {
    return { bridgePath: propertyPath, clientTokens: [] };
  }

  const bridgePath = propertyPath.slice(0, bracketIndex);
  const clientTokens = tokenizePropertyPath(propertyPath.slice(bracketIndex));
  return { bridgePath, clientTokens };
}

export function resolveValueAtPath(value: unknown, tokens: InspectionPathToken[]): { found: boolean; value: unknown } {
  let current: unknown = value;
  for (const token of tokens) {
    if (typeof token === 'number') {
      if (!Array.isArray(current) || token < 0 || token >= current.length) {
        return { found: false, value: undefined };
      }
      current = current[token];
      continue;
    }

    if (Array.isArray(current)) {
      return { found: false, value: undefined };
    }

    if (!isRecord(current) || !(token in current)) {
      return { found: false, value: undefined };
    }
    current = current[token];
  }

  return { found: true, value: current };
}

export function inferInspectionValueType(value: unknown, fallback?: string): string {
  if (fallback && fallback.trim().length > 0) {
    return fallback;
  }
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'undefined':
      return 'undefined';
    case 'object':
      return 'object';
    default:
      return 'unknown';
  }
}

export function normalizeInspectionEnvelope(response: unknown, context: InspectionNormalizationContext = {}): Record<string, unknown> {
  const normalized = { ...toRecord(response) };
  const existingWarnings = Array.isArray(normalized.warnings) ? normalized.warnings.filter((value): value is string => typeof value === 'string') : [];
  const warnings = [...existingWarnings, ...(context.warnings ?? [])];

  const resolvedObjectPath =
    context.objectPath ??
    asString(normalized.resolvedObjectPath) ??
    asString(normalized.objectPath) ??
    asString(normalized.assetPath) ??
    asString(normalized.actorPath) ??
    asString(normalized.ownerActorPath);

  const className =
    context.className ??
    asString(normalized.className) ??
    asString(normalized.assetClass) ??
    asString(normalized.actorClass) ??
    asString(normalized.componentClass);

  const classPath =
    context.classPath ??
    asString(normalized.classPath);

  const propertyPath =
    context.propertyPath ??
    asString(normalized.propertyPath) ??
    asString(normalized.propertyName);

  const value = context.value !== undefined ? context.value : normalized.value;
  const valueType = inferInspectionValueType(context.value !== undefined ? context.value : normalized.value, context.valueType ?? asString(normalized.valueType));

  return cleanObject({
    ...normalized,
    resolvedObjectPath,
    className,
    classPath,
    propertyPath,
    value,
    valueType,
    warnings
  }) as Record<string, unknown>;
}

async function executeInspectAction(
  tools: ITools,
  action: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return normalizeInspectionEnvelope(await executeAutomationRequest(tools, 'inspect', {
    action,
    ...args
  }) as Record<string, unknown>);
}

async function executeSystemAction(
  tools: ITools,
  action: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return cleanObject(await executeAutomationRequest(tools, 'system_control', {
    action,
    ...args
  }) as Record<string, unknown>) as Record<string, unknown>;
}

async function executeAssetAction(
  tools: ITools,
  action: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return cleanObject(await executeAutomationRequest(tools, action, args) as Record<string, unknown>) as Record<string, unknown>;
}

async function readPropertyValue(
  tools: ITools,
  objectPath: string,
  propertyPath: string,
  warnings: string[] = []
): Promise<Record<string, unknown>> {
  const { bridgePath, clientTokens } = splitBridgeAndClientPropertyPath(propertyPath);
  const raw = await executeInspectAction(tools, 'get_property', {
    objectPath,
    propertyName: bridgePath
  });

  const rawSuccess = raw.success !== false;
  if (!rawSuccess) {
    return normalizeInspectionEnvelope(raw, { objectPath, propertyPath, warnings });
  }

  if (clientTokens.length === 0) {
    return normalizeInspectionEnvelope(raw, { objectPath, propertyPath, warnings });
  }

  const resolved = resolveValueAtPath(raw.value, clientTokens);
  if (!resolved.found) {
    return normalizeInspectionEnvelope({
      ...raw,
      success: false,
      error: 'PROPERTY_PATH_NOT_FOUND',
      message: `Unable to resolve nested property path '${propertyPath}' from '${bridgePath}'`
    }, { objectPath, propertyPath, warnings });
  }

  return normalizeInspectionEnvelope(raw, {
    objectPath,
    propertyPath,
    value: resolved.value,
    warnings
  });
}

async function tryReadPropertyValue(
  tools: ITools,
  objectPath: string,
  propertyPath: string,
  warnings: string[]
): Promise<unknown> {
  const response = await readPropertyValue(tools, objectPath, propertyPath, warnings);
  if (response.success === false) {
    warnings.push(`Property '${propertyPath}' could not be read from '${objectPath}'.`);
    return undefined;
  }
  return response.value;
}

function summarizeStaticMaterials(staticMaterials: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(staticMaterials)) {
    return [];
  }

  return staticMaterials.map((entry, index) => {
    const record = toRecord(entry);
    return cleanObject({
      index,
      slotName: asString(record.MaterialSlotName) ?? asString(record.slotName) ?? asString(record.name) ?? `Slot${index}`,
      importedSlotName: asString(record.ImportedMaterialSlotName),
      materialInterface: record.MaterialInterface ?? record.materialInterface ?? record.material,
      uvChannelData: record.UVChannelData
    }) as Record<string, unknown>;
  });
}

async function buildObjectSummary(args: InspectArgs, tools: ITools): Promise<Record<string, unknown>> {
  const objectPath = await resolveObjectPath(args, tools) ?? asString(args.objectPath) ?? '';
  if (!objectPath) {
    throw new Error('Invalid objectPath: must be a non-empty string');
  }

  const response = await executeInspectAction(tools, 'inspect_object', {
    objectPath,
    detailed: true
  });
  return normalizeInspectionEnvelope(response, { objectPath });
}

async function buildMaterialSummary(args: InspectArgs, tools: ITools): Promise<Record<string, unknown>> {
  const objectPath = asString(args.objectPath) ?? asString(args.materialPath) ?? await resolveObjectPath(args, tools) ?? '';
  if (!objectPath) {
    throw new Error('materialPath or objectPath is required');
  }

  const warnings: string[] = [];
  const objectSummary = await buildObjectSummary({ ...args, objectPath }, tools);
  const stats = await executeAssetAction(tools, 'get_material_stats', { assetPath: objectPath });
  const graph = await executeAssetAction(tools, 'analyze_graph', { assetPath: objectPath });

  const materialDomain = await tryReadPropertyValue(tools, objectPath, 'MaterialDomain', warnings);
  const blendMode = await tryReadPropertyValue(tools, objectPath, 'BlendMode', warnings);
  const twoSided = await tryReadPropertyValue(tools, objectPath, 'TwoSided', warnings);
  const parent = await tryReadPropertyValue(tools, objectPath, 'Parent', warnings);
  const scalarOverrides = await tryReadPropertyValue(tools, objectPath, 'ScalarParameterValues', warnings);
  const vectorOverrides = await tryReadPropertyValue(tools, objectPath, 'VectorParameterValues', warnings);
  const textureOverrides = await tryReadPropertyValue(tools, objectPath, 'TextureParameterValues', warnings);
  const staticSwitchOverrides = await tryReadPropertyValue(tools, objectPath, 'StaticParameters.StaticSwitchParameters', warnings);
  const staticMaskOverrides = await tryReadPropertyValue(tools, objectPath, 'StaticParameters.StaticComponentMaskParameters', warnings);
  const wpo = await tryReadPropertyValue(tools, objectPath, 'bUsesWorldPositionOffset', warnings);
  const pdo = await tryReadPropertyValue(tools, objectPath, 'bUsesPixelDepthOffset', warnings);
  const displacement = await tryReadPropertyValue(tools, objectPath, 'bUsesDisplacement', warnings);

  const statsRecord = toRecord(stats.stats);
  return normalizeInspectionEnvelope({
    success: objectSummary.success !== false,
    summaryType: 'material',
    objectSummary,
    graphAnalysis: graph,
    parent,
    materialDomain,
    blendMode,
    twoSided,
    shadingModel: statsRecord.shadingModel ?? graph.shadingModel,
    samplerCount: statsRecord.samplerCount ?? graph.textureSampleCount,
    instructionCount: statsRecord.instructionCount,
    nodeCount: graph.nodeCount,
    parameterCount: graph.parameterCount,
    parameters: graph.parameters,
    wpoUsed: wpo,
    pdoUsed: pdo,
    displacementUsed: displacement,
    parameterOverrides: cleanObject({
      scalar: scalarOverrides,
      vector: vectorOverrides,
      texture: textureOverrides,
      staticSwitch: staticSwitchOverrides,
      staticComponentMask: staticMaskOverrides
    }),
    warnings
  }, {
    objectPath,
    className: asString(objectSummary.className),
    classPath: asString(objectSummary.classPath),
    warnings
  });
}

async function buildStaticMeshSummary(args: InspectArgs, tools: ITools): Promise<Record<string, unknown>> {
  const objectPath = asString(args.objectPath) ?? asString(args.meshPath) ?? await resolveObjectPath(args, tools) ?? '';
  if (!objectPath) {
    throw new Error('meshPath or objectPath is required');
  }

  const warnings: string[] = [];
  const objectSummary = await buildObjectSummary({ ...args, objectPath }, tools);
  const naniteSettings = await tryReadPropertyValue(tools, objectPath, 'NaniteSettings', warnings);
  const staticMaterials = await tryReadPropertyValue(tools, objectPath, 'StaticMaterials', warnings);
  const sourceModels = await tryReadPropertyValue(tools, objectPath, 'SourceModels', warnings);

  const materialSlots = summarizeStaticMaterials(staticMaterials);
  const lodCount = Array.isArray(sourceModels) ? sourceModels.length : undefined;
  if (!Array.isArray(sourceModels)) {
    warnings.push(`LOD details for '${objectPath}' were not available; section counts may be incomplete.`);
  }

  return normalizeInspectionEnvelope({
    success: objectSummary.success !== false,
    summaryType: 'static_mesh',
    objectSummary,
    naniteEnabled: toRecord(naniteSettings).bEnabled ?? toRecord(naniteSettings).Enabled,
    naniteSettings,
    lodCount,
    sourceModels,
    sectionCountByLod: Array.isArray(sourceModels)
      ? sourceModels.map((entry, index) => cleanObject({ index, sectionCount: toRecord(entry).SectionInfoMap ? undefined : undefined }))
      : [],
    materialSlots,
    slotCount: materialSlots.length,
    warnings
  }, {
    objectPath,
    className: asString(objectSummary.className),
    classPath: asString(objectSummary.classPath),
    warnings
  });
}

function normalizeMaterialClassification(blendMode: unknown): string {
  const normalized = String(blendMode ?? '').toLowerCase();
  if (normalized.includes('masked')) return 'masked';
  if (normalized.includes('translucent') || normalized.includes('additive') || normalized.includes('modulate')) return 'translucent';
  return 'opaque';
}

async function buildRendererPairSummary(args: InspectArgs, tools: ITools): Promise<Record<string, unknown>> {
  const meshPath = asString(args.meshPath) ?? asString(args.objectPath) ?? '';
  const materialPath = asString(args.materialPath) ?? asString(args.objectPath) ?? '';
  if (!meshPath || !materialPath) {
    throw new Error('meshPath and materialPath are required');
  }

  const meshSummary = await buildStaticMeshSummary({ ...args, objectPath: meshPath }, tools);
  const materialSummary = await buildMaterialSummary({ ...args, objectPath: materialPath }, tools);
  const warnings = [
    ...(Array.isArray(meshSummary.warnings) ? meshSummary.warnings as string[] : []),
    ...(Array.isArray(materialSummary.warnings) ? materialSummary.warnings as string[] : [])
  ];

  const materialClass = normalizeMaterialClassification(materialSummary.blendMode);
  const naniteEnabled = Boolean(meshSummary.naniteEnabled);
  const wpoUsed = Boolean(materialSummary.wpoUsed);
  const pdoUsed = Boolean(materialSummary.pdoUsed);
  const slotCount = typeof meshSummary.slotCount === 'number' ? meshSummary.slotCount : 0;

  if (naniteEnabled && materialClass === 'translucent') {
    warnings.push('Nanite mesh paired with a translucent-style material may route through unsupported or divergent renderer paths.');
  }
  if (naniteEnabled && (wpoUsed || pdoUsed)) {
    warnings.push('Nanite mesh uses a material with WPO/PDO-like traits; validate runtime behavior and shader permutations.');
  }
  if (!slotCount) {
    warnings.push('Mesh slot layout could not be fully determined.');
  }

  const evidence = [
    `materialClass=${materialClass}`,
    `naniteEnabled=${naniteEnabled}`,
    `wpoUsed=${wpoUsed}`,
    `pdoUsed=${pdoUsed}`,
    `slotCount=${slotCount}`
  ];
  const confidence = warnings.length === 0 ? 'high' : warnings.length <= 2 ? 'medium' : 'low';

  return normalizeInspectionEnvelope({
    success: meshSummary.success !== false && materialSummary.success !== false,
    summaryType: 'renderer_pair',
    meshSummary,
    materialSummary,
    materialClassification: materialClass,
    naniteEnabled,
    wpoUsed,
    pdoUsed,
    confidence,
    evidence,
    naniteCompatibility: naniteEnabled && materialClass === 'translucent' ? 'risky' : naniteEnabled ? 'compatible_with_caveats' : 'not_applicable',
    lumenRisk: materialClass !== 'opaque' || pdoUsed || wpoUsed ? 'elevated' : 'normal',
    likelyLumenRisk: materialClass !== 'opaque' || pdoUsed || wpoUsed,
    warnings
  }, { warnings });
}

async function buildComponentRenderState(args: InspectArgs, tools: ITools): Promise<Record<string, unknown>> {
  const componentObjectPath = await resolveComponentObjectPathFromArgs(args, tools);
  const warnings: string[] = ['World selection currently defaults to the active editor context unless PIE is explicitly resolved by the bridge.'];
  const componentDetails = await executeInspectAction(tools, 'inspect_object', {
    objectPath: componentObjectPath,
    detailed: true
  });
  const staticMesh = await tryReadPropertyValue(tools, componentObjectPath, 'StaticMesh', warnings);
  const overrideMaterials = await tryReadPropertyValue(tools, componentObjectPath, 'OverrideMaterials', warnings);
  const visible = await tryReadPropertyValue(tools, componentObjectPath, 'bVisible', warnings);
  const mobility = await tryReadPropertyValue(tools, componentObjectPath, 'Mobility', warnings);

  return normalizeInspectionEnvelope({
    success: componentDetails.success !== false,
    summaryType: 'component_render_state',
    actorName: asString(args.actorName) ?? asString(componentDetails.ownerActorPath) ?? asString(args.objectPath)?.split('.')[0],
    componentName: asString(componentDetails.objectName) ?? asString(args.componentName),
    componentPath: componentObjectPath,
    objectSummary: componentDetails,
    currentMesh: staticMesh,
    currentMaterials: overrideMaterials,
    visible,
    mobility,
    worldType: asString(args.worldType) ?? 'auto',
    fallbackMaterialDetected: undefined,
    warnings
  }, {
    objectPath: componentObjectPath,
    className: asString(componentDetails.className),
    classPath: asString(componentDetails.classPath),
    warnings
  });
}

async function buildActorRenderSummary(args: InspectArgs, tools: ITools): Promise<Record<string, unknown>> {
  const actorName = await resolveObjectPath(args, tools, { pathKeys: [], actorKeys: ['actorName', 'name', 'objectPath'] });
  if (!actorName) {
    throw new Error('actorName is required');
  }

  const componentsResponse = await executeInspectAction(tools, 'get_components', { actorName, objectPath: actorName });
  const components = Array.isArray(componentsResponse.components) ? componentsResponse.components as ComponentInfo[] : [];
  const renderComponents = await Promise.all(
    components
      .filter((component) => typeof component.class === 'string' && /mesh|primitive|instanced/i.test(component.class))
      .map(async (component) => buildComponentRenderState({
        actorName,
        componentName: component.name,
        componentPath: component.objectPath,
        objectPath: component.objectPath
      }, tools))
  );

  return normalizeInspectionEnvelope({
    success: true,
    summaryType: 'actor_render_summary',
    actorName,
    componentCount: components.length,
    renderComponentCount: renderComponents.length,
    components: renderComponents,
    warnings: renderComponents.flatMap((component) => Array.isArray(component.warnings) ? component.warnings as string[] : [])
  }, { objectPath: actorName });
}

async function findComponentsByAsset(
  args: InspectArgs,
  tools: ITools,
  selector: 'mesh' | 'material'
): Promise<Record<string, unknown>> {
  const targetPath = selector === 'mesh'
    ? asString(args.meshPath) ?? asString(args.objectPath)
    : asString(args.materialPath) ?? asString(args.objectPath);

  if (!targetPath) {
    throw new Error(`${selector}Path is required`);
  }

  const objectsResponse = await executeInspectAction(tools, 'list_objects', {});
  const objects = Array.isArray(objectsResponse.objects) ? objectsResponse.objects as Array<Record<string, unknown>> : [];
  const matches: Record<string, unknown>[] = [];

  for (const object of objects) {
    const actorName = asString(object.name) ?? asString(object.path);
    if (!actorName) continue;

    const actorSummary = await buildActorRenderSummary({ actorName }, tools);
    const components = Array.isArray(actorSummary.components) ? actorSummary.components as Array<Record<string, unknown>> : [];
    for (const component of components) {
      if (selector === 'mesh' && component.currentMesh === targetPath) {
        matches.push(component);
        continue;
      }

      if (selector === 'material') {
        const materials = Array.isArray(component.currentMaterials) ? component.currentMaterials : [];
        if (materials.includes(targetPath)) {
          matches.push(component);
        }
      }
    }
  }

  return normalizeInspectionEnvelope({
    success: true,
    summaryType: selector === 'mesh' ? 'components_by_mesh' : 'components_by_material',
    targetPath,
    count: matches.length,
    components: matches,
    warnings: ['Runtime component search currently scans the active editor world via list_objects and get_components.']
  });
}

async function buildViewportRenderSummary(args: InspectArgs, tools: ITools): Promise<Record<string, unknown>> {
  const viewport = await executeInspectAction(tools, 'get_viewport_info', {});
  const world = await executeInspectAction(tools, 'get_world_settings', {});
  const scene = await executeInspectAction(tools, 'get_scene_stats', {});
  const performance = await executeInspectAction(tools, 'get_performance_stats', {});
  const warnings: string[] = [];

  if (typeof performance.message === 'string' && performance.message.toLowerCase().includes('placeholder')) {
    warnings.push('Performance stats are still placeholder bridge values.');
  }

  return normalizeInspectionEnvelope({
    success: viewport.success !== false,
    summaryType: 'viewport_render_summary',
    viewport,
    world,
    scene,
    performance,
    mode: asString(args.worldType) ?? 'auto',
    warnings
  }, { warnings });
}

async function compareMeshMaterialLayout(args: InspectArgs, tools: ITools): Promise<Record<string, unknown>> {
  const sourceMeshPath = asString(args.sourceMeshPath) ?? asString(args.meshPath) ?? asString(args.objectPath);
  const replacementMeshPath = asString(args.replacementMeshPath);
  if (!sourceMeshPath || !replacementMeshPath) {
    throw new Error('sourceMeshPath and replacementMeshPath are required');
  }

  const source = await buildStaticMeshSummary({ ...args, objectPath: sourceMeshPath }, tools);
  const replacement = await buildStaticMeshSummary({ ...args, objectPath: replacementMeshPath }, tools);
  const sourceSlots = Array.isArray(source.materialSlots) ? source.materialSlots as Array<Record<string, unknown>> : [];
  const replacementSlots = Array.isArray(replacement.materialSlots) ? replacement.materialSlots as Array<Record<string, unknown>> : [];
  const sourceNames = sourceSlots.map((slot) => asString(slot.slotName) ?? '').filter(Boolean);
  const replacementNames = replacementSlots.map((slot) => asString(slot.slotName) ?? '').filter(Boolean);

  return normalizeInspectionEnvelope({
    success: source.success !== false && replacement.success !== false,
    summaryType: 'mesh_layout_comparison',
    sourceMesh: source,
    replacementMesh: replacement,
    sourceSlotCount: sourceSlots.length,
    replacementSlotCount: replacementSlots.length,
    slotCountMatches: sourceSlots.length === replacementSlots.length,
    missingSlotNames: sourceNames.filter((name) => !replacementNames.includes(name)),
    addedSlotNames: replacementNames.filter((name) => !sourceNames.includes(name)),
    warnings: [
      ...(Array.isArray(source.warnings) ? source.warnings as string[] : []),
      ...(Array.isArray(replacement.warnings) ? replacement.warnings as string[] : [])
    ]
  });
}

async function validateReplacementCompatibility(args: InspectArgs, tools: ITools): Promise<Record<string, unknown>> {
  const comparison = await compareMeshMaterialLayout(args, tools);
  const warnings = Array.isArray(comparison.warnings) ? [...comparison.warnings as string[]] : [];

  if (comparison.slotCountMatches === false) {
    warnings.push('Replacement mesh does not preserve the source material slot count.');
  }

  const sourceMesh = toRecord(comparison.sourceMesh);
  const replacementMesh = toRecord(comparison.replacementMesh);
  if (sourceMesh.naniteEnabled !== replacementMesh.naniteEnabled) {
    warnings.push('Source and replacement meshes differ in Nanite enabled state.');
  }

  const materialMap = isRecord(args.materialMap) ? args.materialMap : {};
  const materialComparisons: Record<string, unknown>[] = [];
  for (const [sourceMaterial, replacementMaterial] of Object.entries(materialMap)) {
    const sourceSummary = await buildMaterialSummary({ objectPath: sourceMaterial }, tools);
    const replacementSummary = await buildMaterialSummary({ objectPath: replacementMaterial }, tools);
    if (sourceSummary.blendMode !== replacementSummary.blendMode) {
      warnings.push(`Material blend mode changed from '${String(sourceSummary.blendMode)}' to '${String(replacementSummary.blendMode)}'.`);
    }
    if (sourceSummary.materialDomain !== replacementSummary.materialDomain) {
      warnings.push(`Material domain changed from '${String(sourceSummary.materialDomain)}' to '${String(replacementSummary.materialDomain)}'.`);
    }
    materialComparisons.push(cleanObject({
      sourceMaterial,
      replacementMaterial,
      sourceSummary,
      replacementSummary
    }) as Record<string, unknown>);
  }

  return normalizeInspectionEnvelope({
    success: comparison.success !== false,
    summaryType: 'replacement_compatibility',
    comparison,
    materialComparisons,
    warnings
  }, { warnings });
}

async function buildAssetDependencySlice(args: InspectArgs, tools: ITools): Promise<Record<string, unknown>> {
  const assetPath = asString(args.objectPath) ?? asString(args.meshPath) ?? asString(args.materialPath) ?? '';
  if (!assetPath) {
    throw new Error('objectPath, meshPath, or materialPath is required');
  }

  const dependencies = await executeAutomationRequest(tools, 'manage_asset', {
    assetPath
    ,
    subAction: 'get_dependencies'
  }) as Record<string, unknown>;

  const rawDependencies = Array.isArray(dependencies.dependencies)
    ? dependencies.dependencies as Array<Record<string, unknown>>
    : Array.isArray((dependencies.result as Record<string, unknown> | undefined)?.dependencies)
      ? (dependencies.result as Record<string, unknown>).dependencies as Array<Record<string, unknown>>
      : [];
  const mountRoot = asString(args.mountRoot) ?? getMountRoot(assetPath);
  const dependencyGroups = groupDependenciesByType(rawDependencies, mountRoot);
  const dependencyCounts = Object.fromEntries(
    Object.entries(dependencyGroups).map(([key, values]) => [key, values.length])
  );
  const scopedDependencies = Object.values(dependencyGroups).flat();

  return normalizeInspectionEnvelope({
    success: dependencies.success !== false,
    summaryType: 'asset_dependency_slice',
    assetPath,
    mountRoot,
    totalDependencies: rawDependencies.length,
    scopedDependencyCount: scopedDependencies.length,
    dependencyGroups,
    dependencyCounts,
    dependencies
  }, { objectPath: assetPath });
}

async function buildShaderArtifactSummary(args: InspectArgs, _tools: ITools): Promise<Record<string, unknown>> {
  const project = findProjectContext();
  const objectPath = asString(args.objectPath);
  const mountRoot = asString(args.mountRoot) ?? getMountRoot(objectPath);
  const pluginName = asString(args.pluginName);
  const descriptor = findPluginDescriptorByRoot(project.repoRoot, mountRoot) ?? findPluginDescriptorByName(project.repoRoot, pluginName);
  const searchRoots = [
    descriptor?.contentRoot ? path.join(descriptor.contentRoot, 'Shaders') : undefined,
    descriptor?.contentRoot,
    objectPath && project.projectName ? path.join(project.repoRoot, 'Mods', mountRoot?.replace(/^\//, '') ?? '', 'Content') : undefined
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);

  const files = searchRoots.flatMap((rootDir) => walkFiles(
    rootDir,
    (filePath) => filePath.toLowerCase().endsWith('.assetinfo.json'),
    50
  )).filter((filePath, index, all) => all.indexOf(filePath) === index);

  const artifacts = files.map((filePath) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    } catch {
      parsed = undefined;
    }

    const stats = fs.statSync(filePath);
    const linkedAssetPaths = new Set<string>();
    collectMountedPaths(parsed, linkedAssetPaths);
    const fileName = path.basename(filePath);
    const shaderStem = fileName
      .replace(/^ShaderAssetInfo-/i, '')
      .replace(/\.assetinfo\.json$/i, '');

    return cleanObject({
      fileName,
      filePath,
      relativePath: path.relative(project.repoRoot, filePath),
      shaderStem,
      sizeBytes: stats.size,
      modifiedAt: stats.mtime.toISOString(),
      linkedAssetPaths: [...linkedAssetPaths],
      jsonKeys: isRecord(parsed) ? Object.keys(parsed).slice(0, 20) : [],
      platformHint: shaderStem.split('-').slice(1).join('-') || undefined
    }) as Record<string, unknown>;
  });

  return normalizeInspectionEnvelope({
    success: true,
    summaryType: 'shader_artifact_summary',
    mountRoot,
    pluginName: descriptor?.pluginName ?? pluginName,
    shaderArtifactCount: artifacts.length,
    shaderArtifacts: artifacts,
    warnings: artifacts.length === 0
      ? ['No shader artifact metadata files were found under the resolved content roots.']
      : []
  }, {
    objectPath,
    warnings: artifacts.length === 0
      ? ['No shader artifact metadata files were found under the resolved content roots.']
      : []
  });
}

async function buildModRenderDebugReport(args: InspectArgs, tools: ITools): Promise<Record<string, unknown>> {
  const modSummary = await handleInspectTools('get_mod_summary', args, tools);
  const modRecord = toRecord(modSummary);
  const mountRoot = asString(args.mountRoot) ?? asString(modRecord.mountRoot);
  const meshAssets = mountRoot ? getAssetsFromSearchResponse(await searchAssetsByMountRoot(tools, mountRoot, ['StaticMesh'], 10)) : [];
  const materialAssets = mountRoot ? getAssetsFromSearchResponse(await searchAssetsByMountRoot(tools, mountRoot, ['Material', 'MaterialInstanceConstant'], 10)) : [];

  const meshSummaries = await Promise.all(meshAssets.slice(0, 3).map(async (asset) => buildStaticMeshSummary({
    objectPath: asString(asset.path) ?? asString(asset.objectPath) ?? ''
  }, tools)));
  const materialSummaries = await Promise.all(materialAssets.slice(0, 3).map(async (asset) => buildMaterialSummary({
    objectPath: asString(asset.path) ?? asString(asset.objectPath) ?? ''
  }, tools)));
  const shaderArtifacts = await buildShaderArtifactSummary({
    ...args,
    mountRoot,
    pluginName: asString(args.pluginName) ?? asString(modRecord.pluginName)
  }, tools);
  const sampledDependencySlices = await Promise.all(
    [...meshAssets.slice(0, 2), ...materialAssets.slice(0, 2)].map(async (asset) => buildAssetDependencySlice({
      objectPath: asString(asset.path) ?? asString(asset.objectPath) ?? '',
      mountRoot
    }, tools))
  );
  const renderLogs = await executeSystemAction(tools, 'tail_render_errors', {
    filter: asString(args.filter) ?? asString(args.pluginName) ?? mountRoot,
    logPath: args.logPath,
    maxLines: args.maxLines ?? 200
  });

  const issues: DiagnosticIssue[] = [];
  if (!mountRoot) {
    issues.push(createDiagnosticIssue('mount_root', 'Mount root could not be resolved for the mod report.', 'error'));
  }
  if ((shaderArtifacts.shaderArtifactCount as number | undefined) === 0) {
    issues.push(createDiagnosticIssue('shader_artifacts', 'No shader artifact metadata files were discovered for the resolved mod content.', 'warning'));
  }

  return normalizeInspectionEnvelope({
    success: modRecord.success !== false,
    summaryType: 'mod_render_debug_report',
    mountRoot,
    modSummary,
    sampledMeshes: meshSummaries,
    sampledMaterials: materialSummaries,
    shaderArtifacts,
    sampledDependencySlices,
    renderLogs,
    issues,
    warnings: issues.map((issue) => issue.message)
  }, { warnings: issues.map((issue) => issue.message) });
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
  'inspect_class': 'describe_class',
  'get_project_settings': 'get_project_settings',
  'get_editor_settings': 'get_editor_settings',
  'get_performance_stats': 'get_performance_stats',
  'get_memory_stats': 'get_memory_stats',
  'get_scene_stats': 'get_scene_stats',
  'get_viewport_info': 'get_viewport_info',
  'get_selected_actors': 'get_selected_actors',
  'get_mount_points': 'get_mount_points',
};

/**
 * Normalize inspect action names for test compatibility
 */
export function normalizeInspectAction(action: string): string {
  return INSPECT_ACTION_ALIASES[action] ?? action;
}

export function looksLikeMountedObjectPath(value: string | undefined): boolean {
  if (!value) return false;
  return /^\/[A-Za-z_][A-Za-z0-9_]*(?:\/|$)/.test(value);
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
          return normalizeInspectionEnvelope({
            success: false,
            handled: true,
            notFound: true,
            error: res.error,
            message: res.message || 'Object not found'
          }, { objectPath });
        }
      }

      return normalizeInspectionEnvelope(res, { objectPath });
    }
    case 'get_property': {
      const objectPath = await resolveObjectPath(args, tools);
      const params = normalizeArgs(args, [{ key: 'propertyName', aliases: ['propertyPath'], required: true }]);
      const propertyName = extractString(params, 'propertyName');

      if (!objectPath) {
        throw new Error('Invalid objectPath: must be a non-empty string');
      }

      const res = await readPropertyValue(tools, objectPath, propertyName);

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
                return normalizeInspectionEnvelope({
                  ...propRes,
                  message: `Resolved property '${propertyName}' on RootComponent (Smart Lookup)`,
                  foundOnComponent: 'RootComponent'
                }, {
                  objectPath: rootPath,
                  propertyPath: propertyName
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
                  return normalizeInspectionEnvelope({
                    ...compRes,
                    message: `Resolved property '${propertyName}' on component '${comp.name}' (Smart Lookup)`,
                    foundOnComponent: comp.name
                  }, {
                    objectPath: compPath,
                    propertyPath: propertyName
                  });
                }
              }
              // End of loop - if we're here, nothing found
              return normalizeInspectionEnvelope({
                ...res,
                message: (res.message as string) + ` (Smart Lookup failed. Tried: ${triedPathsInner.length} paths. First: ${triedPathsInner[0]}. Components: ${list.map((c) => c.name).join(',')})`,
                smartLookupTriedPaths: triedPathsInner
              }, {
                objectPath,
                propertyPath: propertyName
              });
            } else {
              return normalizeInspectionEnvelope({
                ...res,
                message: (res.message as string) + ' (Smart Lookup failed: get_components returned ' + (compsRes.success ? 'success but no list' : 'failure: ' + compsRes.error) + ' | Name: ' + shortName + ' Path: ' + actorName + ')',
                smartLookupGetComponentsError: compsRes
              }, {
                objectPath,
                propertyPath: propertyName
              });
            }
          } catch (_e: unknown) {
            const errorMsg = _e instanceof Error ? _e.message : String(_e);
            return normalizeInspectionEnvelope({
              ...res,
              message: (res.message as string) + ' (Smart Lookup exception: ' + errorMsg + ')',
              error: res.error
            }, {
              objectPath,
              propertyPath: propertyName
            });
          }
        }
      }
      return normalizeInspectionEnvelope(res, {
        objectPath,
        propertyPath: propertyName
      });
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
      const objectPath = await resolveObjectPath(args, tools);
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
    case 'ensure_mod_config_section':
    case 'delete_mod_config_property':
    case 'delete_mod_config_section': {
      const objectPath = await resolveObjectPath(args, tools);
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
    case 'rename_mod_config_property':
    case 'move_mod_config_property': {
      const objectPath = await resolveObjectPath(args, tools);
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
      const objectPath = await resolveObjectPath(args, tools);
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
      const objectPath = await resolveObjectPath(args, tools);
      if (!objectPath) {
        throw new Error('Invalid objectPath: must be a non-empty string');
      }

      const res = await executeAutomationRequest(tools, 'inspect', {
        action: 'get_mod_config_tree',
        objectPath
      }) as InspectResponse;

      return cleanObject(res);
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
      return cleanObject({
        success: true,
        valid: issues.filter((issue) => issue.severity === 'error').length === 0,
        descriptorCount: descriptor.length,
        issues
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
      const descriptorIssues: DiagnosticIssue[] = [];
      if (!summary.canContainContent) descriptorIssues.push(createDiagnosticIssue('descriptor', 'Plugin descriptor does not declare CanContainContent=true'));
      if (!Array.isArray(summary.modules) || (summary.modules as unknown[]).length === 0) descriptorIssues.push(createDiagnosticIssue('descriptor', 'Plugin has no declared modules'));
      if (!summary.versionName) descriptorIssues.push(createDiagnosticIssue('descriptor', 'Plugin descriptor is missing VersionName'));

      const runtimeVerification = normalizedAction === 'postlaunch_mod_check'
        ? await handleInspectTools('verify_mod_runtime', { mountRoot: descriptor.mountRoot, pluginName: descriptor.pluginName }, tools)
        : undefined;
      const shaderArtifacts = normalizedAction === 'postlaunch_mod_check' || normalizedAction === 'prebuild_mod_check'
        ? await buildShaderArtifactSummary({ mountRoot: descriptor.mountRoot, pluginName: descriptor.pluginName }, tools)
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
        shaderArtifacts,
        issues: descriptorIssues,
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
    case 'validate_mod_runtime':
    case 'verify_mod_runtime': {
      const summary = await handleInspectTools('get_mod_summary', args, tools);
      const summaryRecord = summary as Record<string, unknown>;
      const configBlueprints = Array.isArray(summaryRecord.configBlueprintCandidates) ? summaryRecord.configBlueprintCandidates as Array<Record<string, unknown>> : [];
      const widgetBlueprints = Array.isArray(summaryRecord.widgetBlueprintCandidates) ? summaryRecord.widgetBlueprintCandidates as Array<Record<string, unknown>> : [];
      const plugin = summaryRecord.plugin as Record<string, unknown> | undefined;

      const configChecks = await Promise.all(configBlueprints.slice(0, 5).map(async (entry) => {
        const objectPath = typeof entry.path === 'string' ? entry.path : '';
        return await handleInspectTools('verify_class_loadability', { objectPath }, tools);
      }));
      const widgetChecks = await Promise.all(widgetBlueprints.slice(0, 5).map(async (entry) => {
        const objectPath = typeof entry.path === 'string' ? entry.path : '';
        return await handleInspectTools('verify_widget_loadability', { objectPath }, tools);
      }));
      const objectChecks = await handleInspectTools('find_mod_objects', {
        filter: typeof plugin?.pluginName === 'string' ? plugin.pluginName : undefined
      }, tools);
      const logChecks = await executeAutomationRequest(tools, 'system_control', {
        action: 'tail_logs',
        filter: typeof plugin?.pluginName === 'string' ? plugin.pluginName : undefined,
        maxLines: 100
      }) as Record<string, unknown>;
      const issues: DiagnosticIssue[] = [];
      for (const check of [...configChecks, ...widgetChecks]) {
        const record = toRecord(check);
        if (record.loadable === false || record.success === false) {
          issues.push(createDiagnosticIssue('runtime_loadability', `Failed runtime loadability verification for '${String(record.target ?? record.widgetPath ?? 'unknown')}'.`, 'error', record));
        }
      }
      if ((objectChecks as Record<string, unknown>).count === 0) {
        issues.push(createDiagnosticIssue('runtime_objects', 'No live objects were discovered for the current plugin filter.', 'warning'));
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
    case 'describe_class': {
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
        action: 'describe_class',
        className
      }) as InspectResponse;
      if (!res || res.success === false) {
        // If first try failed and it looked like a short name, maybe try standard engine path?
        const originalClassName = typeof argsTyped.className === 'string' ? argsTyped.className : '';
        if (originalClassName && !originalClassName.includes('/') && !className.startsWith('/Script/')) {
          const retryName = `/Script/Engine.${originalClassName}`;
          const resRetry = await executeAutomationRequest(tools, 'inspect', {
            action: 'describe_class',
            className: retryName
          }) as InspectResponse;
          if (resRetry && resRetry.success) {
            return normalizeInspectionEnvelope(resRetry, { className: retryName });
          }
        }

        // Return proper failure state
        return normalizeInspectionEnvelope({
          success: false,
          error: res?.error || 'OPERATION_FAILED',
          message: res?.message || `describe_class failed for '${className}'`,
          className,
          cdo: res?.cdo ?? null
        }, { className });
      }
      return normalizeInspectionEnvelope(res, { className });
    }
    case 'list_properties': {
      const description = await handleInspectTools('describe_class', args, tools);
      const record = toRecord(description);
      return normalizeInspectionEnvelope({
        success: record.success !== false,
        className: record.className,
        classPath: record.classPath,
        parentClass: record.parentClass,
        propertyCount: Array.isArray(record.properties) ? record.properties.length : 0,
        properties: record.properties ?? [],
        warnings: record.warnings
      }, {
        className: asString(record.className),
        classPath: asString(record.classPath),
        warnings: Array.isArray(record.warnings) ? record.warnings as string[] : []
      });
    }
    case 'get_object_summary':
      return await buildObjectSummary(argsTyped, tools);
    case 'get_material_summary':
    case 'get_material_instance_summary':
      return await buildMaterialSummary(argsTyped, tools);
    case 'get_static_mesh_summary':
      return await buildStaticMeshSummary(argsTyped, tools);
    case 'get_renderer_pair_summary':
      return await buildRendererPairSummary(argsTyped, tools);
    case 'find_components_by_mesh':
      return await findComponentsByAsset(argsTyped, tools, 'mesh');
    case 'find_components_by_material':
      return await findComponentsByAsset(argsTyped, tools, 'material');
    case 'get_component_render_state':
      return await buildComponentRenderState(argsTyped, tools);
    case 'get_actor_render_summary':
      return await buildActorRenderSummary(argsTyped, tools);
    case 'get_viewport_render_summary':
      return await buildViewportRenderSummary(argsTyped, tools);
    case 'compare_mesh_material_layout':
      return await compareMeshMaterialLayout(argsTyped, tools);
    case 'validate_replacement_compatibility':
      return await validateReplacementCompatibility(argsTyped, tools);
    case 'get_mod_render_debug_report':
      return await buildModRenderDebugReport(argsTyped, tools);
    case 'get_asset_dependency_slice':
      return await buildAssetDependencySlice(argsTyped, tools);
    case 'get_shader_artifact_summary':
      return await buildShaderArtifactSummary(argsTyped, tools);
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


import { cleanObject } from '../../utils/safe-json.js';
import { ITools } from '../../types/tool-interfaces.js';
import type { HandlerArgs, BlueprintArgs } from '../../types/handler-types.js';
import { executeAutomationRequest } from './common-handlers.js';
import { normalizeMountedAssetPath } from '../../utils/validation.js';
import { deriveBlueprintVariants, getMountRoot } from './modding-utils.js';


/**
 * Normalize blueprint path by converting backslashes to forward slashes.
 * This ensures consistent path handling across all blueprint operations.
 */
function normalizeBlueprintPath(path: string | undefined): string | undefined {
  if (!path || typeof path !== 'string') return path;
  return normalizeMountedAssetPath(path);
}

function hasBlueprintPathTraversal(path: string | undefined): boolean {
  if (!path) return false;
  return path.split('/').some((segment) => segment === '..');
}

function normalizeConnectPinsArgs(argsRecord: Record<string, unknown>): { normalized: Record<string, unknown>; errors: string[] } {
  const normalized: Record<string, unknown> = { ...argsRecord };
  const pickString = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const value = argsRecord[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
    return undefined;
  };

  const splitNodePin = (value: string | undefined): { nodeId?: string; pinName?: string } => {
    if (!value) return {};
    const dotIndex = value.indexOf('.');
    if (dotIndex <= 0 || dotIndex >= value.length - 1) {
      return { nodeId: value };
    }
    return {
      nodeId: value.slice(0, dotIndex),
      pinName: value.slice(dotIndex + 1)
    };
  };

  const fromSplit = splitNodePin(pickString('fromNodeId', 'sourceNode', 'sourceNodeId'));
  const toSplit = splitNodePin(pickString('toNodeId', 'targetNode', 'targetNodeId'));

  const fromNodeId = fromSplit.nodeId;
  const toNodeId = toSplit.nodeId;
  const fromPinName = pickString('fromPinName', 'fromPin', 'sourcePin', 'sourcePinName', 'outputPin') ?? fromSplit.pinName;
  const toPinName = pickString('toPinName', 'toPin', 'targetPin', 'targetPinName', 'inputPin') ?? toSplit.pinName;

  if (fromNodeId) normalized.fromNodeId = fromNodeId;
  if (toNodeId) normalized.toNodeId = toNodeId;
  if (fromPinName) normalized.fromPinName = fromPinName;
  if (toPinName) normalized.toPinName = toPinName;

  const errors: string[] = [];
  if (!fromNodeId) errors.push('Missing source node. Use fromNodeId/sourceNode/sourceNodeId.');
  if (!toNodeId) errors.push('Missing target node. Use toNodeId/targetNode/targetNodeId.');
  if (!fromPinName) errors.push('Missing source pin. Use fromPinName/fromPin/sourcePin/sourcePinName/outputPin or Node.Pin.');
  if (!toPinName) errors.push('Missing target pin. Use toPinName/toPin/targetPin/targetPinName/inputPin or Node.Pin.');

  return { normalized, errors };
}

async function getCommentGroups(
  tools: ITools,
  blueprintPath: string,
  graphName?: string,
): Promise<Array<Record<string, unknown>>> {
  const res = await executeAutomationRequest(tools, 'manage_blueprint_graph', {
    subAction: 'list_comment_groups',
    blueprintPath,
    assetPath: blueprintPath,
    graphName
  }) as Record<string, unknown>;
  return Array.isArray(res.commentGroups) ? res.commentGroups as Array<Record<string, unknown>> : [];
}

async function getGraphDetails(
  tools: ITools,
  blueprintPath: string,
  graphName?: string,
): Promise<Record<string, unknown>> {
  return await executeAutomationRequest(tools, 'manage_blueprint_graph', {
    subAction: 'get_graph_details',
    blueprintPath,
    assetPath: blueprintPath,
    graphName
  }) as Record<string, unknown>;
}

async function getGraphTopologyDetails(
  tools: ITools,
  blueprintPath: string,
  graphName?: string,
  includeSubGraphs?: boolean,
): Promise<Record<string, unknown>> {
  const rootGraph = await getGraphDetails(tools, blueprintPath, graphName);
  if (!includeSubGraphs) {
    return rootGraph;
  }

  const graphList = await executeAutomationRequest(tools, 'manage_blueprint_graph', {
    subAction: 'list_graphs',
    blueprintPath,
    assetPath: blueprintPath,
    graphName
  }) as Record<string, unknown>;
  const graphs = Array.isArray(graphList.graphs) ? graphList.graphs as Array<Record<string, unknown>> : [];

  const allGraphDetails = await Promise.all(graphs.map(async (graph) => {
    const currentGraphName = extractString(graph.graphName);
    if (!currentGraphName) return undefined;
    return await getGraphDetails(tools, blueprintPath, currentGraphName);
  }));

  const validGraphDetails = allGraphDetails.filter((entry): entry is Record<string, unknown> => Boolean(entry));
  const nodes = validGraphDetails.flatMap((entry) =>
    Array.isArray(entry.nodes) ? entry.nodes as Array<Record<string, unknown>> : []
  );
  const commentGroups = validGraphDetails.flatMap((entry) =>
    Array.isArray(entry.commentGroups) ? entry.commentGroups as Array<Record<string, unknown>> : []
  );
  const graphSummaries = validGraphDetails.map((entry) => {
    const entryNodes = Array.isArray(entry.nodes) ? entry.nodes as Array<Record<string, unknown>> : [];
    const entryCommentGroups = Array.isArray(entry.commentGroups) ? entry.commentGroups as Array<Record<string, unknown>> : [];
    return cleanObject({
      graphName: entry.graphName,
      graphPath: entry.graphPath,
      nodeCount: entryNodes.length,
      commentGroupCount: entryCommentGroups.length,
      connectionCount: deriveConnectionsFromNodes(entryNodes).length
    }) as Record<string, unknown>;
  });

  return cleanObject({
    ...rootGraph,
    includeSubGraphs: true,
    graphCount: validGraphDetails.length,
    graphs: graphSummaries,
    nodes,
    commentGroups,
    totalNodeCount: nodes.length,
    totalCommentGroupCount: commentGroups.length
  }) as Record<string, unknown>;
}

function deriveConnectionsFromNodes(nodes: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const seen = new Set<string>();
  const connections: Array<Record<string, unknown>> = [];

  for (const node of nodes) {
    const fromNodeId = extractString(node.nodeId);
    const fromNodeName = extractString(node.nodeName);
    const fromNodeTitle = extractString(node.nodeTitle);
    const graphName = extractString(node.graphName);
    const pins = Array.isArray(node.pins) ? node.pins as Array<Record<string, unknown>> : [];
    for (const pin of pins) {
      const fromPinName = extractString(pin.pinName);
      const direction = extractString(pin.direction)?.toLowerCase();
      if (!fromNodeId || !fromPinName || direction !== 'output') continue;
      const linkedTo = Array.isArray(pin.linkedTo) ? pin.linkedTo as Array<Record<string, unknown>> : [];
      for (const link of linkedTo) {
        const toNodeId = extractString(link.nodeId);
        const toPinName = extractString(link.pinName);
        if (!toNodeId || !toPinName) continue;
        const key = `${fromNodeId}:${fromPinName}->${toNodeId}:${toPinName}`;
        if (seen.has(key)) continue;
        seen.add(key);
        connections.push(cleanObject({
          fromNodeId,
          fromNodeName,
          fromNodeTitle,
          fromPinName,
          toNodeId,
          toNodeName: extractString(link.nodeName),
          toNodeTitle: extractString(link.nodeTitle),
          toPinName,
          graphName,
          pinType: extractString(pin.pinType)
        }) as Record<string, unknown>);
      }
    }
  }

  return connections;
}

function extractString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export async function handleBlueprintTools(action: string, args: HandlerArgs, tools: ITools): Promise<Record<string, unknown>> {
  const argsTyped = args as BlueprintArgs;
  const argsRecord = args as Record<string, unknown>;
  
  // Normalize any blueprintPath in the arguments
  if (argsTyped.blueprintPath) {
    argsTyped.blueprintPath = normalizeBlueprintPath(argsTyped.blueprintPath);
  }
  if (argsRecord.path) {
    argsRecord.path = normalizeBlueprintPath(argsRecord.path as string);
  }
  // SECURITY: Normalize assetPath as well
  if (argsRecord.assetPath) {
    argsRecord.assetPath = normalizeBlueprintPath(argsRecord.assetPath as string);
  }

  const isUnsafePath = (value: unknown): boolean => typeof value === 'string' && hasBlueprintPathTraversal(value);
  if (isUnsafePath(argsTyped.blueprintPath) || isUnsafePath(argsRecord.path) || isUnsafePath(argsRecord.assetPath)) {
    return cleanObject({
      success: false,
      error: 'INVALID_BLUEPRINT_PATH',
      message: 'Blueprint path blocked for security: traversal segments detected'
    }) as Record<string, unknown>;
  }
  
  switch (action) {
    case 'get_connections':
    case 'get_graph_topology': {
      const blueprintPath = argsTyped.blueprintPath || (argsRecord.path as string | undefined) || argsTyped.name;
      if (!blueprintPath) {
        return cleanObject({
          success: false,
          error: 'INVALID_BLUEPRINT_PATH',
          message: 'blueprintPath, path, or name is required'
        }) as Record<string, unknown>;
      }

      const graphDetails = await getGraphTopologyDetails(
        tools,
        blueprintPath,
        argsTyped.graphName,
        typeof argsRecord.includeSubGraphs === 'boolean' ? argsRecord.includeSubGraphs : false
      );
      const nodes = Array.isArray(graphDetails.nodes) ? graphDetails.nodes as Array<Record<string, unknown>> : [];
      const connections = deriveConnectionsFromNodes(nodes);
      if (action === 'get_connections') {
        return cleanObject({
          success: graphDetails.success !== false,
          blueprintPath,
          graphName: graphDetails.graphName,
          graphPath: graphDetails.graphPath,
          includeSubGraphs: graphDetails.includeSubGraphs,
          connectionCount: connections.length,
          connections,
          message: 'Blueprint graph connections retrieved.'
        }) as Record<string, unknown>;
      }

      const commentGroups = Array.isArray(graphDetails.commentGroups) ? graphDetails.commentGroups : [];
      return cleanObject({
        success: graphDetails.success !== false,
        blueprintPath,
        graphName: graphDetails.graphName,
        graphPath: graphDetails.graphPath,
        includeSubGraphs: graphDetails.includeSubGraphs,
        graphCount: graphDetails.graphCount,
        graphs: graphDetails.graphs,
        nodeCount: nodes.length,
        connectionCount: connections.length,
        commentGroupCount: commentGroups.length,
        nodes,
        connections,
        commentGroups,
        message: 'Blueprint graph topology retrieved.'
      }) as Record<string, unknown>;
    }
    case 'find_nodes_by_title_comment_class': {
      return await handleBlueprintTools('find_nodes', {
        ...args,
        nodeTitle: extractString(argsRecord.nodeTitle) ?? extractString(argsRecord.query),
        commentTitle: extractString(argsRecord.commentTitle),
        commentTag: extractString(argsRecord.commentTag),
        nodeTypeFilter:
          extractString(argsRecord.nodeTypeFilter)
          ?? extractString(argsRecord.nodeType)
          ?? extractString(argsRecord.className),
        includePins: typeof argsRecord.includePins === 'boolean' ? argsRecord.includePins : false,
        includeSubGraphs: typeof argsRecord.includeSubGraphs === 'boolean' ? argsRecord.includeSubGraphs : false
      }, tools);
    }

    case 'list_all_graphs': {
      const blueprintPath = argsTyped.blueprintPath || (argsRecord.path as string | undefined) || argsTyped.name;
      if (!blueprintPath) {
        return cleanObject({
          success: false,
          error: 'INVALID_BLUEPRINT_PATH',
          message: 'blueprintPath, path, or name is required'
        }) as Record<string, unknown>;
      }

      const graphList = await executeAutomationRequest(tools, 'manage_blueprint_graph', {
        subAction: 'list_graphs',
        blueprintPath,
        assetPath: blueprintPath,
        graphName: argsTyped.graphName
      }) as Record<string, unknown>;

      return cleanObject({
        ...graphList,
        message: 'All graphs retrieved.'
      }) as Record<string, unknown>;
    }
    case 'create_add_delegate': {
      const blueprintPath = argsTyped.blueprintPath || (argsRecord.path as string | undefined) || argsTyped.name;
      if (!blueprintPath) {
        return cleanObject({
          success: false,
          error: 'INVALID_BLUEPRINT_PATH',
          message: 'blueprintPath, path, or name is required'
        }) as Record<string, unknown>;
      }

      const targetNodeId = extractString(argsRecord.targetNodeId);
      const delegatePropertyName = extractString(argsRecord.delegatePropertyName);
      const eventNodeId = extractString(argsRecord.eventNodeId);

      if (!targetNodeId || !delegatePropertyName) {
        return cleanObject({
          success: false,
          error: 'INVALID_ARGUMENT',
          message: 'create_add_delegate requires targetNodeId and delegatePropertyName.'
        }) as Record<string, unknown>;
      }

      // 1. Create the AddDelegate node
      const addDelegateResult = await executeAutomationRequest(tools, 'manage_blueprint_graph', {
        subAction: 'create_node',
        blueprintPath,
        assetPath: blueprintPath,
        graphName: argsTyped.graphName,
        nodeType: 'K2Node_AddDelegate',
        posX: argsRecord.posX,
        posY: argsRecord.posY
      }) as Record<string, unknown>;

      if (!addDelegateResult.success) {
         return addDelegateResult;
      }
      const delegateNodeId = extractString(addDelegateResult.nodeId);
      if (!delegateNodeId) return { success: false, message: 'Failed to retrieve AddDelegate node ID.' };

      // 2. We need to tell the AddDelegate node which delegate to bind to.
      // Set the "DelegateReference" or the target object pin.
      // Usually, target pin on AddDelegate is "self" but we need to connect the targetNode's output to the AddDelegate's target input.
      await handleBlueprintTools('connect_pins', {
         blueprintPath,
         graphName: argsTyped.graphName,
         fromNodeId: targetNodeId,
         fromPinName: 'Return Value', // We assume the target node returns the object. Might need more complex logic.
         toNodeId: delegateNodeId,
         toPinName: 'self'
      }, tools);

      // 3. Set the DelegatePropertyName property on the node (might require custom C++ handler support or SetNodeProperty)
      await handleBlueprintTools('set_node_property', {
         blueprintPath,
         nodeGuid: delegateNodeId,
         propertyName: 'DelegatePropertyName',
         propertyValue: delegatePropertyName
      }, tools);

      // 4. If eventNodeId is provided, connect the AddDelegate's Delegate pin to the event node's output delegate pin.
      if (eventNodeId) {
         await handleBlueprintTools('connect_pins', {
            blueprintPath,
            graphName: argsTyped.graphName,
            fromNodeId: delegateNodeId,
            fromPinName: 'Delegate',
            toNodeId: eventNodeId,
            toPinName: 'OutputDelegate'
         }, tools);
      }

      return cleanObject({
        success: true,
        message: 'AddDelegate node created and wired.',
        nodeId: delegateNodeId
      }) as Record<string, unknown>;
    }
    case 'bind_config_property_to_event': {
      const blueprintPath = argsTyped.blueprintPath || (argsRecord.path as string | undefined) || argsTyped.name;
      if (!blueprintPath) {
        return cleanObject({
          success: false,
          error: 'INVALID_BLUEPRINT_PATH',
          message: 'blueprintPath, path, or name is required'
        }) as Record<string, unknown>;
      }

      const sectionKey = extractString(argsRecord.sectionKey) || extractString(argsRecord.section);
      const propertyKey = extractString(argsRecord.propertyKey) || extractString(argsRecord.key);
      const eventName = extractString(argsRecord.eventName);

      if (!sectionKey || !propertyKey || !eventName) {
        return cleanObject({
          success: false,
          error: 'INVALID_ARGUMENT',
          message: 'bind_config_property_to_event requires sectionKey, propertyKey, and eventName.'
        }) as Record<string, unknown>;
      }

      // Note: Full correct wiring requires knowledge of specific project lookup functions
      // (like Conv_ConfigPropertySectionToConfigProperty). We can delegate to C++ if it has "create_config_binding_cluster"
      // or implement the orchestrator here.
      const res = await executeAutomationRequest(tools, 'manage_blueprint_graph', {
         subAction: 'create_config_binding_cluster',
         blueprintPath,
         assetPath: blueprintPath,
         graphName: argsTyped.graphName,
         section: sectionKey,
         propertyName: propertyKey,
         customEventName: eventName,
         posX: argsRecord.posX,
         posY: argsRecord.posY
      }) as Record<string, unknown>;

      return cleanObject(res) as Record<string, unknown>;
    }
    case 'find_call_function_nodes': {


      const blueprintPath = argsTyped.blueprintPath || (argsRecord.path as string | undefined) || argsTyped.name;
      if (!blueprintPath) {
        return cleanObject({
          success: false,
          error: 'INVALID_BLUEPRINT_PATH',
          message: 'blueprintPath, path, or name is required'
        }) as Record<string, unknown>;
      }

      const graphDetails = await getGraphTopologyDetails(
        tools,
        blueprintPath,
        argsTyped.graphName,
        typeof argsRecord.includeSubGraphs === 'boolean' ? argsRecord.includeSubGraphs : false
      );
      const nodes = Array.isArray(graphDetails.nodes) ? graphDetails.nodes as Array<Record<string, unknown>> : [];
      const requestedMemberClass = extractString(argsRecord.memberClass)?.toLowerCase();
      const requestedFunctionName =
        (extractString(argsRecord.functionName) ?? extractString(argsRecord.memberName))?.toLowerCase();

      const matches = nodes.filter((node) => {
        const nodeType = extractString(node.nodeType)?.toLowerCase() ?? '';
        if (!nodeType.includes('k2node_callfunction')) return false;
        const memberClass = extractString(node.memberClass)?.toLowerCase();
        const functionName = extractString(node.functionName)?.toLowerCase();
        if (requestedMemberClass && memberClass !== requestedMemberClass) return false;
        if (requestedFunctionName && functionName !== requestedFunctionName) return false;
        return true;
      });

      return cleanObject({
        success: graphDetails.success !== false,
        blueprintPath,
        graphName: graphDetails.graphName,
        graphPath: graphDetails.graphPath,
        includeSubGraphs: graphDetails.includeSubGraphs,
        count: matches.length,
        nodes: matches,
        message: 'Call-function nodes retrieved.'
      }) as Record<string, unknown>;
    }
    case 'retarget_binding_cluster': {
      const blueprintPath = argsTyped.blueprintPath || (argsRecord.path as string | undefined) || argsTyped.name;
      if (!blueprintPath) {
        return cleanObject({
          success: false,
          error: 'INVALID_BLUEPRINT_PATH',
          message: 'blueprintPath, path, or name is required'
        }) as Record<string, unknown>;
      }

      const targetSection = extractString(argsRecord.newSection) ?? argsTyped.section;
      const targetProperty = extractString(argsRecord.newPropertyName) ?? extractString(argsRecord.propertyName) ?? argsTyped.key;
      const targetType = extractString(argsRecord.newExpectedType) ?? extractString(argsRecord.expectedType);
      if (!targetSection || !targetProperty) {
        return cleanObject({
          success: false,
          error: 'INVALID_ARGUMENT',
          message: 'retarget_binding_cluster requires section/newSection and propertyName/key/newPropertyName.'
        }) as Record<string, unknown>;
      }

      const commentNodeId = extractString(argsRecord.commentNodeId);
      if (!commentNodeId) {
        return cleanObject({
          success: false,
          error: 'INVALID_ARGUMENT',
          message: 'retarget_binding_cluster currently requires commentNodeId.'
        }) as Record<string, unknown>;
      }

      const groups = await getCommentGroups(tools, blueprintPath, argsTyped.graphName);
      const targetGroup = groups.find((group) => extractString(group.commentNodeId) === commentNodeId);
      if (!targetGroup) {
        return cleanObject({
          success: false,
          error: 'COMMENT_GROUP_NOT_FOUND',
          message: `Unable to find comment group '${commentNodeId}'.`
        }) as Record<string, unknown>;
      }

      const nodes = Array.isArray(targetGroup.nodes) ? targetGroup.nodes as Array<Record<string, unknown>> : [];
      const literalUpdates: Array<Record<string, unknown>> = [];
      for (const node of nodes) {
        const nodeId = extractString(node.nodeId);
        const nodeComment = extractString(node.comment)?.toLowerCase() ?? '';
        if (!nodeId) continue;
        if (nodeComment.includes('section literal')) {
          literalUpdates.push({ nodeId, pinName: 'Value', value: targetSection, role: 'section' });
        } else if (nodeComment.includes('property literal')) {
          literalUpdates.push({ nodeId, pinName: 'Value', value: targetProperty, role: 'property' });
        } else if (targetType && nodeComment.includes('type literal')) {
          literalUpdates.push({ nodeId, pinName: 'Value', value: targetType, role: 'type' });
        }
      }

      const batchActions = literalUpdates.map((entry) => ({
        label: `retarget-${entry.role}`,
        action: 'set_pin_default_value',
        args: {
          nodeId: entry.nodeId,
          pinName: entry.pinName,
          value: entry.value
        }
      }));

      if ((argsRecord.dryRun as boolean | undefined) === true) {
        return cleanObject({
          success: true,
          dryRun: true,
          commentNodeId,
          targetSection,
          targetProperty,
          targetType,
          actionCount: batchActions.length,
          actions: batchActions,
          message: 'Prepared binding-cluster retarget actions.'
        }) as Record<string, unknown>;
      }

      const batchResult = await handleBlueprintTools('batch_graph_actions', {
        blueprintPath,
        graphName: argsTyped.graphName,
        actions: batchActions,
        stopOnError: true
      }, tools);

      return cleanObject({
        ...batchResult,
        commentNodeId,
        targetSection,
        targetProperty,
        targetType
      }) as Record<string, unknown>;
    }
    case 'replace_binding_cluster': {
      const blueprintPath = argsTyped.blueprintPath || (argsRecord.path as string | undefined) || argsTyped.name;
      const commentNodeId = extractString(argsRecord.commentNodeId);
      if (!blueprintPath || !commentNodeId) {
        return cleanObject({
          success: false,
          error: 'INVALID_ARGUMENT',
          message: 'replace_binding_cluster requires blueprintPath and commentNodeId.'
        }) as Record<string, unknown>;
      }

      const dryRun = (argsRecord.dryRun as boolean | undefined) === true;
      const duplicatePlan = {
        label: 'duplicate-cluster',
        action: 'duplicate_subgraph',
        args: {
          commentNodeId,
          offsetX: argsRecord.offsetX,
          offsetY: argsRecord.offsetY,
          reconnectExternalLinks: argsTyped.reconnectExternalLinks === true
        }
      };

      if (dryRun) {
        return cleanObject({
          success: true,
          dryRun: true,
          plan: [
            duplicatePlan,
            {
              label: 'retarget-duplicate',
              action: 'retarget_binding_cluster',
              args: {
                commentNodeId: '<new-comment-node>',
                newSection: extractString(argsRecord.newSection) ?? argsTyped.section,
                newPropertyName: extractString(argsRecord.newPropertyName) ?? extractString(argsRecord.propertyName) ?? argsTyped.key,
                newExpectedType: extractString(argsRecord.newExpectedType) ?? extractString(argsRecord.expectedType)
              }
            },
            ...(argsTyped.disableOriginal ? [{
              label: 'disable-original',
              action: 'disable_subgraph',
              args: { commentNodeId, reason: extractString(argsRecord.reason) ?? 'replaced by duplicate cluster' }
            }] : [])
          ],
          message: 'Prepared replace-binding-cluster plan.'
        }) as Record<string, unknown>;
      }

      const duplicateResult = await executeAutomationRequest(tools, 'manage_blueprint_graph', {
        subAction: 'duplicate_subgraph',
        blueprintPath,
        assetPath: blueprintPath,
        graphName: argsTyped.graphName,
        commentNodeId,
        offsetX: argsRecord.offsetX,
        offsetY: argsRecord.offsetY,
        reconnectExternalLinks: argsTyped.reconnectExternalLinks === true
      }) as Record<string, unknown>;

      const duplicatedNodes = Array.isArray(duplicateResult.duplicatedNodes)
        ? duplicateResult.duplicatedNodes as Array<Record<string, unknown>>
        : [];
      const oldToNewNodeIds = (duplicateResult.oldToNewNodeIds && typeof duplicateResult.oldToNewNodeIds === 'object')
        ? duplicateResult.oldToNewNodeIds as Record<string, unknown>
        : {};
      const duplicatedCommentNodeId =
        extractString(oldToNewNodeIds[commentNodeId])
        ?? extractString(duplicatedNodes.find((node) => {
          const nodeType = extractString(node.nodeType)?.toLowerCase() ?? '';
          return nodeType.includes('comment');
        })?.nodeId);

      if (!duplicateResult.success || !duplicatedCommentNodeId) {
        return cleanObject({
          success: false,
          error: 'DUPLICATE_FAILED',
          duplicateResult,
          message: 'Unable to duplicate binding cluster or identify the duplicated comment group.'
        }) as Record<string, unknown>;
      }

      const retargetResult = await handleBlueprintTools('retarget_binding_cluster', {
        blueprintPath,
        graphName: argsTyped.graphName,
        commentNodeId: duplicatedCommentNodeId,
        newSection: extractString(argsRecord.newSection) ?? argsTyped.section,
        newPropertyName: extractString(argsRecord.newPropertyName) ?? extractString(argsRecord.propertyName) ?? argsTyped.key,
        newExpectedType: extractString(argsRecord.newExpectedType) ?? extractString(argsRecord.expectedType)
      }, tools);

      let disableResult: Record<string, unknown> | undefined;
      if (argsTyped.disableOriginal) {
        disableResult = await handleBlueprintTools('disable_subgraph', {
          blueprintPath,
          graphName: argsTyped.graphName,
          commentNodeId,
          reason: extractString(argsRecord.reason) ?? 'replaced by duplicate cluster',
          statusTag: extractString(argsRecord.statusTag) ?? 'disabled'
        }, tools);
      }

      return cleanObject({
        success: duplicateResult.success !== false && retargetResult.success !== false && (disableResult?.success !== false),
        originalCommentNodeId: commentNodeId,
        duplicatedCommentNodeId,
        reconnectExternalLinks: argsTyped.reconnectExternalLinks === true,
        duplicateResult,
        retargetResult,
        disableResult
      }) as Record<string, unknown>;
    }
    case 'batch_graph_actions': {
      const blueprintPath = argsTyped.blueprintPath || (argsRecord.path as string | undefined) || argsTyped.name;
      const actions = Array.isArray(argsTyped.actions)
        ? argsTyped.actions.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
        : [];
      if (actions.length === 0) {
        return cleanObject({
          success: false,
          error: 'INVALID_ARGUMENT',
          message: 'batch_graph_actions requires a non-empty actions array.'
        }) as Record<string, unknown>;
      }

      const stopOnError = argsTyped.stopOnError !== false;
      const dryRun = (argsRecord.dryRun as boolean | undefined) === true;
      const sharedContext: Record<string, unknown> = {
        blueprintPath,
        assetPath: argsRecord.assetPath || blueprintPath,
        path: argsRecord.path,
        name: argsTyped.name,
        graphName: argsTyped.graphName,
        timeoutMs: argsTyped.timeoutMs
      };
      const planned = actions.map((step, index) => {
        const stepAction = typeof step.action === 'string' ? step.action.trim() : '';
        const stepArgs = (step.args && typeof step.args === 'object' && !Array.isArray(step.args))
          ? step.args as Record<string, unknown>
          : step;
        const label = typeof step.label === 'string' && step.label.trim().length > 0
          ? step.label.trim()
          : typeof step.name === 'string' && step.name.trim().length > 0
            ? step.name.trim()
            : `${index}:${stepAction || 'unknown'}`;
        return {
          index,
          label,
          action: stepAction,
          args: {
            ...sharedContext,
            ...stepArgs,
            action: stepAction
          }
        };
      });

      if (dryRun) {
        return cleanObject({
          success: true,
          dryRun: true,
          stopOnError,
          actionCount: actions.length,
          plan: planned,
          message: `Prepared ${actions.length} blueprint graph actions without executing them.`
        }) as Record<string, unknown>;
      }

      const results: Array<Record<string, unknown>> = [];
      const sharedResults: Record<string, unknown> = {};
      for (let index = 0; index < actions.length; index += 1) {
        const step = actions[index];
        const stepAction = typeof step.action === 'string' ? step.action.trim() : '';
        const stepArgs = (step.args && typeof step.args === 'object' && !Array.isArray(step.args))
          ? step.args as Record<string, unknown>
          : step;
        const label = typeof step.label === 'string' && step.label.trim().length > 0
          ? step.label.trim()
          : typeof step.name === 'string' && step.name.trim().length > 0
            ? step.name.trim()
            : `${index}:${stepAction || 'unknown'}`;

        if (!stepAction) {
          const errorResult = cleanObject({
            success: false,
            error: 'INVALID_BATCH_ACTION',
            index,
            label,
            message: 'Each batch action requires an action string.'
          }) as Record<string, unknown>;
          results.push(errorResult);
          sharedResults[label] = errorResult;
          if (stopOnError) {
            return cleanObject({
              success: false,
              error: 'BATCH_ACTION_FAILED',
              index,
              label,
              stopOnError,
              results,
              sharedResults,
              message: 'Blueprint graph batch halted because an entry was missing its action.'
            }) as Record<string, unknown>;
          }
          continue;
        }

        const mergedStepArgs: Record<string, unknown> = {
          ...sharedContext,
          ...stepArgs,
          action: stepAction
        };
        const stepResult = await handleBlueprintTools(stepAction, mergedStepArgs, tools);
        const normalizedStepResult = cleanObject({ index, label, action: stepAction, ...stepResult }) as Record<string, unknown>;
        results.push(normalizedStepResult);
        sharedResults[label] = normalizedStepResult;
        if (stepResult.success === false && stopOnError) {
          return cleanObject({
            success: false,
            error: 'BATCH_ACTION_FAILED',
            index,
            label,
            stopOnError,
            results,
            sharedResults,
            message: `Blueprint graph batch halted at step ${index} (${label}).`
          }) as Record<string, unknown>;
        }
      }

      return cleanObject({
        success: results.every((entry) => entry.success !== false),
        dryRun: false,
        stopOnError,
        actionCount: actions.length,
        results,
        sharedResults,
        message: `Processed ${actions.length} blueprint graph actions.`
      }) as Record<string, unknown>;
    }
    case 'create': {
      // Support 'path' or 'blueprintPath' argument by splitting it into name and savePath if not provided
      let name = argsTyped.name;
      let savePath = argsTyped.savePath;
      const pathArg = (argsRecord.path as string | undefined) || argsTyped.blueprintPath;

      if (pathArg) {
        // If name is provided, treat path as the savePath directly
        // If name is NOT provided, parse path to extract name and savePath
        if (name) {
          // Name provided: use path as savePath
          savePath = pathArg;
        } else {
          // Name not provided: extract name from path
          const parts = pathArg.split('/');
          name = parts.pop(); // The last part is the name
          savePath = parts.join('/');
        }
      }

      if (!savePath) savePath = '/Game';

      if (!name || (typeof name !== 'string') || name.trim() === '') {
        throw new Error('Missing or invalid required parameter: name (must be a non-empty string for create action)');
      }

      const res = await executeAutomationRequest(tools, 'blueprint_create', {
        name: name,
        blueprintType: argsTyped.blueprintType,
        savePath: savePath,
        parentClass: argsRecord.parentClass as string | undefined,
        properties: argsTyped.properties,
        timeoutMs: argsRecord.timeoutMs as number | undefined,
        waitForCompletion: argsRecord.waitForCompletion as boolean | undefined,
        waitForCompletionTimeoutMs: argsRecord.waitForCompletionTimeoutMs as number | undefined
      }) as Record<string, unknown>;
      return cleanObject(res);
    }
    case 'ensure_exists': {
      const target = argsTyped.name || argsTyped.blueprintPath || (argsRecord.path as string) || '';
      const res = await executeAutomationRequest(tools, 'blueprint_exists', {
        blueprintCandidates: [target],
        requestedPath: target,
        timeoutMs: argsRecord.timeoutMs as number | undefined,
        shouldExist: argsTyped.shouldExist !== false
      }) as Record<string, unknown>;
      return cleanObject(res);
    }
    case 'add_variable': {
      const res = await executeAutomationRequest(tools, 'blueprint_add_variable', {
        blueprintCandidates: [argsTyped.name || argsTyped.blueprintPath || (argsRecord.path as string) || ''],
        requestedPath: argsTyped.name || argsTyped.blueprintPath || (argsRecord.path as string) || '',
        variableName: argsTyped.variableName ?? '',
        variableType: (argsRecord.variableType as string) ?? 'Boolean',
        defaultValue: argsRecord.defaultValue,
        category: argsRecord.category as string | undefined,
        isReplicated: argsRecord.isReplicated as boolean | undefined,
        isPublic: argsRecord.isPublic as boolean | undefined,
        variablePinType: (typeof argsRecord.variablePinType === 'object' && argsRecord.variablePinType !== null ? argsRecord.variablePinType : undefined) as Record<string, unknown> | undefined,
        timeoutMs: argsRecord.timeoutMs as number | undefined,
        waitForCompletion: argsRecord.waitForCompletion as boolean | undefined,
        waitForCompletionTimeoutMs: argsRecord.waitForCompletionTimeoutMs as number | undefined
      }) as Record<string, unknown>;
      return cleanObject(res);
    }
    case 'set_variable_metadata': {
      const res = await executeAutomationRequest(tools, 'blueprint_set_variable_metadata', {
        blueprintCandidates: [argsTyped.name || argsTyped.blueprintPath || (argsRecord.path as string) || ''],
        requestedPath: argsTyped.name || argsTyped.blueprintPath || (argsRecord.path as string) || '',
        variableName: argsTyped.variableName ?? '',
        metadata: argsTyped.metadata ?? {},
        timeoutMs: argsRecord.timeoutMs as number | undefined
      }) as Record<string, unknown>;
      return cleanObject(res);
    }
    case 'remove_variable': {
      const res = await executeAutomationRequest(tools, 'blueprint_remove_variable', {
        blueprintCandidates: [argsTyped.name || argsTyped.blueprintPath || (argsRecord.path as string) || ''],
        requestedPath: argsTyped.name || argsTyped.blueprintPath || (argsRecord.path as string) || '',
        variableName: argsTyped.variableName ?? '',
        timeoutMs: argsRecord.timeoutMs as number | undefined,
        waitForCompletion: argsRecord.waitForCompletion as boolean | undefined,
        waitForCompletionTimeoutMs: argsRecord.waitForCompletionTimeoutMs as number | undefined
      }) as Record<string, unknown>;
      return cleanObject(res);
    }
    case 'rename_variable': {
      const res = await executeAutomationRequest(tools, 'blueprint_rename_variable', {
        blueprintCandidates: [argsTyped.name || argsTyped.blueprintPath || (argsRecord.path as string) || ''],
        requestedPath: argsTyped.name || argsTyped.blueprintPath || (argsRecord.path as string) || '',
        oldName: (argsRecord.oldName as string) ?? '',
        newName: (argsRecord.newName as string) ?? '',
        timeoutMs: argsRecord.timeoutMs as number | undefined,
        waitForCompletion: argsRecord.waitForCompletion as boolean | undefined,
        waitForCompletionTimeoutMs: argsRecord.waitForCompletionTimeoutMs as number | undefined
      }) as Record<string, unknown>;
      return cleanObject(res);
    }
    case 'set_metadata': {
      const assetPathRaw = typeof (argsRecord.assetPath) === 'string' ? (argsRecord.assetPath as string).trim() : '';
      const blueprintPathRaw = typeof argsTyped.blueprintPath === 'string' ? argsTyped.blueprintPath.trim() : '';
      const nameRaw = typeof argsTyped.name === 'string' ? argsTyped.name.trim() : '';
      const savePathRaw = typeof argsTyped.savePath === 'string' ? argsTyped.savePath.trim() : '';

      let assetPath = assetPathRaw;
      if (!assetPath) {
        if (blueprintPathRaw) {
          assetPath = blueprintPathRaw;
        } else if (nameRaw && savePathRaw) {
          const base = savePathRaw.replace(/\/$/, '');
          assetPath = `${base}/${nameRaw}`;
        }
      }
      if (!assetPath) {
        throw new Error('Invalid parameters: assetPath or blueprintPath or name+savePath required for set_metadata');
      }

      const metadata = (argsTyped.metadata && typeof argsTyped.metadata === 'object') ? argsTyped.metadata : {};
      // Pass all args through to C++ handler, with resolved assetPath and metadata
      const res = await executeAutomationRequest(tools, 'set_metadata', {
        ...args,
        assetPath,
        metadata
      });
      return cleanObject(res) as Record<string, unknown>;
    }
    case 'add_event': {
      const blueprintName = argsTyped.blueprintPath || (argsRecord.path as string | undefined) || argsTyped.name || '';
      const usedNameForBlueprint = !argsTyped.blueprintPath && !(argsRecord.path as string | undefined) && argsTyped.name;

      const res = await executeAutomationRequest(tools, 'blueprint_add_event', {
        blueprintCandidates: [blueprintName],
        requestedPath: blueprintName,
        eventType: argsTyped.eventType ?? 'Custom',
        customEventName: (argsRecord.customEventName as string | undefined) || (!usedNameForBlueprint ? argsTyped.name : undefined),
        parameters: argsRecord.parameters as { name: string; type: string }[] | undefined,
        timeoutMs: argsRecord.timeoutMs as number | undefined,
        waitForCompletion: argsRecord.waitForCompletion as boolean | undefined,
        waitForCompletionTimeoutMs: argsRecord.waitForCompletionTimeoutMs as number | undefined
      }) as Record<string, unknown>;

      if (res && res.success === false) {
        const msg = ((res.message as string) || '').toLowerCase();
        if (msg.includes('already exists') || msg.includes('duplicate')) {
          return cleanObject({
            success: false,
            error: 'EVENT_ALREADY_EXISTS',
            message: res.message || 'Event already exists',
            blueprintName
          });
        }
      }
      return cleanObject(res);
    }
    case 'remove_event': {
      const res = await executeAutomationRequest(tools, 'blueprint_remove_event', {
        blueprintCandidates: [argsTyped.name || argsTyped.blueprintPath || (argsRecord.path as string) || ''],
        requestedPath: argsTyped.name || argsTyped.blueprintPath || (argsRecord.path as string) || '',
        eventName: (argsRecord.eventName as string) ?? '',
        customEventName: argsRecord.customEventName as string | undefined,
        timeoutMs: argsRecord.timeoutMs as number | undefined,
        waitForCompletion: argsRecord.waitForCompletion as boolean | undefined,
        waitForCompletionTimeoutMs: argsRecord.waitForCompletionTimeoutMs as number | undefined
      }) as Record<string, unknown>;
      return cleanObject(res);
    }
    case 'add_function': {
      // Prioritize explicit path for blueprint, allowing 'name' to be function name
      const blueprintName = argsTyped.blueprintPath || (argsRecord.path as string | undefined) || argsTyped.name || '';
      const usedNameForBlueprint = !argsTyped.blueprintPath && !(argsRecord.path as string | undefined) && argsTyped.name;

      const res = await executeAutomationRequest(tools, 'blueprint_add_function', {
        blueprintCandidates: [blueprintName],
        requestedPath: blueprintName,
        functionName: (argsRecord.functionName as string | undefined) || argsTyped.memberName || (!usedNameForBlueprint ? argsTyped.name : undefined) || 'NewFunction',
        inputs: argsRecord.inputs as { name: string; type: string }[] | undefined,
        outputs: argsRecord.outputs as { name: string; type: string }[] | undefined,
        isPublic: argsRecord.isPublic as boolean | undefined,
        category: argsRecord.category as string | undefined,
        timeoutMs: argsRecord.timeoutMs as number | undefined,
        waitForCompletion: argsRecord.waitForCompletion as boolean | undefined,
        waitForCompletionTimeoutMs: argsRecord.waitForCompletionTimeoutMs as number | undefined
      }) as Record<string, unknown>;
      return cleanObject(res);
    }
    case 'add_component': {
      // addComponent internally uses modifyConstructionScript with operation type 'add_component'
      const res = await executeAutomationRequest(tools, 'blueprint_modify_scs', {
        blueprintPath: argsTyped.name || argsTyped.blueprintPath || (argsRecord.path as string) || '',
        operations: [{
          type: 'add_component',
          componentName: argsTyped.componentName ?? '',
          componentClass: argsTyped.componentType || (argsRecord.componentClass as string) || 'SceneComponent',
          attachTo: argsTyped.attachTo,
          transform: argsRecord.transform as Record<string, unknown> | undefined,
          properties: argsTyped.properties
        }],
        compile: argsRecord.applyAndSave as boolean | undefined,
        save: argsRecord.applyAndSave as boolean | undefined,
        timeoutMs: argsRecord.timeoutMs as number | undefined,
        waitForCompletion: argsRecord.waitForCompletion as boolean | undefined,
        waitForCompletionTimeoutMs: argsRecord.waitForCompletionTimeoutMs as number | undefined
      }) as Record<string, unknown>;
      return cleanObject(res);
    }
    case 'modify_scs': {
      const res = await executeAutomationRequest(tools, 'blueprint_modify_scs', {
        blueprintPath: argsTyped.name || argsTyped.blueprintPath || (argsRecord.path as string) || '',
        operations: (argsRecord.operations as Array<Record<string, unknown>>) ?? [],
        compile: argsRecord.applyAndSave as boolean | undefined,
        save: argsRecord.applyAndSave as boolean | undefined,
        timeoutMs: argsRecord.timeoutMs as number | undefined,
        waitForCompletion: argsRecord.waitForCompletion as boolean | undefined,
        waitForCompletionTimeoutMs: argsRecord.waitForCompletionTimeoutMs as number | undefined
      }) as Record<string, unknown>;
      return cleanObject(res);
    }
    case 'set_scs_transform': {
      const loc = argsRecord.location as { x?: number; y?: number; z?: number } | undefined;
      const rot = argsRecord.rotation as { pitch?: number; yaw?: number; roll?: number } | undefined;
      const scl = argsRecord.scale as { x?: number; y?: number; z?: number } | undefined;
      const res = await executeAutomationRequest(tools, 'set_scs_component_transform', {
        blueprint_path: argsTyped.name || argsTyped.blueprintPath || (argsRecord.path as string) || '',
        component_name: argsTyped.componentName ?? '',
        location: loc ? [loc.x ?? 0, loc.y ?? 0, loc.z ?? 0] : undefined,
        rotation: rot ? [rot.pitch ?? 0, rot.yaw ?? 0, rot.roll ?? 0] : undefined,
        scale: scl ? [scl.x ?? 1, scl.y ?? 1, scl.z ?? 1] : undefined,
        timeoutMs: argsRecord.timeoutMs as number | undefined
      }) as Record<string, unknown>;
      return cleanObject(res);
    }
    case 'add_construction_script': {
      const res = await executeAutomationRequest(tools, 'blueprint_add_construction_script', {
        blueprintCandidates: [argsTyped.name || argsTyped.blueprintPath || (argsRecord.path as string) || ''],
        requestedPath: argsTyped.name || argsTyped.blueprintPath || (argsRecord.path as string) || '',
        scriptName: (argsRecord.scriptName as string) ?? '',
        timeoutMs: argsRecord.timeoutMs as number | undefined,
        waitForCompletion: argsRecord.waitForCompletion as boolean | undefined,
        waitForCompletionTimeoutMs: argsRecord.waitForCompletionTimeoutMs as number | undefined
      }) as Record<string, unknown>;
      return cleanObject(res);
    }
    case 'add_node': {
      if ((argsTyped.nodeType === 'CallFunction' || argsTyped.nodeType === 'K2Node_CallFunction') && !(argsRecord.functionName as string | undefined) && !argsTyped.memberName) {
        throw new Error('CallFunction node requires functionName parameter');
      }

      // Map common node aliases to K2Node types
      const nodeAliases: Record<string, string> = {
        'CallFunction': 'K2Node_CallFunction',
        'VariableGet': 'K2Node_VariableGet',
        'VariableSet': 'K2Node_VariableSet',
        'If': 'K2Node_IfThenElse',
        'Branch': 'K2Node_IfThenElse',
        'Switch': 'K2Node_Switch',
        'Select': 'K2Node_Select',
        'Cast': 'K2Node_DynamicCast',
        'CustomEvent': 'K2Node_CustomEvent',
        'Event': 'K2Node_Event',
        'MakeArray': 'K2Node_MakeArray',
        'ForEach': 'K2Node_ForEachElementInEnum' // Note: ForEachLoop is a macro, this is different
      };

      const resolvedNodeType = (argsTyped.nodeType && nodeAliases[argsTyped.nodeType]) || argsTyped.nodeType || 'K2Node_CallFunction';
      const resolvedMemberClass = (argsRecord.memberClass as string | undefined) || (argsRecord.nodeClass as string | undefined);

      // Validation for Event nodes
      if ((resolvedNodeType === 'K2Node_Event' || resolvedNodeType === 'K2Node_CustomEvent') && !(argsRecord.eventName as string | undefined) && !(argsRecord.customEventName as string | undefined) && !argsTyped.name) {
        // Allow 'name' as fallback for customEventName/eventName
        if (!(argsRecord.eventName as string | undefined)) argsRecord.eventName = argsTyped.name;

        if (!(argsRecord.eventName as string | undefined)) {
          throw new Error(`${resolvedNodeType} requires eventName (or customEventName) parameter`);
        }
      }

      const res = await executeAutomationRequest(tools, 'manage_blueprint_graph', {
        subAction: 'create_node',
        assetPath: argsTyped.name || argsTyped.blueprintPath || (argsRecord.path as string) || '',
        nodeType: resolvedNodeType,
        graphName: argsTyped.graphName,
        memberName: argsRecord.functionName as string | undefined,
        variableName: argsTyped.variableName,
        nodeName: argsRecord.nodeName as string | undefined,
        eventName: (argsRecord.eventName as string | undefined) || (argsRecord.customEventName as string | undefined),
        memberClass: resolvedMemberClass,
        posX: argsRecord.posX as number | undefined,
        posY: argsRecord.posY as number | undefined,
        timeoutMs: argsRecord.timeoutMs as number | undefined
      }) as Record<string, unknown>;
      return cleanObject(res);
    }
    case 'add_scs_component': {
      const res = await executeAutomationRequest(tools, 'add_scs_component', {
        blueprint_path: argsTyped.name || argsTyped.blueprintPath || (argsRecord.path as string) || '',
        component_class: (argsRecord.componentClass as string | undefined) || argsTyped.componentType || 'SceneComponent',
        component_name: argsTyped.componentName ?? '',
        mesh_path: argsRecord.meshPath as string | undefined,
        material_path: argsRecord.materialPath as string | undefined,
        timeoutMs: argsRecord.timeoutMs as number | undefined
      }) as Record<string, unknown>;
      return cleanObject(res);
    }
    case 'reparent_scs_component': {
      const res = await executeAutomationRequest(tools, 'reparent_scs_component', {
        blueprint_path: argsTyped.name || argsTyped.blueprintPath || (argsRecord.path as string) || '',
        component_name: argsTyped.componentName ?? '',
        new_parent: (argsRecord.newParent as string) ?? '',
        timeoutMs: argsRecord.timeoutMs as number | undefined
      }) as Record<string, unknown>;
      return cleanObject(res);
    }
    case 'set_scs_property': {
      const res = await executeAutomationRequest(tools, 'set_scs_component_property', {
        blueprint_path: argsTyped.name || argsTyped.blueprintPath || (argsRecord.path as string) || '',
        component_name: argsTyped.componentName ?? '',
        property_name: argsTyped.propertyName ?? '',
        property_value: JSON.stringify({ value: argsRecord.propertyValue }),
        timeoutMs: argsRecord.timeoutMs as number | undefined
      }) as Record<string, unknown>;
      return cleanObject(res);
    }
    case 'remove_scs_component': {
      const res = await executeAutomationRequest(tools, 'remove_scs_component', {
        blueprint_path: argsTyped.name || argsTyped.blueprintPath || (argsRecord.path as string) || '',
        component_name: argsTyped.componentName ?? '',
        timeoutMs: argsRecord.timeoutMs as number | undefined
      }) as Record<string, unknown>;
      return cleanObject(res);
    }
    case 'get_scs': {
      const res = await executeAutomationRequest(tools, 'get_blueprint_scs', {
        blueprint_path: argsTyped.name || argsTyped.blueprintPath || (argsRecord.path as string) || '',
        timeoutMs: argsRecord.timeoutMs as number | undefined
      }) as Record<string, unknown>;
      return cleanObject(res);
    }
    case 'set_default': {
      // Accept 'propertyValue' as alias for 'value' (common caller convention)
      const resolvedValue = argsTyped.value !== undefined ? argsTyped.value : argsRecord.propertyValue;
      const res = await executeAutomationRequest(tools, 'blueprint_set_default', {
        blueprintCandidates: [argsTyped.name || argsTyped.blueprintPath || (argsRecord.path as string) || ''],
        requestedPath: argsTyped.name || argsTyped.blueprintPath || (argsRecord.path as string) || '',
        propertyName: argsTyped.propertyName ?? '',
        value: resolvedValue
      }) as Record<string, unknown>;
      return cleanObject(res);
    }
    case 'compile': {
      const res = await executeAutomationRequest(tools, 'blueprint_compile', {
        requestedPath: argsTyped.name || argsTyped.blueprintPath || (argsRecord.path as string) || '',
        saveAfterCompile: argsRecord.saveAfterCompile as boolean | undefined
      }) as Record<string, unknown>;
      return cleanObject(res);
    }
    case 'probe_handle': {
      const res = await executeAutomationRequest(tools, 'blueprint_probe_subobject_handle', {
        componentClass: (argsRecord.componentClass as string) ?? ''
      }) as Record<string, unknown>;
      return cleanObject(res);
    }
    case 'get': {
      const res = await executeAutomationRequest(tools, 'blueprint_get', {
        blueprintCandidates: [argsTyped.name || argsTyped.blueprintPath || (argsRecord.path as string) || ''],
        requestedPath: argsTyped.name || argsTyped.blueprintPath || (argsRecord.path as string) || '',
        timeoutMs: argsRecord.timeoutMs as number | undefined
      }) as Record<string, unknown>;
      return cleanObject(res);
    }
    case 'get_mod_blueprint_summary': {
      const blueprintPath = argsTyped.blueprintPath || (argsRecord.path as string | undefined) || argsTyped.name || '';
      if (!blueprintPath) {
        return cleanObject({
          success: false,
          error: 'INVALID_BLUEPRINT_PATH',
          message: 'blueprintPath, path, or name is required'
        });
      }

      const variants = deriveBlueprintVariants(blueprintPath);
      const assetInspection = await executeAutomationRequest(tools, 'inspect', {
        action: 'inspect_object',
        objectPath: variants.assetObjectPath,
        detailed: true
      }) as Record<string, unknown>;

      const classInspection = await executeAutomationRequest(tools, 'inspect', {
        action: 'inspect_class',
        className: variants.generatedClassPath
      }) as Record<string, unknown>;

      return cleanObject({
        success: true,
        mountRoot: getMountRoot(String(variants.assetObjectPath)),
        variants,
        assetInspection,
        classInspection
      });
    }
    case 'connect_pins':
    case 'break_pin_links':
    case 'delete_node':
    case 'create_reroute_node':
    case 'set_node_property':
    case 'get_node_details':
    case 'get_pin_details':
    case 'get_graph_details':
    case 'get_nodes':
    case 'create_node':
    case 'list_node_types':
    case 'list_graphs':
    case 'set_pin_default_value':
    case 'list_comment_groups':
    case 'create_comment_group':
    case 'update_comment_group':
    case 'find_nodes':
    case 'disconnect_subgraph':
    case 'disable_subgraph':
    case 'duplicate_subgraph':
    case 'collapse_to_subgraph':
    case 'expand_collapsed_node':
    case 'create_config_binding_cluster': {
      // Normalize blueprintPath to assetPath for C++ handler compatibility
      const blueprintPath = argsTyped.blueprintPath || (argsRecord.path as string | undefined) || argsTyped.name;
      
      // Map TypeScript parameter names to C++ expected names
      // C++ expects: nodeId, fromNodeId, toNodeId, fromPinName, toPinName, value
      // TS uses: nodeGuid, sourceNode, targetNode, sourcePin, targetPin, defaultValue
      const mappedArgs: Record<string, unknown> = { ...args };
      
      // nodeGuid -> nodeId (for delete_node, break_pin_links, set_node_property, get_node_details, get_pin_details, set_pin_default_value)
      if (argsRecord.nodeGuid !== undefined) {
        mappedArgs.nodeId = argsRecord.nodeGuid;
      }
      
      // sourceNode -> fromNodeId, targetNode -> toNodeId (for connect_pins)
      if (argsRecord.sourceNode !== undefined) {
        mappedArgs.fromNodeId = argsRecord.sourceNode;
      }
      if (argsRecord.targetNode !== undefined) {
        mappedArgs.toNodeId = argsRecord.targetNode;
      }
      
      // sourcePin -> fromPinName, targetPin -> toPinName (for connect_pins)
      if (argsRecord.sourcePin !== undefined) {
        mappedArgs.fromPinName = argsRecord.sourcePin;
      }
      if (argsRecord.targetPin !== undefined) {
        mappedArgs.toPinName = argsRecord.targetPin;
      }
      if (argsRecord.fromPin !== undefined) {
        mappedArgs.fromPinName = argsRecord.fromPin;
      }
      if (argsRecord.toPin !== undefined) {
        mappedArgs.toPinName = argsRecord.toPin;
      }
      if (argsRecord.outputPin !== undefined) {
        mappedArgs.fromPinName = argsRecord.outputPin;
      }
      if (argsRecord.inputPin !== undefined) {
        mappedArgs.toPinName = argsRecord.inputPin;
      }
      
      // defaultValue -> value (for set_pin_default_value)
      if (argsRecord.defaultValue !== undefined) {
        mappedArgs.value = argsRecord.defaultValue;
      }

      if (action === 'connect_pins') {
        const { normalized, errors } = normalizeConnectPinsArgs(mappedArgs);
        Object.assign(mappedArgs, normalized);
        if (errors.length > 0) {
          return cleanObject({
            success: false,
            error: 'INVALID_CONNECT_PINS_ARGUMENTS',
            message: errors.join(' '),
            acceptedShapes: [
              'fromNodeId + fromPinName + toNodeId + toPinName',
              'sourceNode + sourcePin + targetNode + targetPin',
              'sourceNodeId + sourcePinName + targetNodeId + targetPinName',
              'sourceNode as "Node.Pin" + targetNode as "Node.Pin"'
            ]
          }) as Record<string, unknown>;
        }
      }
      
      const processedArgs = {
        ...mappedArgs,
        subAction: action,
        // Ensure both blueprintPath and assetPath are set for C++ compatibility
        blueprintPath,
        assetPath: argsRecord.assetPath || blueprintPath
      };
      const res = await executeAutomationRequest(tools, 'manage_blueprint_graph', processedArgs, 'Automation bridge not available for blueprint graph operations');
      return cleanObject(res) as Record<string, unknown>;
    }
    default: {
      // Translate applyAndSave to compile/save flags for modify_scs action
      const processedArgs = { ...args } as Record<string, unknown>;
      if ((argsRecord.action as string | undefined) === 'modify_scs' && argsRecord.applyAndSave === true) {
        processedArgs.compile = true;
        processedArgs.save = true;
      }
      const res = await executeAutomationRequest(tools, 'manage_blueprint', processedArgs, 'Automation bridge not available for blueprint operations');
      return cleanObject(res) as Record<string, unknown>;
    }
  }
}

export async function handleBlueprintGet(args: HandlerArgs, tools: ITools): Promise<Record<string, unknown>> {
  const argsTyped = args as BlueprintArgs;
  const argsRecord = args as Record<string, unknown>;
  
  const res = await executeAutomationRequest(tools, 'blueprint_get', args, 'Automation bridge not available for blueprint operations') as { success?: boolean; message?: string; [key: string]: unknown } | null;
  if (res && res.success) {
    const blueprintPath = argsTyped.blueprintPath || (argsRecord.path as string | undefined) || argsTyped.name;
    // Extract blueprint data from response and wrap in 'blueprint' property for schema compliance
    const { success, message, error, blueprintPath: _, ...blueprintData } = res;
    return cleanObject({
      success,
      message: message || 'Blueprint fetched',
      error,
      blueprintPath: typeof blueprintPath === 'string' ? blueprintPath : undefined,
      // Include blueprint object for schema compliance - contains all blueprint-specific data
      blueprint: Object.keys(blueprintData).length > 0 ? blueprintData : { path: blueprintPath }
    }) as Record<string, unknown>;
  }
  return cleanObject(res) as Record<string, unknown>;
}

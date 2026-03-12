const fs = require('fs');
const path = require('path');

const tsFilePath = path.join('src', 'tools', 'handlers', 'blueprint-handlers.ts');
let tsContent = fs.readFileSync(tsFilePath, 'utf8');

const replacementCode = `
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
      const connectTargetResult = await handleBlueprintTools('connect_pins', {
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
`;

tsContent = tsContent.replace("    case 'find_call_function_nodes': {", replacementCode);
fs.writeFileSync(tsFilePath, tsContent, 'utf8');
console.log("Blueprint handlers patched");

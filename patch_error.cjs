const fs = require('fs');
const path = require('path');
const filePath = path.join('plugins', 'McpAutomationBridge', 'Source', 'McpAutomationBridge', 'Private', 'McpAutomationBridge_BlueprintGraphHandlers.cpp');
let content = fs.readFileSync(filePath, 'utf8');

const oldError = `      SendAutomationError(
          RequestingSocket, RequestId,
          FString::Printf(TEXT("Node type '%s' not found. Use list_node_types "
                               "to see available types."),
                          *NodeType),
          TEXT("NODE_TYPE_NOT_FOUND"));`;

const newError = `      FString SuggestionStr;
      for (int32 i = 0; i < FMath::Min(5, NodeSuggestions.Num()); ++i) {
        SuggestionStr += NodeSuggestions[i] + (i < FMath::Min(5, NodeSuggestions.Num()) - 1 ? TEXT(", ") : TEXT(""));
      }
      FString Msg = FString::Printf(TEXT("Node type '%s' not found."), *NodeType);
      if (!SuggestionStr.IsEmpty()) {
        Msg += FString::Printf(TEXT(" Did you mean: %s?"), *SuggestionStr);
      }
      Msg += TEXT(" Use list_node_types to see available types.");
      SendAutomationError(RequestingSocket, RequestId, Msg, TEXT("NODE_TYPE_NOT_FOUND"));`;

content = content.replace(oldError, newError);
fs.writeFileSync(filePath, content, 'utf8');
console.log("Error patched");

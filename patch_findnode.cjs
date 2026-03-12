const fs = require('fs');
const path = require('path');

const filePath = path.join('plugins', 'McpAutomationBridge', 'Source', 'McpAutomationBridge', 'Private', 'McpAutomationBridge_BlueprintGraphHandlers.cpp');
let content = fs.readFileSync(filePath, 'utf8');

const regex = /auto FindNodeClassByName = \[\]\(const FString &TypeName\) -> UClass \*\s*\{[\s\S]*?return nullptr;\s*\};\n/;
const match = content.match(regex);

if (match) {
  content = content.replace(regex, `
    auto FindNodeClassByName = [](const FString &TypeName, TArray<FString>& OutSuggestions) -> UClass * {
      // First check for aliases
      FString ResolvedName = TypeName;
      if (const FString *Alias = NodeTypeAliases.Find(TypeName)) {
        ResolvedName = *Alias;
      }

      TArray<FString> NamesToTry;
      NamesToTry.Add(ResolvedName);
      NamesToTry.Add(FString::Printf(TEXT("K2Node_%s"), *ResolvedName));
      NamesToTry.Add(FString::Printf(TEXT("UK2Node_%s"), *ResolvedName));
      // Also try the original name if different
      if (ResolvedName != TypeName) {
        NamesToTry.Add(TypeName);
        NamesToTry.Add(FString::Printf(TEXT("K2Node_%s"), *TypeName));
        NamesToTry.Add(FString::Printf(TEXT("UK2Node_%s"), *TypeName));
      }

      for (TObjectIterator<UClass> It; It; ++It) {
        if (!It->IsChildOf(UEdGraphNode::StaticClass()))
          continue;
        if (It->HasAnyClassFlags(CLASS_Abstract))
          continue;

        FString ClassName = It->GetName();
        for (const FString &NameToMatch : NamesToTry) {
          if (ClassName.Equals(NameToMatch, ESearchCase::IgnoreCase)) {
            return *It;
          }
        }

        // Suggestion logic
        if (ClassName.Contains(ResolvedName) || ResolvedName.Contains(ClassName)) {
           OutSuggestions.Add(ClassName);
        }
      }
      return nullptr;
    };
`);
}

content = content.replace(/UClass \*NodeClass = FindNodeClassByName\(NodeType\);/g, `TArray<FString> NodeSuggestions;
    UClass *NodeClass = FindNodeClassByName(NodeType, NodeSuggestions);`);

const errorRegex = /SendAutomationError\(\s*RequestingSocket, RequestId,\s*FString::Printf\(TEXT\("Node type '%s' not found\. Use list_node_types "\\\s*"to see available types\."\),\s*\*NodeType\),\s*TEXT\("NODE_TYPE_NOT_FOUND"\)\);/g;

content = content.replace(errorRegex, `
      FString SuggestionStr;
      for (int32 i = 0; i < FMath::Min(5, NodeSuggestions.Num()); ++i) {
        SuggestionStr += NodeSuggestions[i] + (i < FMath::Min(5, NodeSuggestions.Num()) - 1 ? TEXT(", ") : TEXT(""));
      }
      FString Msg = FString::Printf(TEXT("Node type '%s' not found."), *NodeType);
      if (!SuggestionStr.IsEmpty()) {
        Msg += FString::Printf(TEXT(" Did you mean: %s?"), *SuggestionStr);
      }
      Msg += TEXT(" Use list_node_types to see available types.");
      SendAutomationError(RequestingSocket, RequestId, Msg, TEXT("NODE_TYPE_NOT_FOUND"));
`);

fs.writeFileSync(filePath, content, 'utf8');
console.log("Patched successfully!");

const fs = require('fs');
const path = require('path');
const filePath = path.join('plugins', 'McpAutomationBridge', 'Source', 'McpAutomationBridge', 'Private', 'McpAutomationBridge_BlueprintGraphHandlers.cpp');
let content = fs.readFileSync(filePath, 'utf8');

const regexFuncError = /SendAutomationError\(\s*RequestingSocket, RequestId,\s*FString::Printf\(TEXT\("Function '%s' not found"\),\s*\*MemberName\),\s*TEXT\("FUNCTION_NOT_FOUND"\)\);/g;

content = content.replace(regexFuncError, `
              TArray<FString> FuncSuggestions;
              if (FunctionClass) {
                for (TFieldIterator<UFunction> FuncIt(FunctionClass, EFieldIteratorFlags::IncludeSuper); FuncIt; ++FuncIt) {
                  FString FoundFuncName = FuncIt->GetName();
                  if (FoundFuncName.Contains(MemberName) || MemberName.Contains(FoundFuncName)) {
                    FuncSuggestions.Add(FoundFuncName);
                  }
                }
              }
              FString SuggestionStr;
              for (int32 i = 0; i < FMath::Min(5, FuncSuggestions.Num()); ++i) {
                SuggestionStr += FuncSuggestions[i] + (i < FMath::Min(5, FuncSuggestions.Num()) - 1 ? TEXT(", ") : TEXT(""));
              }
              FString ErrorMsg = FString::Printf(TEXT("Function '%s' not found."), *MemberName);
              if (!SuggestionStr.IsEmpty()) {
                ErrorMsg += FString::Printf(TEXT(" Did you mean: %s?"), *SuggestionStr);
              }
              SendAutomationError(RequestingSocket, RequestId, ErrorMsg, TEXT("FUNCTION_NOT_FOUND"));
`);

const regexStaticFuncError = /SendAutomationError\(\s*RequestingSocket, RequestId,\s*FString::Printf\(\s*TEXT\("Could not find function '%s::%s' for node type '%s'"\),\s*\*ClassName, \*FuncName, \*NodeType\),\s*TEXT\("FUNCTION_NOT_FOUND"\)\);/g;

content = content.replace(regexStaticFuncError, `
        FString SuggestionStr;
        if (ClassObj) {
            TArray<FString> FuncSuggestions;
            for (TFieldIterator<UFunction> FuncIt(ClassObj, EFieldIteratorFlags::IncludeSuper); FuncIt; ++FuncIt) {
              FString FoundFuncName = FuncIt->GetName();
              if (FoundFuncName.Contains(FuncName) || FuncName.Contains(FoundFuncName)) {
                FuncSuggestions.Add(FoundFuncName);
              }
            }
            for (int32 i = 0; i < FMath::Min(5, FuncSuggestions.Num()); ++i) {
              SuggestionStr += FuncSuggestions[i] + (i < FMath::Min(5, FuncSuggestions.Num()) - 1 ? TEXT(", ") : TEXT(""));
            }
        }
        FString ErrorMsg = FString::Printf(TEXT("Could not find function '%s::%s' for node type '%s'."), *ClassName, *FuncName, *NodeType);
        if (!SuggestionStr.IsEmpty()) {
          ErrorMsg += FString::Printf(TEXT(" Did you mean: %s?"), *SuggestionStr);
        }
        SendAutomationError(RequestingSocket, RequestId, ErrorMsg, TEXT("FUNCTION_NOT_FOUND"));
`);

fs.writeFileSync(filePath, content, 'utf8');
console.log("Function error patched 2");
